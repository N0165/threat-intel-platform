// Stores the metadata + full content of a threat intelligence report.
// The full report is ALSO pinned to IPFS, and its hash is ALSO written
// to the blockchain. This MongoDB copy exists purely for fast search/
// filter/dashboard queries - the blockchain + IPFS copies are the
// tamper-proof "source of truth".

const mongoose = require("mongoose");

const threatReportSchema = new mongoose.Schema(
  {
    organizationName: { type: String, required: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },

    attackTitle: { type: String, required: true },
    attackType: {
      type: String,
      required: true,
      enum: [
        "DDoS",
        "Phishing",
        "Malware",
        "Ransomware",
        "SQL Injection",
        "Man-in-the-Middle",
        "Zero-Day",
        "Insider Threat",
        "Other"
      ]
    },

    // Indicators of Compromise
    ioc: {
      ipAddresses: [{ type: String }],
      fileHashes: [{ type: String }],
      domains: [{ type: String }]
    },

    attackDescription: { type: String, required: true },
    howItHappened: { type: String, required: true },
    impact: { type: String, required: true },
    mitigationSteps: { type: String, required: true },
    dateOfAttack: { type: Date, required: true },

    // Free-text catch-all for anything from an uploaded source file that
    // didn't map to one of the structured fields above.
    additionalInformation: { type: String, default: "" },

    // Original file(s) the organization uploaded (e.g. their own incident
    // report doc). Each is pinned to IPFS; only the CID is stored here.
    attachments: [
      {
        filename: String,
        ipfsHash: String,
        mimeType: String
      }
    ],

    // --- Blockchain + IPFS linkage ---
    reportHash: { type: String, required: true, unique: true }, // SHA-256 of report JSON
    ipfsHash: { type: String, required: true },                 // IPFS CID
    blockchainTxHash: { type: String },                          // Ethereum tx hash
    blockchainIndex: { type: Number },                           // index in the on-chain array

    createdAt: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

// Enable text search on key fields for the search feature
threatReportSchema.index({ attackTitle: "text", attackType: "text", organizationName: "text" });

module.exports = mongoose.model("ThreatReport", threatReportSchema);