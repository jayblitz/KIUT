/**
 * One-time migration: normalize all wallet_address values to lowercase.
 *
 * Run this script BEFORE applying the schema check constraints that enforce
 * `wallet_address = lower(wallet_address)`. If any mixed-case rows exist,
 * the schema push will fail until the data is cleaned.
 *
 * Usage:
 *   DATABASE_URL=<url> npx tsx lib/db/src/migrate-wallet-normalization.ts
 *
 * The script is idempotent: running it multiple times is safe.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function run() {
  console.log("Starting wallet address normalization migration...");

  await db.transaction(async (tx) => {
    // ── 1. Normalize nonces ──────────────────────────────────────────────────
    // All nonces with a non-lowercase wallet address can simply be updated
    // because the nonce PK is `id` (serial), so there is no conflict risk.
    const noncesResult = await tx.execute(
      sql`UPDATE nonces
          SET wallet_address = lower(wallet_address)
          WHERE wallet_address <> lower(wallet_address)`,
    );
    console.log(`Nonces normalized: ${noncesResult.rowCount ?? 0} rows updated`);

    // ── 2. Resolve duplicate verifications ───────────────────────────────────
    // Because wallet_address is the PK, two rows like "0xABC" and "0xabc"
    // cannot exist simultaneously in a healthy DB. However, to guard against
    // any edge cases (e.g. old data restored from backup), we identify groups
    // that would collide after lowercasing and keep the most-advanced row.
    //
    // Priority order (highest first):
    //   attested (attestation_uid IS NOT NULL and <> 'pending') > pending > minted > linked
    const dupes = await tx.execute<{
      lower_addr: string;
      count: string;
    }>(
      sql`SELECT lower(wallet_address) AS lower_addr, count(*) AS count
          FROM verifications
          GROUP BY lower(wallet_address)
          HAVING count(*) > 1`,
    );

    if (dupes.rows.length > 0) {
      console.log(`Found ${dupes.rows.length} collision group(s) to resolve...`);

      for (const group of dupes.rows) {
        const addr = group.lower_addr;
        console.log(`  Resolving collisions for ${addr}...`);

        // Select all rows in this collision group, ordered by advancement.
        const rows = await tx.execute<{
          wallet_address: string;
          attestation_uid: string | null;
          has_minted: boolean;
          kraken_account_id: string;
        }>(
          sql`SELECT wallet_address, attestation_uid, has_minted, kraken_account_id
              FROM verifications
              WHERE lower(wallet_address) = ${addr}
              ORDER BY
                CASE
                  WHEN attestation_uid IS NOT NULL AND attestation_uid <> 'pending' THEN 0
                  WHEN attestation_uid = 'pending' THEN 1
                  WHEN has_minted = true THEN 2
                  ELSE 3
                END,
                created_at ASC`,
        );

        // The first row is the most advanced (highest priority to keep).
        const [keeper, ...losers] = rows.rows;
        console.log(`    Keeping: ${keeper.wallet_address} (attestation_uid=${keeper.attestation_uid})`);

        // Delete losing rows first to avoid PK conflicts on the rename.
        for (const loser of losers) {
          console.log(`    Deleting: ${loser.wallet_address}`);
          await tx.execute(
            sql`DELETE FROM nonces WHERE wallet_address = ${loser.wallet_address}`,
          );
          await tx.execute(
            sql`DELETE FROM verifications WHERE wallet_address = ${loser.wallet_address}`,
          );
        }

        // Rename the keeper to the canonical lowercase address if needed.
        if (keeper.wallet_address !== addr) {
          console.log(`    Renaming: ${keeper.wallet_address} → ${addr}`);
          await tx.execute(
            sql`UPDATE nonces SET wallet_address = ${addr} WHERE wallet_address = ${keeper.wallet_address}`,
          );
          await tx.execute(
            sql`UPDATE verifications SET wallet_address = ${addr} WHERE wallet_address = ${keeper.wallet_address}`,
          );
        }
      }
    } else {
      console.log("No collision groups found in verifications.");
    }

    // ── 3. Normalize any remaining non-lowercase verifications ───────────────
    // After resolving collisions above, each lower-case address has at most
    // one row in the table. Safely rename them now.
    const verResult = await tx.execute(
      sql`UPDATE verifications
          SET wallet_address = lower(wallet_address)
          WHERE wallet_address <> lower(wallet_address)`,
    );
    console.log(`Verifications normalized: ${verResult.rowCount ?? 0} rows updated`);
  });

  console.log("Migration complete. You can now safely apply the schema check constraints.");
  await pool.end();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
