import { pgTable, text, timestamp, boolean, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const noncesTable = pgTable("nonces", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  nonce: text("nonce").notNull().unique(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNonceSchema = createInsertSchema(noncesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertNonce = z.infer<typeof insertNonceSchema>;
export type Nonce = typeof noncesTable.$inferSelect;
