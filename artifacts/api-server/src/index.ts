import app from "./app";
import { logger } from "./lib/logger";
import { db, noncesTable, krakenOauthStatesTable } from "@workspace/db";
import { and, eq, lt, isNotNull } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ── Periodic expired-nonce cleanup ───────────────────────────────────────────
// The /verify/sign-message endpoint is public and unauthenticated, so any
// caller can insert nonce rows using arbitrary wallet addresses. Without a
// global cleanup path, expired rows from one-shot random wallets accumulate
// indefinitely; only same-wallet follow-up calls would ever remove them.
// This job purges all expired nonces (expiresAt is set and in the past) every
// 10 minutes, bounding DB growth regardless of traffic pattern.
const NONCE_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

async function deleteExpiredNonces(): Promise<void> {
  try {
    const now = new Date();
    const deleted = await db
      .delete(noncesTable)
      .where(
        and(
          isNotNull(noncesTable.expiresAt),
          lt(noncesTable.expiresAt, now),
          eq(noncesTable.used, false),
        ),
      )
      .returning({ id: noncesTable.id });
    if (deleted.length > 0) {
      logger.info({ count: deleted.length }, "Purged expired nonce rows");
    }
  } catch (err) {
    logger.error({ err }, "Failed to purge expired nonces");
  }
}

async function deleteExpiredOauthStates(): Promise<void> {
  try {
    const now = new Date();
    const deleted = await db
      .delete(krakenOauthStatesTable)
      .where(lt(krakenOauthStatesTable.expiresAt, now))
      .returning({ id: krakenOauthStatesTable.id });
    if (deleted.length > 0) {
      logger.info({ count: deleted.length }, "Purged expired Kraken OAuth state rows");
    }
  } catch (err) {
    logger.error({ err }, "Failed to purge expired Kraken OAuth state rows");
  }
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Run an initial cleanup on startup, then on a recurring interval.
  void deleteExpiredNonces();
  void deleteExpiredOauthStates();
  setInterval(() => void deleteExpiredNonces(), NONCE_CLEANUP_INTERVAL_MS);
  setInterval(() => void deleteExpiredOauthStates(), NONCE_CLEANUP_INTERVAL_MS);
});
