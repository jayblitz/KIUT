# Threat Model

## Project Overview

 KIUT is a TypeScript monorepo for issuing a soulbound NFT that is meant to prove a user is a verified unique human on Inkonchain. The production system consists of a React/Vite frontend (`artifacts/kiut`) and an Express API (`artifacts/api-server`) backed by PostgreSQL (`lib/db`) plus external Kraken OAuth and Inkonchain/EAS integrations. Users prove wallet control by signing an EIP-191 message, link a Kraken account through OAuth, receive an EAS attestation, and then mint a KIUT NFT through a backend-authorized smart contract. The repository also includes a demo fallback for missing Kraken/EAS configuration; that behavior is acceptable for preview environments only and must be treated as out of scope for production deployments.

The mockup sandbox artifact is development-only and should be ignored for production scans unless a production routing path is introduced.

## Assets

- **Wallet ownership proofs** — signed EIP-191 messages and nonce records are the application's proof that a caller controls a wallet. Reuse or forgery would let an attacker act for another wallet inside the verification flow.
- **Kraken identity linkage** — the mapping from wallet address to Kraken-backed identity is the core anti-Sybil claim of the product. If it can be spoofed, replayed, or duplicated across wallets, the “unique human” guarantee fails.
- **Mint authorization secrets** — the backend minter key and the off-chain signatures it produces authorize on-chain NFT minting. Compromise or misuse would allow unauthorized minting.
- **Verification records** — the `verifications`, `nonces`, and `kraken_oauth_states` tables define whether a wallet is verified, attested, and minted. Corruption or disclosure can break authorization and privacy guarantees.
- **Operational secrets** — `KRAKEN_CLIENT_SECRET`, `EAS_SIGNER_PRIVATE_KEY`, `NFT_MINTER_PRIVATE_KEY`, and `DATABASE_URL` allow privileged access to external systems and the database.

## Trust Boundaries

- **Browser / wallet → API** — the client is untrusted. Every wallet address, signature, nonce, attestation UID, and tx hash sent to the API must be validated server-side.
- **API → PostgreSQL** — the API treats database state as the durable source of truth for nonces, OAuth state, verification state, and mint status.
- **API → Kraken OAuth** — the API exchanges an OAuth code for Kraken credentials and derives the linked account identity. OAuth state and redirect handling must resist replay and account-mixup.
- **API → Inkonchain / EAS** — the API reads chain state, submits attestations, and verifies mint receipts. Chain data must be treated as authoritative for mint outcomes.
- **Backend signer → smart contract** — the contract trusts only signatures from the configured minter signer. The backend must only produce those signatures for legitimately verified wallets.
- **Public / authenticated-like flow boundary** — there is no traditional user session. Sensitive actions rely on wallet signatures, OAuth state, and database state transitions instead.

## Scan Anchors

- Production entry points: `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/*.ts`.
- Highest-risk code areas: `routes/auth.ts`, `routes/verify.ts`, `routes/nft.ts`, `contracts/kiut-nft/contracts/KiutSoulbound.sol`, DB schema under `lib/db/src/schema/`, especially `nonces.ts`, `kraken-oauth-states.ts`, and `verifications.ts`.
- Public surfaces: `/api/verify/sign-message`, `/api/auth/kraken/start`, `/api/auth/kraken/callback`, `/api/nft/mint`, `/api/nft/status/:walletAddress`, `/nft/metadata/:tokenId`, and `/badge/:tokenId`.
- Dev-only area usually out of scope: `artifacts/mockup-sandbox/`.
- The app is not currently deployed, but scans should evaluate code paths that would matter in a future public production deployment.

## Threat Categories

### Spoofing

The project uses signed wallet messages instead of server sessions, so spoofing risk centers on replayed signatures, stale nonces, and weak OAuth state handling. The system must ensure every wallet-linked action is tied to a fresh, single-use proof of wallet control, that nonce and OAuth-state material expires promptly, and that Kraken callbacks cannot be replayed or mixed across users.

### Tampering

Attackers can send arbitrary wallet addresses, attestation UIDs, and transaction hashes to the API. The backend must derive security-critical state from trusted sources only, reject client attempts to override verification state, keep database state transitions atomic so concurrent requests cannot create inconsistent verification or mint records, and prevent multiple valid challenges for the same wallet from triggering duplicate backend-funded attestations.

### Information Disclosure

The API exposes some public blockchain-related state by design, but secrets, OAuth tokens, and private verification metadata must never be logged or returned to arbitrary callers. Public badge and status endpoints must not reveal more than is intentionally public from the NFT itself; in particular, attestation handles or third-party identity linkage data should be treated as sensitive unless the product explicitly decides those identifiers are public. Error messages and logs must avoid leaking internal secrets or raw authorization data.

### Denial of Service

Several public routes trigger database writes, external OAuth or RPC calls, cryptographic verification, or blockchain verification work. The production system must prevent cheap unauthenticated abuse from turning these flows into a resource exhaustion vector, especially around nonce issuance, Kraken OAuth state creation, attestation, and mint authorization. Public challenge/state tables must have bounded retention, single-use semantics, and issuance controls so request floods cannot grow persistent storage without limit.

### Elevation of Privilege

 The most important privilege boundary is the claim that one real Kraken-backed human receives one authoritative on-chain identity proof. The backend and contract must enforce that only legitimately verified wallets can receive mint authorizations, that replayed or duplicated identity linkages are rejected, that any preview/demo verification path is impossible in production, that attestation issuance fails closed when the backend signer is unavailable, and that once a Kraken identity has been used to produce a non-revocable proof it cannot be silently freed for reuse on another wallet without revocation or equivalent invalidation of the earlier proof.
