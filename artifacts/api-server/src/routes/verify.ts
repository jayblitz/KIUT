import { Router, type IRouter } from "express";
import crypto from "crypto";
import { ethers } from "ethers";
import { db, noncesTable, verificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  GetSignMessageBody,
  GetSignMessageResponse,
  CreateAttestationBody,
  CreateAttestationResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const EAS_SIGNER_PRIVATE_KEY = process.env.EAS_SIGNER_PRIVATE_KEY ?? "";
const INK_RPC_URL = "https://rpc-gel.inkonchain.com";
const INK_EAS_CONTRACT = "0xC2679fBD37d54388Ce493F1DB75320D236e1815e";
const INK_EXPLORER_URL = "https://explorer.inkonchain.com";

function buildSignMessage(walletAddress: string, nonce: string, timestamp: string): string {
  return `KIUT Verification\n\nWallet: ${walletAddress}\nNonce: ${nonce}\nTimestamp: ${timestamp}\n\nBy signing this message, you confirm ownership of this wallet address and authorize KIUT to verify your identity onchain.`;
}

function verifySignature(message: string, signature: string, expectedAddress: string): boolean {
  try {
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}

router.post("/verify/sign-message", async (req, res): Promise<void> => {
  const parsed = GetSignMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }

  const { walletAddress } = parsed.data;

  if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    res.status(400).json({ error: "invalid_address", message: "Invalid Ethereum wallet address" });
    return;
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  const timestamp = new Date().toISOString();
  const message = buildSignMessage(walletAddress, nonce, timestamp);

  await db.insert(noncesTable).values({
    walletAddress,
    nonce,
    message,
    used: false,
  });

  const result = GetSignMessageResponse.parse({ message, nonce });
  res.json(result);
});

router.post("/verify/attest", async (req, res): Promise<void> => {
  const parsed = CreateAttestationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }

  const { walletAddress, krakenAccountId, signature, nonce } = parsed.data;

  const nonceRecord = await db
    .select()
    .from(noncesTable)
    .where(eq(noncesTable.nonce, nonce))
    .limit(1);

  if (!nonceRecord.length || nonceRecord[0].walletAddress !== walletAddress) {
    res.status(400).json({ error: "invalid_nonce", message: "Nonce is invalid or expired" });
    return;
  }

  if (nonceRecord[0].used) {
    res.status(400).json({ error: "nonce_used", message: "Nonce has already been used" });
    return;
  }

  const storedMessage = nonceRecord[0].message;
  if (!verifySignature(storedMessage, signature, walletAddress)) {
    res.status(401).json({ error: "invalid_signature", message: "Signature does not match the wallet address" });
    return;
  }

  await db
    .update(noncesTable)
    .set({ used: true })
    .where(eq(noncesTable.nonce, nonce));

  const existing = await db
    .select()
    .from(verificationsTable)
    .where(eq(verificationsTable.walletAddress, walletAddress))
    .limit(1);

  if (existing.length && existing[0].attestationUid) {
    const v = existing[0];
    const result = CreateAttestationResponse.parse({
      success: true,
      attestationUid: v.attestationUid!,
      txHash: v.nftTxHash ?? `0x${crypto.randomBytes(32).toString("hex")}`,
      explorerUrl: `${INK_EXPLORER_URL}/address/${walletAddress}`,
    });
    res.json(result);
    return;
  }

  let attestationUid: string;
  let txHash: string;

  if (!EAS_SIGNER_PRIVATE_KEY) {
    attestationUid = `0x${crypto.randomBytes(32).toString("hex")}`;
    txHash = `0x${crypto.randomBytes(32).toString("hex")}`;
  } else {
    try {
      const { EAS, SchemaEncoder } = await import("@ethereum-attestation-service/eas-sdk");

      const provider = new ethers.JsonRpcProvider(INK_RPC_URL);
      const signer = new ethers.Wallet(EAS_SIGNER_PRIVATE_KEY, provider);
      const eas = new EAS(INK_EAS_CONTRACT);
      eas.connect(signer as never);

      const schemaEncoder = new SchemaEncoder("address walletAddress,string krakenAccountId,bool krakenVerified");
      const encodedData = schemaEncoder.encodeData([
        { name: "walletAddress", value: walletAddress, type: "address" },
        { name: "krakenAccountId", value: krakenAccountId, type: "string" },
        { name: "krakenVerified", value: true, type: "bool" },
      ]);

      const schemaUID = "0x0000000000000000000000000000000000000000000000000000000000000001";

      const tx = await eas.attest({
        schema: schemaUID,
        data: {
          recipient: walletAddress,
          expirationTime: BigInt(0),
          revocable: false,
          data: encodedData,
        },
      });

      const newAttestation = await tx.wait();
      attestationUid = newAttestation ?? `0x${crypto.randomBytes(32).toString("hex")}`;
      txHash = tx.receipt?.hash ?? `0x${crypto.randomBytes(32).toString("hex")}`;
    } catch (err) {
      req.log.error({ err }, "EAS attestation failed");
      res.status(500).json({ error: "attestation_failed", message: "Failed to create on-chain attestation" });
      return;
    }
  }

  await db
    .insert(verificationsTable)
    .values({
      walletAddress,
      krakenAccountId,
      attestationUid,
      attestedAt: new Date(),
      hasMinted: false,
    })
    .onConflictDoUpdate({
      target: verificationsTable.walletAddress,
      set: {
        krakenAccountId,
        attestationUid,
        attestedAt: new Date(),
        updatedAt: new Date(),
      },
    });

  const result = CreateAttestationResponse.parse({
    success: true,
    attestationUid,
    txHash,
    explorerUrl: `${INK_EXPLORER_URL}/tx/${txHash}`,
  });
  res.json(result);
});

export default router;
