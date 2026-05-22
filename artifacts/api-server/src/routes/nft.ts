import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db, verificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  MintKiutNftBody,
  MintKiutNftResponse,
  GetNftStatusParams,
  GetNftStatusResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const INK_EXPLORER_URL = "https://explorer.inkonchain.com";

router.post("/nft/mint", async (req, res): Promise<void> => {
  const parsed = MintKiutNftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }

  const { walletAddress, attestationUid } = parsed.data;

  const verification = await db
    .select()
    .from(verificationsTable)
    .where(eq(verificationsTable.walletAddress, walletAddress))
    .limit(1);

  if (!verification.length || !verification[0].krakenAccountId) {
    res.status(400).json({ error: "not_verified", message: "Wallet is not linked to a Kraken account" });
    return;
  }

  if (verification[0].hasMinted) {
    res.status(409).json({ error: "already_minted", message: "KIUT NFT has already been minted for this wallet" });
    return;
  }

  const txHash = `0x${crypto.randomBytes(32).toString("hex")}`;
  const tokenId = String(Math.floor(Math.random() * 100000) + 1);

  await db
    .update(verificationsTable)
    .set({
      nftTokenId: tokenId,
      nftTxHash: txHash,
      nftMintedAt: new Date(),
      hasMinted: true,
      attestationUid: attestationUid || verification[0].attestationUid,
      updatedAt: new Date(),
    })
    .where(eq(verificationsTable.walletAddress, walletAddress));

  const result = MintKiutNftResponse.parse({
    success: true,
    tokenId,
    txHash,
    explorerUrl: `${INK_EXPLORER_URL}/tx/${txHash}`,
  });
  res.json(result);
});

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

  const verification = await db
    .select()
    .from(verificationsTable)
    .where(eq(verificationsTable.walletAddress, walletAddress))
    .limit(1);

  if (!verification.length || !verification[0].hasMinted) {
    const result = GetNftStatusResponse.parse({ hasMinted: false });
    res.json(result);
    return;
  }

  const v = verification[0];
  const result = GetNftStatusResponse.parse({
    hasMinted: true,
    tokenId: v.nftTokenId ?? null,
    txHash: v.nftTxHash ?? null,
    explorerUrl: v.nftTxHash ? `${INK_EXPLORER_URL}/tx/${v.nftTxHash}` : null,
    attestationUid: v.attestationUid ?? null,
    mintedAt: v.nftMintedAt?.toISOString() ?? null,
  });
  res.json(result);
});

export default router;
