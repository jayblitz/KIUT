import { Router, type IRouter } from "express";

const router: IRouter = Router();

// ─── GET /nft/metadata/:tokenId ─────────────────────────────────────────────
// ERC-721 metadata endpoint consumed by wallets and the Inkonchain explorer.
// Mounted at the app root (no /api prefix) to match the on-chain tokenURI:
//   https://kiut.xyz/nft/metadata/:tokenId

router.get("/nft/metadata/:tokenId", (req, res): void => {
  const tokenId = parseInt(req.params.tokenId, 10);
  if (isNaN(tokenId) || tokenId < 1) {
    res.status(400).json({ error: "invalid_token_id", message: "Token ID must be a positive integer" });
    return;
  }

  res.json({
    name: `KIUT #${tokenId}`,
    description:
      "KIUT Soulbound Token — proof of verified Kraken + Inkonchain identity. Non-transferable.",
    image: "https://kiut.xyz/kiut-badge.jpeg",
    external_url: "https://kiut.xyz",
    attributes: [
      { trait_type: "Token Type", value: "Soulbound" },
      { trait_type: "Network", value: "Inkonchain" },
    ],
  });
});

export default router;
