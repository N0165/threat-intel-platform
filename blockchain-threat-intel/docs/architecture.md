# System Architecture

## High-Level Diagram

```
                    ┌───────────────────────────────────────────┐
                    │              FRONTEND (Browser)            │
                    │  HTML / CSS / JavaScript                    │
                    │  - Login / Register                         │
                    │  - Submit Threat Report                      │
                    │  - View Threat Intelligence                  │
                    │  - Verify Report                             │
                    │  - Dashboard (Chart.js)                      │
                    └───────────────────┬───────────────────────┘
                                        │ HTTPS / REST (JSON + JWT)
                                        ▼
                    ┌───────────────────────────────────────────┐
                    │           BACKEND API (Node.js/Express)     │
                    │  /register  /login                          │
                    │  /submitThreat  /getThreats                 │
                    │  /verifyThreat/:hash  /stats                │
                    │                                              │
                    │  - JWT authentication                       │
                    │  - bcrypt password hashing                  │
                    │  - express-validator input validation       │
                    │  - Role-based access control                │
                    └───┬───────────────┬───────────────┬────────┘
                        │               │               │
             (metadata) │      (fingerprint)   (full report)
                        ▼               ▼               ▼
           ┌────────────────┐ ┌─────────────────┐ ┌────────────────┐
           │   MongoDB       │ │  Blockchain      │ │     IPFS        │
           │  (fast search,  │ │ (Ethereum /      │ │ (large report   │
           │  dashboards,    │ │  Hardhat local   │ │  JSON storage,  │
           │  filtering)     │ │  network)        │ │  content-       │
           │                 │ │                  │ │  addressed)     │
           │ organizations   │ │ ThreatIntelligence│ │                │
           │ threatreports   │ │ smart contract:   │ │ returns a CID   │
           │                 │ │ - addThreatReport │ │ for each report │
           │                 │ │ - getThreatReports│ │                │
           │                 │ │ - verifyReport    │ │                │
           └────────────────┘ └─────────────────┘ └────────────────┘
```

## Why data is split this way

Blockchains are terrible (slow + expensive) at storing large blobs of text.
So this system follows the standard "on-chain fingerprint, off-chain content"
pattern used by most real-world blockchain data-integrity systems:

1. **Full report content** → stored in **MongoDB** (for fast search/filter/
   dashboards) **and** on **IPFS** (content-addressed, so the CID itself is
   derived from the content — if the content changes, the CID changes).
2. **SHA-256 hash of the report** + the **IPFS CID** + the **organization
   name** → written to the **blockchain**. This is small, cheap, and
   permanent. It's the "tamper-evidence" layer: if anyone edits the
   MongoDB copy, recomputing its hash and comparing it to the blockchain
   record will immediately reveal the mismatch.

## Roles

| Role         | Can submit reports | Can view all reports | Can manage orgs |
|--------------|:------------------:|:---------------------:|:----------------:|
| admin        | ✅                  | ✅                      | ✅ (on-chain registration) |
| organization | ✅                  | ✅                      | ❌ |
| analyst      | ✅                  | ✅                      | ❌ |

Role checks are enforced server-side via the `authorize()` middleware in
`backend/middleware/auth.js`, and the JWT itself is signed by the server so
it can't be forged or altered by the client.

## Request flow: submitting a threat report

1. User logs in → gets a JWT.
2. User fills out the "Submit Threat Report" form → `POST /submitThreat`
   (JWT sent in `Authorization: Bearer <token>` header).
3. Backend validates input (express-validator).
4. Backend builds a canonical JSON object from the report fields and
   computes its SHA-256 hash (`utils/hash.js`).
5. Backend uploads the full report JSON to IPFS → gets back a CID.
6. Backend calls the smart contract's `addThreatReport(reportHash, ipfsHash,
   organizationName)` function, signed with the submitting organization's
   own blockchain wallet (so the chain records who really submitted it).
7. Backend saves the metadata + full content + `reportHash` + `ipfsHash` +
   `blockchainTxHash` into MongoDB.
8. Backend returns the hash/CID/tx hash to the frontend, which displays them
   so the user has proof their submission is now on-chain.

## Request flow: verifying a report

1. User pastes a `reportHash` into the "Verify Report" page →
   `GET /verifyThreat/:reportHash`.
2. Backend calls the smart contract's `verifyReport(reportHash)` view
   function. If the hash isn't found on-chain, verification fails
   immediately — this is the strongest guarantee (the blockchain is the
   ultimate source of truth).
3. If found, backend also fetches the same report from MongoDB and
   **recomputes** its hash locally. If the recomputed hash matches
   `reportHash`, the report is fully verified end-to-end (blockchain +
   database agree). If not, it flags a mismatch (someone tampered with the
   database copy, but the blockchain record — and IPFS copy — remain the
   trustworthy originals).
