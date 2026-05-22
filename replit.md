# KIUT — Onchain Identity Verification

A soulbound NFT verification platform. Users connect their Kraken account (via OAuth) and Web3 wallet, sign an EIP-191 message, receive an EAS attestation on Inkonchain, and mint a soulbound NFT proving they are a verified unique human onchain.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/kiut run dev` — run the frontend (Vite dev server)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Required Environment Variables

- `DATABASE_URL` — Postgres connection string (auto-provided by Replit)
- `FRONTEND_URL` — Frontend URL for OAuth redirects (set to the Replit dev domain)
- `KRAKEN_CLIENT_ID` — Kraken OAuth app client ID (optional; demo mode if unset)
- `KRAKEN_CLIENT_SECRET` — Kraken OAuth app client secret (optional)
- `KRAKEN_REDIRECT_URI` — Kraken OAuth redirect URI, must be `{API_URL}/api/auth/kraken/callback`
- `EAS_SIGNER_PRIVATE_KEY` — Private key for signing EAS attestations on Inkonchain (optional; demo mode if unset)

**Demo mode**: If `KRAKEN_CLIENT_ID` or `EAS_SIGNER_PRIVATE_KEY` are not set, the backend simulates Kraken linking and generates fake transaction hashes. The full flow still works end-to-end.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, RainbowKit + wagmi + viem (wallet), TailwindCSS, shadcn/ui
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec at `lib/api-spec/openapi.yaml`)
- Attestation: EAS SDK on Inkonchain (chain ID 57073)

## Where things live

- `lib/api-spec/openapi.yaml` — Single source of truth for the API contract
- `lib/db/src/schema/index.ts` — Drizzle ORM schema (verifications, nonces, kraken_oauth_states)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/kiut/src/components/Wizard.tsx` — 4-step verification wizard
- `artifacts/kiut/src/pages/home.tsx` — Landing page with FAQ accordion
- `artifacts/kiut/src/lib/web3.ts` — Wagmi config + Inkonchain chain definition

## Architecture Decisions

- **Soulbound**: NFTs are non-transferable; enforced at the smart contract level and tracked in DB
- **EIP-191 signing**: Wallet ownership is proven without spending gas
- **EAS attestations**: Onchain attestation on Inkonchain links wallet to verified Kraken identity
- **Demo mode**: Missing credentials trigger stub behavior so the full UX can be previewed without live Kraken/EAS setup
- **OpenAPI-first**: All API types are generated from the spec, keeping frontend and backend in sync

## User Preferences

_Populate as you build._

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after editing `openapi.yaml` to regenerate types and hooks
- Run `pnpm --filter @workspace/db run push` after editing the DB schema
- `FRONTEND_URL` must match the exact origin the Kraken OAuth redirect lands on (no trailing slash)
