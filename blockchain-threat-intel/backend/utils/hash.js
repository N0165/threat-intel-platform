// Small helper to create a deterministic SHA-256 hash of a report object.
// This hash is what gets written on-chain, so anyone can later recompute
// it from the report data and compare -> proving the data hasn't changed.

const crypto = require("crypto");

function hashReport(reportObject) {
  // Sort keys so the same data always produces the same hash,
  // regardless of key insertion order.
  const sortedString = JSON.stringify(reportObject, Object.keys(reportObject).sort());
  return crypto.createHash("sha256").update(sortedString).digest("hex");
}

module.exports = { hashReport };
