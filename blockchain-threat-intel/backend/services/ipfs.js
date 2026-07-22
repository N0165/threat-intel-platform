// This service uploads and retrieves full threat reports from IPFS.
// If no local IPFS daemon is running (common for quick student demos),
// it automatically falls back to a local "mock IPFS" folder so the
// rest of the system still works end-to-end without extra setup.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

let ipfsClient = null;
let usingMock = false;

const MOCK_DIR = path.join(__dirname, "../mock_ipfs_storage");

function init() {
  try {
    // ipfs-http-client is CommonJS-incompatible in newer versions (ESM only),
    // so we lazy-require it and gracefully fall back if it fails to load
    // or no daemon is reachable.
    const { create } = require("ipfs-http-client");
    ipfsClient = create({ url: process.env.IPFS_API_URL });
    console.log("✅ IPFS client configured for", process.env.IPFS_API_URL);
  } catch (err) {
    console.warn("⚠️  Could not initialize IPFS client, falling back to mock IPFS storage.");
    usingMock = true;
    if (!fs.existsSync(MOCK_DIR)) fs.mkdirSync(MOCK_DIR, { recursive: true });
  }
}

// Uploads a JSON object to IPFS and returns its CID (content hash).
async function uploadReportToIPFS(reportObject) {
  const content = JSON.stringify(reportObject, null, 2);

  if (usingMock || !ipfsClient) {
    return mockUpload(content);
  }

  try {
    const { cid } = await ipfsClient.add(content);
    return cid.toString();
  } catch (err) {
    console.warn("⚠️  IPFS daemon unreachable, using mock storage instead:", err.message);
    usingMock = true;
    if (!fs.existsSync(MOCK_DIR)) fs.mkdirSync(MOCK_DIR, { recursive: true });
    return mockUpload(content);
  }
}

// Uploads a raw file (sent as base64 text from the browser) to IPFS,
// or to mock storage if no IPFS daemon is reachable. Returns the CID.
async function uploadFileToIPFS(base64Data, filename) {
  const buffer = Buffer.from(base64Data, "base64");

  if (usingMock || !ipfsClient) {
    return mockUploadBuffer(buffer, filename);
  }

  try {
    const { cid } = await ipfsClient.add(buffer);
    return cid.toString();
  } catch (err) {
    console.warn("⚠️  IPFS daemon unreachable, using mock storage instead:", err.message);
    usingMock = true;
    if (!fs.existsSync(MOCK_DIR)) fs.mkdirSync(MOCK_DIR, { recursive: true });
    return mockUploadBuffer(buffer, filename);
  }
}

function mockUploadBuffer(buffer, filename) {
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  const cid = "mockcid_" + hash;
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  fs.writeFileSync(path.join(MOCK_DIR, `${cid}_${safeName}`), buffer);
  return cid;
}

// Retrieves report content by CID.
async function getReportFromIPFS(cid) {
  if (usingMock || !ipfsClient) {
    return mockRetrieve(cid);
  }

  try {
    const chunks = [];
    for await (const chunk of ipfsClient.cat(cid)) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf-8");
  } catch (err) {
    return mockRetrieve(cid);
  }
}

// --- Mock IPFS (content-addressed local storage, same idea as real IPFS) ---

function mockUpload(content) {
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  const cid = "mockcid_" + hash;
  fs.writeFileSync(path.join(MOCK_DIR, `${cid}.json`), content);
  return cid;
}

function mockRetrieve(cid) {
  const filePath = path.join(MOCK_DIR, `${cid}.json`);
  if (!fs.existsSync(filePath)) throw new Error("Content not found for CID: " + cid);
  return fs.readFileSync(filePath, "utf-8");
}

module.exports = { init, uploadReportToIPFS, getReportFromIPFS, uploadFileToIPFS };