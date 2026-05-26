import { pgTable, text, timestamp, boolean, serial, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const noncesTable = pgTable("nonces", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  nonce: text("nonce").notNull().unique(),
  message: text("message").notNull().default(""),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
}, (t) => [
  check("nonces_wallet_address_lowercase", sql`${t.walletAddress} = lower(${t.walletAddress})`),
]);

export const insertNonceSchema = createInsertSchema(noncesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertNonce = z.infer<typeof insertNonceSchema>;
export type Nonce = typeof noncesTable.$inferSelect;
