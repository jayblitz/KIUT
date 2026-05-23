import { Router, type IRouter } from "express";
import { generateBadgeSvg } from "../lib/badge-svg";

const router: IRouter = Router();

// ─── GET /nft/badge/:tokenId ─────────────────────────────────────────────────
// Serves a unique SVG badge image for each token ID.
// Mounted at root (no /api prefix) — used by on-chain tokenURI on production.

router.get("/nft/badge/:tokenId", (req, res): void => {
  const tokenId = parseInt(req.params.tokenId, 10);
  if (isNaN(tokenId) || tokenId < 1) {
    res.status(400).send("Invalid token ID");
    return;
  }

  const svg = generateBadgeSvg(tokenId);
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(svg);
});

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

  const imageUrl = `https://kiut.xyz/nft/badge/${tokenId}`;

  res.json({
    name: `KIUT #${tokenId}`,
    description:
      "KIUT Soulbound Token — proof of verified Kraken + Inkonchain identity. Non-transferable.",
    image: imageUrl,
    external_url: `https://kiut.xyz/badge/${tokenId}`,
    attributes: [
      { trait_type: "Token Type", value: "Soulbound" },
      { trait_type: "Network", value: "Inkonchain" },
      { trait_type: "Token ID", value: tokenId },
    ],
  });
});

export default router;
