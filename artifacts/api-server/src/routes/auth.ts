import { Router, type IRouter } from "express";
import crypto from "crypto";
import { ethers } from "ethers";
import { db, krakenOauthStatesTable, verificationsTable, noncesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

  const nonceRecord = await db
    .select()
    .from(noncesTable)
    .where(eq(noncesTable.nonce, nonce))
    .limit(1);

  if (!nonceRecord.length || nonceRecord[0].walletAddress !== walletAddress || nonceRecord[0].used) {
    res.status(400).json({ error: "invalid_nonce", message: "Nonce is invalid or already used" });
    return;
  }

  const storedMessage = nonceRecord[0].message;
  if (!verifySignature(storedMessage, signature, walletAddress)) {
    res.status(401).json({ error: "invalid_signature", message: "Signature does not match the wallet address" });
    return;
  }

  const state = crypto.randomBytes(32).toString("hex");

  await db.insert(krakenOauthStatesTable).values({
    state,
    walletAddress,
    signature,
    nonce,
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

  const { walletAddress } = stateRecord[0];

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

      // Use the token to fetch the Kraken account identifier
      const accountResponse = await fetch("https://api.kraken.com/0/private/GetAccountBalance", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      const accountData = await accountResponse.json() as { result?: object; error?: string[] };
      if (accountData.error?.length) {
        res.status(400).json({ error: "account_fetch_failed", message: "Failed to retrieve Kraken account info" });
        return;
      }
      // Derive a stable opaque ID from the access token (Kraken doesn't expose a numeric user ID in basic OAuth)
      krakenAccountId = `kraken_${crypto.createHash("sha256").update(tokenData.access_token).digest("hex").slice(0, 24)}`;
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

  const redirectUrl = `${FRONTEND_URL}?krakenLinked=true&walletAddress=${encodeURIComponent(walletAddress)}`;
  res.redirect(302, redirectUrl);
});

export default router;
