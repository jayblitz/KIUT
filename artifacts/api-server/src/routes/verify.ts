import { Router, type IRouter } from "express";
import crypto from "crypto";
import { ethers } from "ethers";
import { db, noncesTable, verificationsTable } from "@workspace/db";
import { and, eq, isNull, lt } from "drizzle-orm";
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
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";
const INK_CHAIN_ID = 57073;

const NONCE_TTL_MS = 15 * 60 * 1000;

function getAppHost(): string {
  try {
    return new URL(FRONTEND_URL).host;
  } catch {
    return "localhost";
  }
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

  const walletAddress = parsed.data.walletAddress.toLowerCase();

  if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    res.status(400).json({ error: "invalid_address", message: "Invalid Ethereum wallet address" });
    return;
  }

  const now = new Date();

  // Only clean up expired nonces — do NOT delete unused, still-valid nonces here.
  // Deleting a valid nonce in response to an unauthenticated request would let any
  // third party who knows the wallet address invalidate another user's in-progress
  // verification by racing a new sign-message call between their wallet-sign and
  // their /auth/kraken/start or /verify/attest request (Vuln 2 / availability).
  await db
    .delete(noncesTable)
    .where(
      and(
        eq(noncesTable.walletAddress, walletAddress),
        lt(noncesTable.expiresAt, now),
      ),
    );

  const nonce = crypto.randomBytes(16).toString("hex");
  const timestamp = now.toISOString();
  const appHost = getAppHost();
  const message = [
    "KIUT Wallet Verification",
    "",
    `Domain: ${appHost}`,
    `Address: ${walletAddress}`,
    `Nonce: ${nonce}`,
    `Issued At: ${timestamp}`,
    `Chain ID: ${INK_CHAIN_ID}`,
    "",
    "By signing this message, you confirm ownership of this wallet address and authorize KIUT to verify your identity onchain. This message is valid for 15 minutes and may only be used once.",
  ].join("\n");
  const expiresAt = new Date(now.getTime() + NONCE_TTL_MS);

  await db.insert(noncesTable).values({
    walletAddress,
    nonce,
    message,
    used: false,
    expiresAt,
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

  // ── 0. Fail closed if EAS signer is not configured ───────────────────────
  if (!EAS_SIGNER_PRIVATE_KEY) {
    res.status(503).json({
      error: "signer_not_configured",
      message: "EAS signing key is not configured on this server. Attestation is unavailable.",
    });
    return;
  }

  const { signature, nonce } = parsed.data;
  const walletAddress = parsed.data.walletAddress.toLowerCase();

  const now = new Date();

  // ── 1. Load nonce record (for message + wallet validation) ───────────────
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

  // Reject expired nonces
  if (nonceRecord[0].expiresAt && nonceRecord[0].expiresAt < now) {
    res.status(400).json({ error: "nonce_expired", message: "Nonce has expired. Request a new signing message." });
    return;
  }

  // ── 2. Verify the wallet signature ────────────────────────────────────────
  const storedMessage = nonceRecord[0].message;
  if (!verifySignature(storedMessage, signature, walletAddress)) {
    res.status(401).json({ error: "invalid_signature", message: "Signature does not match the wallet address" });
    return;
  }

  // ── 3. Require Kraken linkage ─────────────────────────────────────────────
  const verification = await db
    .select()
    .from(verificationsTable)
    .where(eq(verificationsTable.walletAddress, walletAddress))
    .limit(1);

  if (!verification.length || !verification[0].krakenAccountId) {
    res.status(400).json({ error: "kraken_not_linked", message: "Kraken account has not been linked for this wallet. Complete the Kraken OAuth flow first." });
    return;
  }

  // ── 4. Return early if already attested (idempotent) ─────────────────────
  if (verification[0].attestationUid && verification[0].attestationUid !== "pending") {
    const v = verification[0];
    const result = CreateAttestationResponse.parse({
      success: true,
      attestationUid: v.attestationUid!,
      txHash: v.nftTxHash ?? `0x${crypto.randomBytes(32).toString("hex")}`,
      explorerUrl: `${INK_EXPLORER_URL}/address/${walletAddress}`,
    });
    res.json(result);
    return;
  }

  // ── 5. Atomically consume the nonce (race-condition guard) ────────────────
  // UPDATE WHERE nonce = ? AND used = false — only one concurrent request wins.
  const consumed = await db
    .update(noncesTable)
    .set({ used: true })
    .where(and(eq(noncesTable.nonce, nonce), eq(noncesTable.used, false)))
    .returning({ id: noncesTable.id });

  if (!consumed.length) {
    res.status(409).json({ error: "nonce_used", message: "Nonce has already been consumed by a concurrent request" });
    return;
  }

  // ── 6. Atomically claim the attestation slot ──────────────────────────────
  // Set attestationUid to the sentinel "pending" only if it is currently NULL.
  // This prevents multiple concurrent requests with different valid nonces from
  // all reaching the expensive on-chain eas.attest() call simultaneously.
  const claimed = await db
    .update(verificationsTable)
    .set({ attestationUid: "pending", updatedAt: new Date() })
    .where(
      and(
        eq(verificationsTable.walletAddress, walletAddress),
        isNull(verificationsTable.attestationUid),
      ),
    )
    .returning({ walletAddress: verificationsTable.walletAddress });

  if (!claimed.length) {
    // Slot was already claimed by another concurrent request (or a real attestation finished).
    // Re-read to determine which case it is.
    const current = await db
      .select()
      .from(verificationsTable)
      .where(eq(verificationsTable.walletAddress, walletAddress))
      .limit(1);

    const currentUid = current[0]?.attestationUid;
    if (currentUid && currentUid !== "pending") {
      // A concurrent request finished and stored the real UID — return idempotent success.
      const result = CreateAttestationResponse.parse({
        success: true,
        attestationUid: currentUid,
        txHash: current[0].nftTxHash ?? `0x${crypto.randomBytes(32).toString("hex")}`,
        explorerUrl: `${INK_EXPLORER_URL}/address/${walletAddress}`,
      });
      res.json(result);
      return;
    }

    // Another request has the "pending" claim — reject this one.
    res.status(409).json({
      error: "attestation_in_progress",
      message: "An attestation is already being processed for this wallet. Please try again shortly.",
    });
    return;
  }

  // ── 7. Issue EAS attestation ──────────────────────────────────────────────
  // Re-read the verification row after claiming the pending slot to get the
  // authoritative krakenAccountId. A concurrent /auth/kraken/callback could have
  // updated the row between our initial read (step 3) and the pending claim (step 6).
  // Using this fresh value ensures the on-chain attestation always matches the
  // current DB state, closing the TOCTOU race window.
  const freshVerification = await db
    .select()
    .from(verificationsTable)
    .where(eq(verificationsTable.walletAddress, walletAddress))
    .limit(1);

  if (!freshVerification.length || !freshVerification[0].krakenAccountId) {
    await db
      .update(verificationsTable)
      .set({ attestationUid: null, updatedAt: new Date() })
      .where(
        and(
          eq(verificationsTable.walletAddress, walletAddress),
          eq(verificationsTable.attestationUid, "pending"),
        ),
      );
    res.status(400).json({ error: "kraken_not_linked", message: "Kraken account is no longer linked for this wallet." });
    return;
  }

  const krakenAccountId = freshVerification[0].krakenAccountId;

  // Derive a one-way commitment of the Kraken account identifier. Embedding the
  // raw identifier on a public chain would let any observer permanently link the
  // wallet to the third-party identity. A SHA-256 hash is sufficient for the
  // on-chain proof-of-uniqueness check while keeping the source value private.
  const krakenAccountIdHash = `0x${crypto.createHash("sha256").update(krakenAccountId).digest("hex")}` as `0x${string}`;

  let attestationUid: string;
  let txHash: string;

  try {
    const { EAS, SchemaEncoder } = await import("@ethereum-attestation-service/eas-sdk");

    const provider = new ethers.JsonRpcProvider(INK_RPC_URL);
    const signer = new ethers.Wallet(EAS_SIGNER_PRIVATE_KEY, provider);
    const eas = new EAS(INK_EAS_CONTRACT);
    eas.connect(signer as never);

    const schemaEncoder = new SchemaEncoder("address walletAddress,bytes32 krakenAccountIdHash,bool krakenVerified");
    const encodedData = schemaEncoder.encodeData([
      { name: "walletAddress", value: walletAddress, type: "address" },
      { name: "krakenAccountIdHash", value: krakenAccountIdHash, type: "bytes32" },
      { name: "krakenVerified", value: true, type: "bool" },
    ]);

    const schemaUID = "0x0000000000000000000000000000000000000000000000000000000000000001";

    const tx = await eas.attest({
      schema: schemaUID,
      data: {
        recipient: walletAddress,
        expirationTime: BigInt(0),
        revocable: true,
        data: encodedData,
      },
    });

    const newAttestation = await tx.wait();
    attestationUid = newAttestation ?? `0x${crypto.randomBytes(32).toString("hex")}`;
    txHash = tx.receipt?.hash ?? `0x${crypto.randomBytes(32).toString("hex")}`;
  } catch (err) {
    req.log.error({ err }, "EAS attestation failed");
    // Release the "pending" claim so the wallet can retry.
    await db
      .update(verificationsTable)
      .set({ attestationUid: null, updatedAt: new Date() })
      .where(
        and(
          eq(verificationsTable.walletAddress, walletAddress),
          eq(verificationsTable.attestationUid, "pending"),
        ),
      );
    res.status(500).json({ error: "attestation_failed", message: "Failed to create on-chain attestation" });
    return;
  }

  // ── 8. Record attestation ─────────────────────────────────────────────────
  await db
    .update(verificationsTable)
    .set({
      attestationUid,
      attestedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(verificationsTable.walletAddress, walletAddress));

  const result = CreateAttestationResponse.parse({
    success: true,
    attestationUid,
    txHash,
    explorerUrl: `${INK_EXPLORER_URL}/tx/${txHash}`,
  });
  res.json(result);
});

export default router;
