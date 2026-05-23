import { Router, type IRouter } from "express";
import { ethers } from "ethers";
import crypto from "crypto";
import { db, verificationsTable, noncesTable } from "@workspace/db";
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
const INK_RPC = "https://rpc-gel.inkonchain.com";

// Minimal ABI for on-chain reads / log parsing
const KIUT_READ_ABI = [
  "function hasMinted(address) view returns (bool)",
  "function mintFee() view returns (uint256)",
  "event Minted(address indexed to, uint256 indexed tokenId)",
];

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

function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(INK_RPC);
}

// ─── POST /nft/mint ───────────────────────────────────────────────────────────
// Issues a single-use nonce-based backend authorisation.
// Returns {signature, nonce, mintFee, contractAddress}.
// Frontend calls contract.mint(nonce, signature) with {value: mintFee}.

router.post("/nft/mint", async (req, res): Promise<void> => {
  const parsed = MintKiutNftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }

  const { walletAddress, attestationUid } = parsed.data;

  // ── 1. DB identity checks ─────────────────────────────────────────────────
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

  // ── 2. On-chain double-mint guard + live mintFee read ─────────────────────
  let contractAddress: string;
  let mintFeeWei: bigint;
  try {
    contractAddress = getContractAddress();
    const provider = getProvider();
    const contract = new ethers.Contract(contractAddress, KIUT_READ_ABI, provider);

    const [alreadyMinted, liveFee]: [boolean, bigint] = await Promise.all([
      contract.hasMinted(walletAddress) as Promise<boolean>,
      contract.mintFee() as Promise<bigint>,
    ]);

    mintFeeWei = liveFee;

    if (alreadyMinted) {
      // Sync DB if behind
      if (!verification.hasMinted) {
        await db
          .update(verificationsTable)
          .set({ hasMinted: true, updatedAt: new Date() })
          .where(eq(verificationsTable.walletAddress, walletAddress));
      }
      res.status(409).json({ error: "already_minted", message: "KIUT NFT has already been minted for this wallet" });
      return;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: "chain_unavailable", message: `Could not reach Inkonchain: ${msg}` });
    return;
  }

  // DB-level guard as secondary check
  if (verification.hasMinted) {
    res.status(409).json({ error: "already_minted", message: "KIUT NFT has already been minted for this wallet" });
    return;
  }

  // ── 3. Generate single-use nonce ─────────────────────────────────────────
  // bytes32 nonce stored in DB and consumed on confirm. Frontend passes it
  // verbatim to contract.mint(nonce, sig).
  const nonceBytes = crypto.randomBytes(32);
  const nonceHex = "0x" + nonceBytes.toString("hex") as `0x${string}`;

  // Record nonce in DB (reuse noncesTable, message = "mint-auth")
  await db.insert(noncesTable).values({
    walletAddress,
    nonce: nonceHex,
    message: "mint-auth",
    used: false,
  });

  // ── 4. Sign keccak256(abi.encodePacked(contractAddress, walletAddress, nonce)) ──
  // Matches the contract: MessageHashUtils.toEthSignedMessageHash(hash) + ECDSA.recover
  let signature: string;
  try {
    const minterWallet = getMinterWallet();
    const hash = ethers.solidityPackedKeccak256(
      ["address", "address", "bytes32"],
      [contractAddress, walletAddress, nonceHex],
    );
    signature = await minterWallet.signMessage(ethers.getBytes(hash));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: "signer_unavailable", message: msg });
    return;
  }

  // Resolve attestation UID from DB only — never overwrite with client input
  const resolvedAttestationUid = verification.attestationUid ?? attestationUid ?? "";

  const result = MintKiutNftResponse.parse({
    signature,
    nonce: nonceHex,
    mintFee: mintFeeWei.toString(),
    contractAddress,
  });

  // Suppress unused variable warning (attestationUid was validated above)
  void resolvedAttestationUid;

  res.json(result);
});

// ─── POST /nft/confirm ───────────────────────────────────────────────────────
// Called by the frontend after the on-chain tx is mined.
// Verifies the tx receipt on Inkonchain before recording state.

router.post("/nft/confirm", async (req, res): Promise<void> => {
  const parsed = ConfirmNftMintBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }

  const { walletAddress, txHash } = parsed.data;

  // ── 1. Verify DB record exists ────────────────────────────────────────────
  const rows = await db
    .select()
    .from(verificationsTable)
    .where(eq(verificationsTable.walletAddress, walletAddress))
    .limit(1);

  if (!rows.length) {
    res.status(400).json({ error: "not_found", message: "Wallet not found" });
    return;
  }

  // Idempotent — already confirmed
  if (rows[0].hasMinted) {
    res.json(ConfirmNftMintResponse.parse({ success: true }));
    return;
  }

  // ── 2. Verify transaction on-chain ───────────────────────────────────────
  let verifiedTokenId: string;
  try {
    const contractAddress = getContractAddress();
    const provider = getProvider();

    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      res.status(400).json({ error: "tx_not_found", message: "Transaction not found on Inkonchain" });
      return;
    }
    if (receipt.status !== 1) {
      res.status(400).json({ error: "tx_failed", message: "Transaction reverted on-chain" });
      return;
    }

    // Parse the Minted(address indexed to, uint256 indexed tokenId) event
    const iface = new ethers.Interface(KIUT_READ_ABI);
    let foundTokenId: string | null = null;
    let foundRecipient: string | null = null;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== contractAddress.toLowerCase()) continue;
      try {
        const parsedLog = iface.parseLog({ topics: log.topics as string[], data: log.data });
        if (parsedLog && parsedLog.name === "Minted") {
          foundRecipient = parsedLog.args.to as string;
          foundTokenId = (parsedLog.args.tokenId as bigint).toString();
          break;
        }
      } catch {
        // Not a Minted log — continue
      }
    }

    if (!foundTokenId || !foundRecipient) {
      res.status(400).json({ error: "no_mint_event", message: "Transaction does not contain a KIUT Minted event" });
      return;
    }

    if (foundRecipient.toLowerCase() !== walletAddress.toLowerCase()) {
      res.status(400).json({ error: "recipient_mismatch", message: "Minted token recipient does not match wallet" });
      return;
    }

    verifiedTokenId = foundTokenId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: "chain_unavailable", message: `Could not verify on Inkonchain: ${msg}` });
    return;
  }

  // ── 3. Record in DB ───────────────────────────────────────────────────────
  await db
    .update(verificationsTable)
    .set({
      nftTokenId: verifiedTokenId,
      nftTxHash: txHash,
      nftMintedAt: new Date(),
      hasMinted: true,
      updatedAt: new Date(),
    })
    .where(eq(verificationsTable.walletAddress, walletAddress));

  res.json(ConfirmNftMintResponse.parse({ success: true }));
});

// ─── GET /nft/metadata/:tokenId ──────────────────────────────────────────────

router.get("/nft/metadata/:tokenId", async (req, res): Promise<void> => {
  const tokenId = req.params.tokenId;

  if (!tokenId || !/^\d+$/.test(tokenId)) {
    res.status(400).json({ error: "invalid_token_id", message: "Invalid token ID — must be a non-negative integer" });
    return;
  }

  let contractAddress: string;
  try {
    contractAddress = getContractAddress();
  } catch {
    res.status(503).json({ error: "config_missing", message: "Contract address not configured" });
    return;
  }

  const origin = `${req.protocol}://${req.get("host")}`;
  const imageUrl = `${origin}/kiut-badge.jpeg`;
  const explorerUrl = `${INK_EXPLORER_URL}/token/${contractAddress}/instance/${tokenId}`;

  res.json({
    name: `KIUT #${tokenId}`,
    description:
      "Kraken Identity Unified Token — a soulbound NFT certifying you as a verified human on Inkonchain.",
    image: imageUrl,
    tokenId,
    explorerUrl,
    contractAddress,
  });
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
