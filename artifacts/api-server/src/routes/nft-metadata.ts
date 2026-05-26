import { Router, type IRouter } from "express";
import { readFileSync } from "fs";
import { resolve } from "path";
import { generateBadgeSvg } from "../lib/badge-svg";
import { db, verificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// ─── Shared token metadata ─────────────────────────────────────────────────────
// Single source of truth consumed by both the ERC-721 JSON endpoint and the
// Open Graph HTML endpoint.  Keep in sync with the on-chain tokenURI contract.

const PRODUCTION_BASE = "https://kiut.xyz";

const BADGE_DESCRIPTION =
  "Kraken Identity Unified Token — a soulbound NFT certifying you as a verified human on Inkonchain.";

interface TokenMetadata {
  name: string;
  description: string;
  imageUrl: string;
  externalUrl: string;
}

function getTokenMetadata(tokenId: number): TokenMetadata {
  return {
    name: `KIUT #${tokenId}`,
    description: BADGE_DESCRIPTION,
    imageUrl: `${PRODUCTION_BASE}/nft/badge/${tokenId}`,
    externalUrl: `${PRODUCTION_BASE}/badge/${tokenId}`,
  };
}

// ─── OG HTML builder ─────────────────────────────────────────────────────────
// Serves a full HTML page with token-specific Open Graph / Twitter Card tags.
//
// Strategy:
//   1. Load the production-built KIUT index.html (from artifacts/kiut/dist/public)
//      and replace the generic static OG tags with token-specific values.  The SPA
//      bootstrap scripts in the built HTML are preserved so real visitors get the
//      full interactive experience.
//   2. If the build is not available (dev), return a lightweight HTML shell that
//      only carries the meta tags — sufficient for crawlers (which never run JS).

// process.cwd() is artifacts/api-server when the server starts via `pnpm run start`
const KIUT_INDEX_HTML = resolve(process.cwd(), "../kiut/dist/public/index.html");

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function buildBadgeHtml(meta: TokenMetadata): string {
  const title = `${esc(meta.name)} — KIUT`;

  try {
    // ── Production path: inject into the built SPA index.html ──────────────
    // Regex replacements swap the generic static tags for token-specific ones.
    // Because every tag is replaced in-place, first-occurrence rules observed
    // by Twitter/X and OpenGraph crawlers work correctly.
    let html = readFileSync(KIUT_INDEX_HTML, "utf-8");

    html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
    html = html.replace(
      /<meta\s+name="description"[^>]*>/,
      `<meta name="description" content="${esc(meta.description)}" />`,
    );
    html = html.replace(
      /<meta\s+property="og:title"[^>]*>/,
      `<meta property="og:title" content="${esc(meta.name)}" />`,
    );
    html = html.replace(
      /<meta\s+property="og:description"[^>]*>/,
      `<meta property="og:description" content="${esc(meta.description)}" />`,
    );
    html = html.replace(
      /<meta\s+property="og:image"[^>]*>/,
      `<meta property="og:image" content="${esc(meta.imageUrl)}" />`,
    );
    html = html.replace(
      /<meta\s+name="twitter:title"[^>]*>/,
      `<meta name="twitter:title" content="${esc(meta.name)}" />`,
    );
    html = html.replace(
      /<meta\s+name="twitter:description"[^>]*>/,
      `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    );
    html = html.replace(
      /<meta\s+name="twitter:image"[^>]*>/,
      `<meta name="twitter:image" content="${esc(meta.imageUrl)}" />`,
    );

    // Add og:url just before </head> — not present in the static index.html
    html = html.replace(
      "</head>",
      `  <meta property="og:url" content="${esc(meta.externalUrl)}" />\n  </head>`,
    );

    return html;
  } catch {
    // ── Dev / build-not-available fallback ──────────────────────────────────
    // Returns a minimal HTML shell with only the meta tags.  No SPA scripts are
    // included because they require the Vite built assets which are not present.
    // Twitter/X crawlers never execute JS, so this is sufficient for previews.
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
    <title>${title}</title>
    <meta name="description" content="${esc(meta.description)}" />
    <meta name="robots" content="index, follow" />
    <meta property="og:title" content="${esc(meta.name)}" />
    <meta property="og:description" content="${esc(meta.description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${esc(meta.externalUrl)}" />
    <meta property="og:image" content="${esc(meta.imageUrl)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(meta.name)}" />
    <meta name="twitter:description" content="${esc(meta.description)}" />
    <meta name="twitter:image" content="${esc(meta.imageUrl)}" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
  }
}

// ─── GET /badge/:tokenId ──────────────────────────────────────────────────────
// Returns an HTML shell with token-specific Open Graph and Twitter Card meta
// tags so shared badge URLs render rich previews on Twitter/X and other
// social platforms.
//
// In production the response embeds the built KIUT SPA scripts so real visitors
// get the fully interactive experience.  In development (SPA not yet built) a
// lightweight meta-only shell is returned — sufficient for crawler testing.
//
// Mounted at root (no /api prefix) to match the external badge URL:
//   https://kiut.xyz/badge/:tokenId

router.get("/badge/:tokenId", async (req, res): Promise<void> => {
  const tokenId = parseInt(req.params.tokenId, 10);
  if (isNaN(tokenId) || tokenId < 1) {
    res.status(400).send("Invalid token ID");
    return;
  }

  const rows = await db
    .select({ nftTokenId: verificationsTable.nftTokenId })
    .from(verificationsTable)
    .where(eq(verificationsTable.nftTokenId, String(tokenId)))
    .limit(1);

  if (!rows.length) {
    res.status(404).send("Token not found");
    return;
  }

  const meta = getTokenMetadata(tokenId);
  const html = buildBadgeHtml(meta);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  res.send(html);
});

// ─── GET /nft/badge/:tokenId ─────────────────────────────────────────────────
// Serves a unique SVG badge image for each token ID.
// Mounted at root (no /api prefix) — used by on-chain tokenURI on production.

router.get("/nft/badge/:tokenId", async (req, res): Promise<void> => {
  const tokenId = parseInt(req.params.tokenId, 10);
  if (isNaN(tokenId) || tokenId < 1) {
    res.status(400).send("Invalid token ID");
    return;
  }

  const rows = await db
    .select({ nftTokenId: verificationsTable.nftTokenId })
    .from(verificationsTable)
    .where(eq(verificationsTable.nftTokenId, String(tokenId)))
    .limit(1);

  if (!rows.length) {
    res.status(404).send("Token not found");
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

router.get("/nft/metadata/:tokenId", async (req, res): Promise<void> => {
  const tokenId = parseInt(req.params.tokenId, 10);
  if (isNaN(tokenId) || tokenId < 1) {
    res.status(400).json({ error: "invalid_token_id", message: "Token ID must be a positive integer" });
    return;
  }

  const rows = await db
    .select({ nftTokenId: verificationsTable.nftTokenId })
    .from(verificationsTable)
    .where(eq(verificationsTable.nftTokenId, String(tokenId)))
    .limit(1);

  if (!rows.length) {
    res.status(404).json({ error: "token_not_found", message: "Token does not exist" });
    return;
  }

  const meta = getTokenMetadata(tokenId);

  res.json({
    name: meta.name,
    description: meta.description,
    image: meta.imageUrl,
    external_url: meta.externalUrl,
    attributes: [
      { trait_type: "Token Type", value: "Soulbound" },
      { trait_type: "Network", value: "Inkonchain" },
      { trait_type: "Token ID", value: tokenId },
    ],
  });
});

export default router;
