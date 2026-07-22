# 🛡️ Blockchain-Based Cybersecurity Threat Intelligence Sharing System

A working prototype that lets multiple organizations securely share cyber
threat intelligence (attack type, IOCs, attack vectors, impact, mitigation
steps) using a blockchain so the data is **tamper-proof, transparent, and
trustworthy**.

> Educational / demonstration prototype — built to be simple and readable
> for a cybersecurity & blockchain student, not a hardened production system.
> See "Security notes for students" at the bottom for what a real deployment
> would need to add.

---

## 1. What's inside

```
blockchain-threat-intel/
├── blockchain/            # Solidity smart contract + Hardhat local network
│   ├── contracts/ThreatIntelligence.sol
│   ├── scripts/deploy.js
│   ├── hardhat.config.js
│   └── package.json
├── backend/               # Node.js + Express REST API
│   ├── server.js
│   ├── config/db.js
│   ├── models/            # Mongoose schemas (Organization, ThreatReport)
│   ├── middleware/auth.js # JWT auth + role-based access control
│   ├── routes/            # auth.js (/register /login), threats.js (rest)
│   ├── services/          # blockchain.js (ethers.js), ipfs.js
│   ├── utils/hash.js      # SHA-256 hashing helper
│   └── package.json
├── frontend/              # Plain HTML/CSS/JS dashboard (no build step needed)
│   ├── index.html         # Login / Register
│   ├── submit.html        # Submit Threat Report
│   ├── view.html          # View Threat Intelligence (search/filter)
│   ├── verify.html        # Verify Report integrity
│   ├── dashboard.html     # Stats + Chart.js charts
│   ├── css/style.css
│   └── js/*.js
├── database/schema.sql    # PostgreSQL alt-schema + MongoDB shape reference
├── sample-data/sample_threats.json  # Example reports to try out
└── docs/architecture.md   # Architecture diagram + data flow explanation
```

## 2. Architecture (short version)

```
Browser (HTML/JS) --REST/JWT--> Express API --+--> MongoDB   (fast search/dashboard)
                                               +--> IPFS      (full report storage)
                                               +--> Blockchain (report hash - tamper-proof)
```

Full diagram and explanation: [`docs/architecture.md`](docs/architecture.md)

---

## 3. Prerequisites

Install these once on your machine:

- **Node.js** v18+ and npm (https://nodejs.org)
- **MongoDB** running locally (https://www.mongodb.com/try/download/community)
  or a free MongoDB Atlas cluster
- (Optional) **IPFS Desktop / go-ipfs** — if you skip this, the backend
  automatically falls back to a local "mock IPFS" folder so everything still
  works for a demo. See `backend/services/ipfs.js`.

No real cryptocurrency, testnet faucet, or MetaMask setup is required — we
run a **local Ethereum network** with Hardhat, which gives you fake test
accounts pre-loaded with fake ETH.

---

## 4. Step-by-step setup

### Step 1 — Start MongoDB

```bash
mongod --dbpath /path/to/your/data/folder
# or simply `mongod` if you installed it as a service
```

### Step 2 — Start a local blockchain network

```bash
cd blockchain
npm install
npx hardhat node
```

This starts a local Ethereum node at `http://127.0.0.1:8545` and prints 20
test accounts with private keys. **Leave this terminal running.**

Copy **Account #0's private key** — you'll use it as `ADMIN_PRIVATE_KEY` in
the backend `.env` file (a sensible default is already filled into
`.env.example` matching Hardhat's default account #0, so you often don't
need to change it).

### Step 3 — Deploy the smart contract

In a **new terminal**:

```bash
cd blockchain
npm run deploy
```

This deploys `ThreatIntelligence.sol` to your local network, writes the
contract address + ABI to `backend/config/contract.json`, and registers a
demo organization on-chain automatically.

### Step 4 — (Optional) Start a local IPFS daemon

```bash
ipfs daemon
```

If you skip this step, the backend will automatically use a mock local
storage folder (`backend/mock_ipfs_storage/`) instead — everything still
works, it's just not "real" IPFS.

### Step 5 — Configure and start the backend API

```bash
cd backend
cp .env.example .env
# edit .env if needed (Mongo URI, JWT secret, etc.)
npm install
npm start
```

You should see:
```
✅ MongoDB connected
✅ Connected to blockchain contract at 0x...
✅ IPFS client configured / mock storage in use
🚀 Threat Intelligence API running on http://localhost:5000
```

### Step 6 — Open the frontend

The frontend is plain static HTML/CSS/JS — no build tools needed. Just open
`frontend/index.html` in your browser, e.g.:

```bash
cd frontend
# any static server works, for example:
npx http-server -p 8080
# then visit http://localhost:8080
```

(Opening `index.html` directly via `file://` also works in most browsers,
but a tiny static server avoids CORS quirks.)

---

## 5. Using the system

1. **Register** an organization account on the login page.
   - Behind the scenes: password is hashed with bcrypt, a blockchain wallet
     is generated for the org, and that wallet is registered on-chain so it
     can submit reports.
2. **Login** to get a JWT (stored in the browser's localStorage).
3. **Submit Threat Report** — fill out the form. On submit:
   - Report is hashed (SHA-256)
   - Full report is uploaded to IPFS → CID returned
   - `reportHash + ipfsHash + orgName` written to the blockchain
   - Everything saved to MongoDB
   - The page shows you the report hash, IPFS CID, and blockchain tx hash
4. **View Threats** — browse/search/filter all shared intelligence.
5. **Verify Report** — paste a report hash to prove it's really on the
   blockchain and hasn't been tampered with.
6. **Dashboard** — see total attacks, attacks by type (chart), and recent
   threats.

### Try the sample data

`sample-data/sample_threats.json` has 4 ready-made reports (Phishing,
Ransomware, SQL Injection, DDoS) you can copy/paste into the Submit form to
quickly populate the dashboard for a demo.

---

## 6. REST API reference

| Method | Endpoint | Auth required | Description |
|--------|----------|:--------------:|--------------|
| POST | `/register` | No | Create an organization/analyst/admin account |
| POST | `/login` | No | Log in, returns a JWT |
| POST | `/submitThreat` | Yes | Submit a new threat report (hash → IPFS → blockchain → DB) |
| GET  | `/getThreats?attackType=&search=` | Yes | List/search/filter all threat reports |
| GET  | `/verifyThreat/:reportHash` | Yes | Verify a report's blockchain integrity |
| GET  | `/stats` | Yes | Dashboard statistics |

All authenticated endpoints require an `Authorization: Bearer <JWT>` header.

---

## 7. Smart contract functions

`blockchain/contracts/ThreatIntelligence.sol`:

- `registerOrganization(address orgAddress, string name)` — admin only
- `addThreatReport(string reportHash, string ipfsHash, string organization)` — registered orgs only
- `getThreatReports()` — returns all reports
- `verifyReport(string reportHash)` — returns `(found, ipfsHash, organization, timestamp)`
- `getReportCount()` / `getReportByIndex(i)` — pagination helpers

---

## 8. Security features implemented

- ✅ JWT-based authentication with expiry
- ✅ Password hashing with bcrypt (never stored in plaintext)
- ✅ Input validation on every write endpoint (`express-validator`)
- ✅ Role-based access control (`admin`, `organization`, `analyst`)
- ✅ Request logging (`morgan`)
- ✅ Blockchain immutability — once a report hash is on-chain, it cannot be
  altered or deleted, only appended to
- ✅ Duplicate-hash protection in the smart contract (rejects re-submitting
  an identical report hash)

### Security notes for students (what's simplified here)

This is a teaching prototype, so a few things are simplified on purpose:
- Organization wallet private keys are stored in MongoDB for convenience
  (`walletPrivateKey`) so users don't need MetaMask. **A production system
  should never store private keys server-side like this** — use a proper
  wallet/HSM/KMS, or have each organization sign transactions client-side.
- HTTPS/TLS is not configured directly in Express — deploy behind a reverse
  proxy (Nginx/Caddy) with a TLS certificate for real deployments.
- Rate limiting / CAPTCHA on `/register` and `/login` is not included but
  recommended for production (e.g., `express-rate-limit`).

---

## 9. Running tests / sanity checks

Quick manual test flow:
1. Register two organizations (e.g. "Org A", "Org B").
2. Log in as Org A, submit one of the sample reports.
3. Log in as Org B, go to "View Threats" — you should see Org A's report
   (this demonstrates cross-organization sharing).
4. Copy the `reportHash` shown after submission, go to "Verify Report",
   paste it — should show ✅ VERIFIED.
5. Manually edit that report's `attackDescription` directly in MongoDB
   (e.g. via `mongosh`), then verify again — it will now show a
   ⚠️ MISMATCH, proving tamper-detection works.

---

## 10. Tech stack summary

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, JavaScript, Chart.js |
| Backend | Node.js, Express |
| Blockchain | Solidity, Hardhat (local Ethereum network), ethers.js |
| Off-chain storage | IPFS (`ipfs-http-client`, with local mock fallback) |
| Database | MongoDB + Mongoose (PostgreSQL schema alternative provided) |
| Auth | JWT (`jsonwebtoken`), bcrypt (`bcryptjs`) |

---

## 11. License

Provided for educational and demonstration purposes.
