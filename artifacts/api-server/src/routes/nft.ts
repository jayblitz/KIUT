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
const INK_RPC = "https://rpc-gel.inkonchain.com";

// Minimal ABI for on-chain reads / log parsing
const KIUT_ABI = [
  "function hasMinted(address) view returns (bool)",
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

function getMintFeeWei(): string {
  // 0.0005 ETH — matches the deployed contract's mintFee
  return ethers.parseEther("0.0005").toString();
}

function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(INK_RPC);
}

// ─── POST /nft/mint ───────────────────────────────────────────────────────────
// Returns a backend-signed authorization. The frontend calls contract.mint(sig).

router.post("/nft/mint", async (req, res): Promise<void> => {
  const parsed = MintKiutNftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }

  const { walletAddress, attestationUid } = parsed.data;

  // ── 1. DB identity check ──────────────────────────────────────────────────
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

  // ── 2. On-chain double-mint guard ─────────────────────────────────────────
  let contractAddress: string;
  try {
    contractAddress = getContractAddress();
    const provider = getProvider();
    const contract = new ethers.Contract(contractAddress, KIUT_ABI, provider);
    const alreadyMinted: boolean = await contract.hasMinted(walletAddress);
    if (alreadyMinted) {
      // Sync DB state if it's behind
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

  // DB-level check as a second guard
  if (verification.hasMinted) {
    res.status(409).json({ error: "already_minted", message: "KIUT NFT has already been minted for this wallet" });
    return;
  }

  // ── 3. Issue backend signature ────────────────────────────────────────────
  // Signs keccak256(abi.encodePacked(contractAddress, walletAddress)) via EIP-191.
  // Matches: MessageHashUtils.toEthSignedMessageHash(hash) + ECDSA.recover in the contract.
  let signature: string;
  try {
    const minterWallet = getMinterWallet();
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

  // Persist attestationUid if updated
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
// Called by the frontend after the on-chain tx is mined.
// Verifies the tx receipt on-chain before recording state.

router.post("/nft/confirm", async (req, res): Promise<void> => {
  const parsed = ConfirmNftMintBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }

  const { walletAddress, txHash, tokenId } = parsed.data;

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

  // ── 2. Verify the transaction on-chain ───────────────────────────────────
  let verifiedTokenId: string;
  try {
    const provider = getProvider();
    const contractAddress = getContractAddress();

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
    const iface = new ethers.Interface(KIUT_ABI);
    let foundTokenId: string | null = null;
    let foundRecipient: string | null = null;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== contractAddress.toLowerCase()) continue;
      try {
        const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
        if (parsed && parsed.name === "Minted") {
          foundRecipient = parsed.args.to as string;
          foundTokenId = (parsed.args.tokenId as bigint).toString();
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

    // Confirm the mint was to the expected wallet
    if (foundRecipient.toLowerCase() !== walletAddress.toLowerCase()) {
      res.status(400).json({ error: "recipient_mismatch", message: "Minted token recipient does not match wallet" });
      return;
    }

    // Use on-chain tokenId (ignore client-supplied value)
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
