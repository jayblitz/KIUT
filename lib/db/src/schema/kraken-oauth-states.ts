import { pgTable, text, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const krakenOauthStatesTable = pgTable("kraken_oauth_states", {
  id: serial("id").primaryKey(),
  state: text("state").notNull().unique(),
  walletAddress: text("wallet_address").notNull(),
  signature: text("signature").notNull(),
  nonce: text("nonce").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertKrakenOauthStateSchema = createInsertSchema(krakenOauthStatesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertKrakenOauthState = z.infer<typeof insertKrakenOauthStateSchema>;
export type KrakenOauthState = typeof krakenOauthStatesTable.$inferSelect;
