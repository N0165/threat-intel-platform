-- ============================================================
-- ALTERNATIVE SCHEMA: PostgreSQL
-- ============================================================
-- This project's backend code (backend/) uses MongoDB + Mongoose
-- by default (see backend/models/*.js). If you prefer a relational
-- database instead, here is the equivalent PostgreSQL schema you
-- can adapt the backend models to.
-- ============================================================

CREATE TABLE organizations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_name TEXT NOT NULL,
    email             TEXT NOT NULL UNIQUE,
    password_hash     TEXT NOT NULL,
    role              TEXT NOT NULL CHECK (role IN ('admin', 'organization', 'analyst')) DEFAULT 'organization',
    wallet_address    TEXT,
    wallet_private_key TEXT, -- Demo only! Never store real private keys like this in production.
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE threat_reports (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_name   TEXT NOT NULL,
    submitted_by        UUID NOT NULL REFERENCES organizations(id),

    attack_title        TEXT NOT NULL,
    attack_type         TEXT NOT NULL CHECK (attack_type IN (
                            'DDoS', 'Phishing', 'Malware', 'Ransomware',
                            'SQL Injection', 'Man-in-the-Middle', 'Zero-Day',
                            'Insider Threat', 'Other'
                        )),

    ioc_ip_addresses    TEXT[],   -- e.g. '{192.168.1.10,45.33.22.11}'
    ioc_file_hashes     TEXT[],
    ioc_domains         TEXT[],

    attack_description  TEXT NOT NULL,
    how_it_happened     TEXT NOT NULL,
    impact              TEXT NOT NULL,
    mitigation_steps    TEXT NOT NULL,
    date_of_attack      DATE NOT NULL,

    -- Blockchain + IPFS linkage
    report_hash         TEXT NOT NULL UNIQUE,   -- SHA-256 fingerprint (also stored on-chain)
    ipfs_hash           TEXT NOT NULL,          -- IPFS CID of full report JSON
    blockchain_tx_hash  TEXT,                   -- Ethereum transaction hash
    blockchain_index    INTEGER,                -- Index in the on-chain reports array

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_threat_reports_type ON threat_reports (attack_type);
CREATE INDEX idx_threat_reports_org  ON threat_reports (organization_name);
CREATE INDEX idx_threat_reports_hash ON threat_reports (report_hash);

-- Full text search index (search feature)
CREATE INDEX idx_threat_reports_search
    ON threat_reports
    USING GIN (to_tsvector('english', attack_title || ' ' || attack_type || ' ' || organization_name));


-- ============================================================
-- REFERENCE: MongoDB collection shapes (what the backend actually uses)
-- ============================================================
-- organizations collection document shape:
-- {
--   _id: ObjectId,
--   organizationName: String,
--   email: String (unique),
--   passwordHash: String,
--   role: "admin" | "organization" | "analyst",
--   walletAddress: String,
--   walletPrivateKey: String,
--   createdAt: Date
-- }
--
-- threatreports collection document shape:
-- {
--   _id: ObjectId,
--   organizationName: String,
--   submittedBy: ObjectId (ref organizations),
--   attackTitle: String,
--   attackType: String (enum),
--   ioc: { ipAddresses: [String], fileHashes: [String], domains: [String] },
--   attackDescription: String,
--   howItHappened: String,
--   impact: String,
--   mitigationSteps: String,
--   dateOfAttack: Date,
--   reportHash: String (unique),
--   ipfsHash: String,
--   blockchainTxHash: String,
--   blockchainIndex: Number,
--   createdAt: Date
-- }
