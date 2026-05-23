import { pgTable, text, timestamp, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const verificationsTable = pgTable("verifications", {
  walletAddress: text("wallet_address").primaryKey(),
  krakenAccountId: text("kraken_account_id").notNull(),
  attestationUid: text("attestation_uid"),
  attestedAt: timestamp("attested_at", { withTimezone: true }),
  nftTokenId: text("nft_token_id"),
  nftTxHash: text("nft_tx_hash"),
  nftMintedAt: timestamp("nft_minted_at", { withTimezone: true }),
  hasMinted: boolean("has_minted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("verifications_kraken_account_id_unique").on(t.krakenAccountId),
]);

export const insertVerificationSchema = createInsertSchema(verificationsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertVerification = z.infer<typeof insertVerificationSchema>;
export type Verification = typeof verificationsTable.$inferSelect;
