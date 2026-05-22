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

function verifySignature(message: string, signature: string, expectedAddress: string): boolean {
  try {
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}

router.post("/auth/kraken/start", async (req, res): Promise<void> => {
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

  await db
    .update(noncesTable)
    .set({ used: true })
    .where(eq(noncesTable.nonce, nonce));

  let authUrl: string;
  if (!KRAKEN_CLIENT_ID) {
    authUrl = `${FRONTEND_URL}?krakenLinked=true&walletAddress=${encodeURIComponent(walletAddress)}&krakenAccountId=demo_kraken_${walletAddress.slice(2, 8)}`;
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

  let krakenAccountId: string;
  if (!KRAKEN_CLIENT_ID || !KRAKEN_CLIENT_SECRET) {
    krakenAccountId = `demo_kraken_${walletAddress.slice(2, 8)}`;
  } else {
    try {
      const tokenResponse = await fetch("https://api.kraken.com/0/private/GetWebSocketsToken", {
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
      const tokenData = await tokenResponse.json() as { access_token?: string; error?: string };
      if (tokenData.error || !tokenData.access_token) {
        res.status(400).json({ error: "token_exchange_failed", message: "Failed to exchange code for token" });
        return;
      }
      krakenAccountId = `kraken_${crypto.createHash("sha256").update(tokenData.access_token).digest("hex").slice(0, 16)}`;
    } catch {
      res.status(400).json({ error: "token_exchange_failed", message: "Failed to communicate with Kraken" });
      return;
    }
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

  const redirectUrl = `${FRONTEND_URL}?krakenLinked=true&walletAddress=${encodeURIComponent(walletAddress)}&krakenAccountId=${encodeURIComponent(krakenAccountId)}`;
  res.redirect(302, redirectUrl);
});

export default router;
