import { Router, type IRouter } from "express";
import crypto from "crypto";
import { ethers } from "ethers";
import { db, krakenOauthStatesTable, verificationsTable, noncesTable } from "@workspace/db";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import {
  StartKrakenAuthBody,
  StartKrakenAuthResponse,
  KrakenAuthCallbackQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const KRAKEN_CLIENT_ID = process.env.KRAKEN_CLIENT_ID ?? "";
const KRAKEN_CLIENT_SECRET = process.env.KRAKEN_CLIENT_SECRET ?? "";
const KRAKEN_REDIRECT_URI = process.env.KRAKEN_REDIRECT_URI ?? "";
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

// Demo mode is only permitted in non-production environments.
// In production, missing Kraken credentials must fail closed.
const IS_DEMO_MODE = !KRAKEN_CLIENT_ID && process.env.NODE_ENV !== "production";

function verifySignature(message: string, signature: string, expectedAddress: string): boolean {
  try {
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}

router.post("/auth/kraken/start", async (req, res): Promise<void> => {
  // Fail closed if Kraken is not configured in production
  if (!KRAKEN_CLIENT_ID && !IS_DEMO_MODE) {
    res.status(503).json({ error: "not_configured", message: "Kraken OAuth is not configured on this server" });
    return;
  }

  const parsed = StartKrakenAuthBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }

  const { walletAddress, signature, nonce } = parsed.data;

  // Validate the nonce without consuming it. The same (nonce, signature) pair is
  // intentionally reused for both Kraken linkage and the subsequent /verify/attest
  // step; consuming it here would break attestation. Instead we prevent state
  // explosion via one-active-state-per-nonce semantics below.
  const nonceRecord = await db
    .select()
    .from(noncesTable)
    .where(
      and(
        eq(noncesTable.nonce, nonce),
        eq(noncesTable.walletAddress, walletAddress),
        eq(noncesTable.used, false),
        or(
          isNull(noncesTable.expiresAt),
          gt(noncesTable.expiresAt, new Date()),
        ),
      ),
    )
    .limit(1);

  if (!nonceRecord.length) {
    res.status(400).json({ error: "invalid_nonce", message: "Nonce is invalid or already used" });
    return;
  }

  const storedMessage = nonceRecord[0].message;
  if (!verifySignature(storedMessage, signature, walletAddress)) {
    res.status(401).json({ error: "invalid_signature", message: "Signature does not match the wallet address" });
    return;
  }

  const state = crypto.randomBytes(32).toString("hex");
  const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

  // Cap OAuth state lifetime at the nonce's own expiry so the state can never
  // outlive the wallet proof window. e.g. if the nonce expires in 2 minutes,
  // the OAuth state also expires in 2 minutes even though the default TTL is 10.
  const defaultExpiry = new Date(Date.now() + OAUTH_STATE_TTL_MS);
  const nonceExpiry = nonceRecord[0].expiresAt;
  const oauthStateExpiry = nonceExpiry && nonceExpiry < defaultExpiry ? nonceExpiry : defaultExpiry;

  // Enforce one-active-state-per-nonce: delete any existing (possibly stale) OAuth
  // state rows for this nonce before inserting a fresh one. This prevents a caller
  // from accumulating unbounded state rows by replaying the same wallet proof.
  // The nonce is NOT marked used here because the same (nonce, signature) pair must
  // remain valid for the subsequent /verify/attest step.
  await db.delete(krakenOauthStatesTable).where(eq(krakenOauthStatesTable.nonce, nonce));

  await db.insert(krakenOauthStatesTable).values({
    state,
    walletAddress,
    signature,
    nonce,
    expiresAt: oauthStateExpiry,
  });

  let authUrl: string;
  if (IS_DEMO_MODE) {
    // Demo mode (development only): skip Kraken OAuth, create linkage immediately
    const demoKrakenAccountId = `demo_kraken_${walletAddress.slice(2, 8)}`;
    await db
      .insert(verificationsTable)
      .values({ walletAddress, krakenAccountId: demoKrakenAccountId, hasMinted: false })
      .onConflictDoUpdate({
        target: verificationsTable.walletAddress,
        set: { krakenAccountId: demoKrakenAccountId, updatedAt: new Date() },
      });
    authUrl = `${FRONTEND_URL}?krakenLinked=true&walletAddress=${encodeURIComponent(walletAddress)}`;
  } else {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: KRAKEN_CLIENT_ID,
      redirect_uri: KRAKEN_REDIRECT_URI,
      scope: "read:account",
      state,
    });
    authUrl = `https://www.kraken.com/oauth2/authorize?${params.toString()}`;
  }

  const result = StartKrakenAuthResponse.parse({ authUrl, state });
  res.json(result);
});

router.get("/auth/kraken/callback", async (req, res): Promise<void> => {
  // Fail closed if Kraken is not configured in production
  if (!KRAKEN_CLIENT_ID && !IS_DEMO_MODE) {
    res.status(503).json({ error: "not_configured", message: "Kraken OAuth is not configured on this server" });
    return;
  }

  const parsed = KrakenAuthCallbackQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }

  const { code, state } = parsed.data;

  const stateRecord = await db
    .select()
    .from(krakenOauthStatesTable)
    .where(eq(krakenOauthStatesTable.state, state))
    .limit(1);

  if (!stateRecord.length) {
    res.status(400).json({ error: "invalid_state", message: "Invalid or expired OAuth state" });
    return;
  }

  // Reject expired OAuth state tokens
  if (stateRecord[0].expiresAt < new Date()) {
    await db.delete(krakenOauthStatesTable).where(eq(krakenOauthStatesTable.state, state));
    res.status(400).json({ error: "invalid_state", message: "Invalid or expired OAuth state" });
    return;
  }

  const { walletAddress, nonce: storedNonce } = stateRecord[0];

  // Re-validate the underlying wallet proof nonce to ensure the original proof
  // window has not ended. The OAuth state TTL is already capped at nonce expiry
  // at start time, but this check closes any remaining edge (e.g. clock skew,
  // nonce consumed by the concurrent /verify/attest call between start and callback).
  const proofNonce = await db
    .select()
    .from(noncesTable)
    .where(
      and(
        eq(noncesTable.nonce, storedNonce),
        eq(noncesTable.walletAddress, walletAddress),
        or(
          isNull(noncesTable.expiresAt),
          gt(noncesTable.expiresAt, new Date()),
        ),
      ),
    )
    .limit(1);

  if (!proofNonce.length) {
    await db.delete(krakenOauthStatesTable).where(eq(krakenOauthStatesTable.state, state));
    res.status(400).json({ error: "proof_expired", message: "The wallet proof used to start this flow has expired. Please reconnect your wallet." });
    return;
  }

  // Consume the state record immediately to prevent replay
  await db.delete(krakenOauthStatesTable).where(eq(krakenOauthStatesTable.state, state));

  let krakenAccountId: string;
  if (IS_DEMO_MODE) {
    krakenAccountId = `demo_kraken_${walletAddress.slice(2, 8)}`;
  } else {
    try {
      // Kraken OAuth 2.0 token endpoint
      const tokenResponse = await fetch("https://www.kraken.com/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: KRAKEN_CLIENT_ID,
          client_secret: KRAKEN_CLIENT_SECRET,
          redirect_uri: KRAKEN_REDIRECT_URI,
        }).toString(),
      });
      const tokenData = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string };
      if (tokenData.error || !tokenData.access_token) {
        res.status(400).json({ error: "token_exchange_failed", message: tokenData.error_description ?? "Failed to exchange code for token" });
        return;
      }

      // ── Resolve a stable Kraken user identifier ─────────────────────────
      // Strategy 1: OIDC userinfo endpoint (standard, most reliable)
      let stableSub: string | null = null;
      try {
        const userinfoResponse = await fetch("https://www.kraken.com/oauth2/userinfo", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (userinfoResponse.ok) {
          const userinfo = await userinfoResponse.json() as { sub?: string };
          if (typeof userinfo.sub === "string" && userinfo.sub) {
            stableSub = userinfo.sub;
          }
        }
      } catch {
        // userinfo fetch failed — fall through to JWT decoding
      }

      // Strategy 2: Decode JWT access token to extract the sub claim
      if (!stableSub) {
        try {
          const parts = tokenData.access_token.split(".");
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { sub?: string };
            if (typeof payload.sub === "string" && payload.sub) {
              stableSub = payload.sub;
            }
          }
        } catch {
          // JWT decode failed
        }
      }

      // If we still do not have a stable identifier, fail closed.
      // We must not fall back to access-token hashing — it is not stable across re-authorisations.
      if (!stableSub) {
        res.status(400).json({
          error: "identity_unavailable",
          message: "Could not retrieve a stable Kraken account identifier. Please try again.",
        });
        return;
      }

      krakenAccountId = `kraken_${stableSub}`;

      // Verify the token is valid against Kraken's API (proves the OAuth succeeded)
      const accountResponse = await fetch("https://api.kraken.com/0/private/GetAccountBalance", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      const accountData = await accountResponse.json() as { result?: object; error?: string[] };
      if (accountData.error?.length) {
        res.status(400).json({ error: "account_fetch_failed", message: "Failed to verify Kraken account" });
        return;
      }
    } catch {
      res.status(400).json({ error: "token_exchange_failed", message: "Failed to communicate with Kraken" });
      return;
    }
  }

  // ── One-account-per-wallet enforcement ────────────────────────────────────
  // Reject if this Kraken identity is already linked to a different wallet.
  // This enforces the "1 KIUT per Kraken account" invariant at the application layer.
  // The DB unique constraint on kraken_account_id provides a second layer of enforcement.
  const existingLink = await db
    .select({ walletAddress: verificationsTable.walletAddress })
    .from(verificationsTable)
    .where(eq(verificationsTable.krakenAccountId, krakenAccountId))
    .limit(1);

  if (existingLink.length && existingLink[0].walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    // This Kraken account is already bound to another wallet — reject silently via redirect
    const redirectUrl = `${FRONTEND_URL}?krakenError=already_linked&walletAddress=${encodeURIComponent(walletAddress)}`;
    res.redirect(302, redirectUrl);
    return;
  }

  // ── Immutable-attestation guard ────────────────────────────────────────────
  // If this wallet already has an on-chain attestation or has minted an NFT, its
  // Kraken identity is immutably committed. Block any attempt to relink to a new
  // Kraken account; allowing it would free the original Kraken identity for reuse
  // by another wallet, breaking the one-human-per-KIUT invariant.
  const existingVerification = await db
    .select({
      krakenAccountId: verificationsTable.krakenAccountId,
      attestationUid: verificationsTable.attestationUid,
      hasMinted: verificationsTable.hasMinted,
    })
    .from(verificationsTable)
    .where(eq(verificationsTable.walletAddress, walletAddress))
    .limit(1);

  if (existingVerification.length) {
    const existing = existingVerification[0];
    // Treat "pending" as locked: once the attestation claim has been taken (even
    // mid-flight), relinking to a new Kraken account is blocked. This closes the
    // race window where a relink could swap the Kraken identity while attestation
    // is being submitted on-chain.
    const isAttested = !!existing.attestationUid;
    const isMinted = existing.hasMinted;
    const isDifferentKraken = existing.krakenAccountId &&
      existing.krakenAccountId.toLowerCase() !== krakenAccountId.toLowerCase();

    if ((isAttested || isMinted) && isDifferentKraken) {
      // The wallet already has a committed attestation or NFT under a different Kraken
      // identity. Relinking is permanently blocked to preserve the uniqueness guarantee.
      const redirectUrl = `${FRONTEND_URL}?krakenError=already_attested&walletAddress=${encodeURIComponent(walletAddress)}`;
      res.redirect(302, redirectUrl);
      return;
    }
  }

  try {
    await db
      .insert(verificationsTable)
      .values({
        walletAddress,
        krakenAccountId,
        hasMinted: false,
      })
      .onConflictDoUpdate({
        target: verificationsTable.walletAddress,
        set: { krakenAccountId, updatedAt: new Date() },
      });
  } catch (err: unknown) {
    // Handle concurrent unique-constraint violation on kraken_account_id:
    // If two requests race past the existingLink check simultaneously, the DB
    // unique constraint fires. Convert that to a deterministic already_linked
    // redirect rather than letting a raw 500 surface to the user.
    const isUniqueViolation =
      err instanceof Error &&
      (err.message.includes("verifications_kraken_account_id_unique") ||
        err.message.includes("unique constraint") ||
        (err as { code?: string }).code === "23505");
    if (isUniqueViolation) {
      const redirectUrl = `${FRONTEND_URL}?krakenError=already_linked&walletAddress=${encodeURIComponent(walletAddress)}`;
      res.redirect(302, redirectUrl);
      return;
    }
    throw err;
  }

  const redirectUrl = `${FRONTEND_URL}?krakenLinked=true&walletAddress=${encodeURIComponent(walletAddress)}`;
  res.redirect(302, redirectUrl);
});

export default router;
