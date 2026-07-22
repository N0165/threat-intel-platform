const express = require("express");
const { body, validationResult } = require("express-validator");

const ThreatReport = require("../models/ThreatReport");
const Organization = require("../models/Organization");
const { authenticate, authorize } = require("../middleware/auth");
const { hashReport } = require("../utils/hash");
const blockchain = require("../services/blockchain");
const ipfs = require("../services/ipfs");

const router = express.Router();

const ATTACK_TYPES = [
  "DDoS",
  "Phishing",
  "Malware",
  "Ransomware",
  "SQL Injection",
  "Man-in-the-Middle",
  "Zero-Day",
  "Insider Threat",
  "Other"
];

/**
 * POST /submitThreat
 * Submits a new threat intelligence report.
 * Flow:
 *   1. Validate input
 *   2. Build the canonical report object
 *   3. Hash it (SHA-256) -> reportHash
 *   4. Upload full report to IPFS -> ipfsHash
 *   5. Write (reportHash, ipfsHash, org) to the blockchain
 *   6. Save metadata + full content in MongoDB for fast search
 */
router.post(
  "/submitThreat",
  authenticate,
  authorize("organization", "admin"),
  [
    body("attackTitle").trim().notEmpty(),
    body("attackType").isIn(ATTACK_TYPES),
    body("attackDescription").trim().notEmpty(),
    body("howItHappened").trim().notEmpty(),
    body("impact").trim().notEmpty(),
    body("mitigationSteps").trim().notEmpty(),
    body("dateOfAttack").isISO8601().withMessage("dateOfAttack must be a valid date"),
    body("ioc").optional().isObject()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const {
        attackTitle,
        attackType,
        attackDescription,
        howItHappened,
        impact,
        mitigationSteps,
        dateOfAttack,
        ioc,
        additionalInformation,
        attachments // optional array: [{ filename, mimeType, data (base64) }]
      } = req.body;

      const org = await Organization.findById(req.user.id);
      if (!org) return res.status(404).json({ error: "Organization not found" });

      // --- Auto-recovery for local dev chains ---
      // If you're using a local Hardhat node, restarting it wipes all
      // on-chain registrations, even though the org still exists in MongoDB
      // with its old wallet address. Detect that and silently re-register +
      // re-fund the wallet so submissions keep working without manual steps.
      const alreadyRegistered = await blockchain.isOrgRegisteredOnChain(org.walletAddress);
      if (!alreadyRegistered) {
        console.log(
          `[AUTO-RECOVER] ${org.organizationName}'s wallet isn't registered on the current chain (likely the local blockchain was restarted). Re-registering...`
        );
        await blockchain.registerOrganizationOnChain(org.walletAddress, org.organizationName);
        await blockchain.fundOrgWallet(org.walletAddress);
      }

      // 1. Build the canonical report content (this is what gets hashed & stored)
      const reportContent = {
        organizationName: org.organizationName,
        attackTitle,
        attackType,
        ioc: {
          ipAddresses: ioc?.ipAddresses || [],
          fileHashes: ioc?.fileHashes || [],
          domains: ioc?.domains || []
        },
        attackDescription,
        howItHappened,
        impact,
        mitigationSteps,
        dateOfAttack: new Date(dateOfAttack).toISOString(),
        additionalInformation: additionalInformation || ""
      };

      // 2. Hash it
      const reportHash = hashReport(reportContent);

      // 3. Upload to IPFS
      const ipfsHash = await ipfs.uploadReportToIPFS(reportContent);

      // 4. Write fingerprint to blockchain (signed by the org's own wallet)
      const { txHash, blockchainIndex } = await blockchain.addThreatReportOnChain(
        org.walletPrivateKey,
        reportHash,
        ipfsHash,
        org.organizationName
      );

      // 5. Upload any attached original files (e.g. an org's own incident
      //    report document) to IPFS. Only the CIDs are stored in MongoDB.
      const uploadedAttachments = [];
      if (Array.isArray(attachments)) {
        for (const file of attachments) {
          if (!file?.data || !file?.filename) continue;
          const cid = await ipfs.uploadFileToIPFS(file.data, file.filename);
          uploadedAttachments.push({
            filename: file.filename,
            ipfsHash: cid,
            mimeType: file.mimeType || "application/octet-stream"
          });
        }
      }

      // 6. Save to MongoDB for fast querying / dashboards
      const report = new ThreatReport({
        organizationName: org.organizationName,
        submittedBy: org._id,
        attackTitle,
        attackType,
        ioc: reportContent.ioc,
        attackDescription,
        howItHappened,
        impact,
        mitigationSteps,
        dateOfAttack,
        additionalInformation: additionalInformation || "",
        attachments: uploadedAttachments,
        reportHash,
        ipfsHash,
        blockchainTxHash: txHash,
        blockchainIndex
      });
      await report.save();

      console.log(`[SUBMIT] ${org.organizationName} submitted "${attackTitle}" (${reportHash.slice(0, 10)}...)`);

      return res.status(201).json({
        message: "Threat report submitted and anchored on blockchain",
        report
      });
    } catch (err) {
      console.error("submitThreat error:", err);
      return res.status(500).json({ error: "Failed to submit threat report", details: err.message });
    }
  }
);

/**
 * GET /getThreats
 * Returns all shared threat intelligence. Supports:
 *   ?attackType=Phishing   -> filter by attack type
 *   ?search=some+keyword   -> text search across title/type/org
 */
router.get("/getThreats", authenticate, async (req, res) => {
  try {
    const { attackType, search } = req.query;
    const filter = {};

    if (attackType) filter.attackType = attackType;
    if (search) filter.$text = { $search: search };

    const reports = await ThreatReport.find(filter).sort({ createdAt: -1 });
    return res.json({ count: reports.length, reports });
  } catch (err) {
    console.error("getThreats error:", err);
    return res.status(500).json({ error: "Failed to fetch threats", details: err.message });
  }
});

/**
 * GET /verifyThreat/:reportHash
 * Confirms whether a report hash exists on the blockchain, and cross-checks
 * it against what's stored in the database + IPFS to prove data integrity.
 */
router.get("/verifyThreat/:reportHash", authenticate, async (req, res) => {
  try {
    const { reportHash } = req.params;

    const onChain = await blockchain.verifyReportOnChain(reportHash);
    const dbReport = await ThreatReport.findOne({ reportHash });

    if (!onChain.found) {
      return res.json({
        verified: false,
        message: "❌ No matching report found on the blockchain. This hash may be forged or tampered."
      });
    }

    // Recompute the hash from the DB copy to double check nothing changed
    let integrityMatch = false;
    if (dbReport) {
      const recomputed = hashReport({
        organizationName: dbReport.organizationName,
        attackTitle: dbReport.attackTitle,
        attackType: dbReport.attackType,
        ioc: dbReport.ioc,
        attackDescription: dbReport.attackDescription,
        howItHappened: dbReport.howItHappened,
        impact: dbReport.impact,
        mitigationSteps: dbReport.mitigationSteps,
        dateOfAttack: dbReport.dateOfAttack.toISOString(),
        additionalInformation: dbReport.additionalInformation || ""
      });
      integrityMatch = recomputed === reportHash;
    }

    return res.json({
      verified: true,
      integrityMatch,
      onChain,
      databaseRecord: dbReport || null,
      message: integrityMatch
        ? "✅ Report verified: hash matches blockchain record. Data is authentic and untampered."
        : "⚠️ Report exists on-chain, but local database copy does not match (possible tampering in DB)."
    });
  } catch (err) {
    console.error("verifyThreat error:", err);
    return res.status(500).json({ error: "Verification failed", details: err.message });
  }
});

/**
 * GET /stats
 * Dashboard statistics: total attacks, breakdown by type, recent threats.
 */
router.get("/stats", authenticate, async (req, res) => {
  try {
    const totalAttacks = await ThreatReport.countDocuments();

    const byType = await ThreatReport.aggregate([
      { $group: { _id: "$attackType", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const recentThreats = await ThreatReport.find().sort({ createdAt: -1 }).limit(5);

    // Count DISTINCT organizations by name, not total accounts. Two logins
    // (e.g. an admin + an analyst) from "IBM" should count as one
    // organization, not two.
    const distinctOrgNames = await Organization.distinct("organizationName");
    const totalOrganizations = distinctOrgNames.length;

    return res.json({
      totalAttacks,
      totalOrganizations,
      byType,
      recentThreats
    });
  } catch (err) {
    console.error("stats error:", err);
    return res.status(500).json({ error: "Failed to fetch stats", details: err.message });
  }
});

module.exports = router;