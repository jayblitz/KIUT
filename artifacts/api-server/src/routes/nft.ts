import { Router, type IRouter } from "express";
import { ethers } from "ethers";
import { db, verificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  MintKiutNftBody,
  MintKiutNftResponse,
  ConfirmNftMintBody,
  ConfirmNftMintResponse,
  GetNftStatusParams,
  GetNftStatusResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const INK_EXPLORER_URL = "https://explorer.inkonchain.com";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMinterWallet(): ethers.Wallet {
  const key = process.env.NFT_MINTER_PRIVATE_KEY;
  if (!key) throw new Error("NFT_MINTER_PRIVATE_KEY is not configured");
  return new ethers.Wallet(key);
}

function getContractAddress(): string {
  const addr = process.env.NFT_CONTRACT_ADDRESS;
  if (!addr) throw new Error("NFT_CONTRACT_ADDRESS is not configured");
  return addr;
}

function getMintFeeWei(): string {
  // 0.0005 ETH – matches the contract's deployed mintFee
  return ethers.parseEther("0.0005").toString();
}

// ─── POST /nft/mint ───────────────────────────────────────────────────────────
// Verifies identity and returns a backend-signed authorisation.
// The frontend calls the contract directly with this signature.

router.post("/nft/mint", async (req, res): Promise<void> => {
  const parsed = MintKiutNftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }

  const { walletAddress, attestationUid } = parsed.data;

  // ── Verify identity ────────────────────────────────────────────────────────
  const rows = await db
    .select()
    .from(verificationsTable)
    .where(eq(verificationsTable.walletAddress, walletAddress))
    .limit(1);

  const verification = rows[0];

  if (!verification || !verification.krakenAccountId) {
    res.status(400).json({ error: "not_verified", message: "Wallet is not linked to a Kraken account" });
    return;
  }

  if (!verification.attestationUid) {
    res.status(400).json({
      error: "not_attested",
      message: "EAS attestation has not been issued. Complete the attestation step first.",
    });
    return;
  }

  if (verification.hasMinted) {
    res.status(409).json({ error: "already_minted", message: "KIUT NFT has already been minted for this wallet" });
    return;
  }

  // ── Issue backend signature ────────────────────────────────────────────────
  let signature: string;
  let contractAddress: string;
  try {
    contractAddress = getContractAddress();
    const minterWallet = getMinterWallet();

    // Sign keccak256(abi.encodePacked(contractAddress, walletAddress)) with EIP-191
    // Matches the contract: MessageHashUtils.toEthSignedMessageHash(hash) + ECDSA.recover
    const hash = ethers.solidityPackedKeccak256(
      ["address", "address"],
      [contractAddress, walletAddress],
    );
    signature = await minterWallet.signMessage(ethers.getBytes(hash));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: "signer_unavailable", message: msg });
    return;
  }

  // Also store the attestation UID if it was provided and differs
  if (attestationUid && attestationUid !== verification.attestationUid) {
    await db
      .update(verificationsTable)
      .set({ attestationUid, updatedAt: new Date() })
      .where(eq(verificationsTable.walletAddress, walletAddress));
  }

  const result = MintKiutNftResponse.parse({
    signature,
    mintFee: getMintFeeWei(),
    contractAddress,
  });
  res.json(result);
});

// ─── POST /nft/confirm ───────────────────────────────────────────────────────
// Called by the frontend after the on-chain mint transaction confirms.
// Records the mint in the database.

router.post("/nft/confirm", async (req, res): Promise<void> => {
  const parsed = ConfirmNftMintBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }

  const { walletAddress, txHash, tokenId } = parsed.data;

  const rows = await db
    .select()
    .from(verificationsTable)
    .where(eq(verificationsTable.walletAddress, walletAddress))
    .limit(1);

  if (!rows.length) {
    res.status(400).json({ error: "not_found", message: "Wallet not found" });
    return;
  }

  if (rows[0].hasMinted) {
    // Idempotent – already recorded
    res.json(ConfirmNftMintResponse.parse({ success: true }));
    return;
  }

  await db
    .update(verificationsTable)
    .set({
      nftTokenId: tokenId,
      nftTxHash: txHash,
      nftMintedAt: new Date(),
      hasMinted: true,
      updatedAt: new Date(),
    })
    .where(eq(verificationsTable.walletAddress, walletAddress));

  res.json(ConfirmNftMintResponse.parse({ success: true }));
});

// ─── GET /nft/status/:walletAddress ─────────────────────────────────────────

router.get("/nft/status/:walletAddress", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.walletAddress)
    ? req.params.walletAddress[0]
    : req.params.walletAddress;

  const params = GetNftStatusParams.safeParse({ walletAddress: raw });
  if (!params.success) {
    res.status(400).json({ error: "invalid_address", message: "Invalid wallet address" });
    return;
  }

  const { walletAddress } = params.data;

  const rows = await db
    .select()
    .from(verificationsTable)
    .where(eq(verificationsTable.walletAddress, walletAddress))
    .limit(1);

  if (!rows.length || !rows[0].hasMinted) {
    res.json(GetNftStatusResponse.parse({ hasMinted: false }));
    return;
  }

  const v = rows[0];
  res.json(
    GetNftStatusResponse.parse({
      hasMinted: true,
      tokenId: v.nftTokenId ?? null,
      txHash: v.nftTxHash ?? null,
      explorerUrl: v.nftTxHash ? `${INK_EXPLORER_URL}/tx/${v.nftTxHash}` : null,
      attestationUid: v.attestationUid ?? null,
      mintedAt: v.nftMintedAt?.toISOString() ?? null,
    }),
  );
});

export default router;
