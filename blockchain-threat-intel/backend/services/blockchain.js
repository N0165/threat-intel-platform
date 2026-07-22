// This service is the ONLY place in the backend that talks to the
// blockchain. It wraps ethers.js calls to our ThreatIntelligence contract.

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const CONTRACT_CONFIG_PATH = path.join(__dirname, "../config/contract.json");

let provider;
let adminWallet;
let contract;

// --- Per-wallet transaction queue -----------------------------------------
// Ethereum requires each wallet's transactions to be sent with sequential
// nonces. If two transactions from the SAME wallet fire close together
// (e.g. registering + funding a new org, or two quick submissions), they
// can race and one gets rejected with a "nonce too low" error. This queue
// forces transactions from the same address to run one at a time, in order.
const txQueues = new Map();

// We do NOT cache nonces across calls. A cached "next nonce" can silently
// drift out of sync with the real chain state (e.g. if anything else - even
// briefly, like a leftover process from earlier testing - sends a
// transaction from this same wallet outside of this queue). Instead, we
// fetch the true nonce fresh from the node immediately before every send.
// Because sends from the same address are serialized by queueTx below
// (each waits for the previous one to be mined before the next runs), this
// fresh fetch is always accurate and never races with our own code.
async function getFreshNonce(wallet) {
  return provider.getTransactionCount(wallet.address, "pending");
}

function queueTx(address, fn) {
  const previous = txQueues.get(address) || Promise.resolve();
  const next = previous.then(fn, fn); // run fn regardless of previous outcome
  txQueues.set(address, next.catch(() => {})); // keep the chain alive even after an error
  return next;
}

function loadContractConfig() {
  if (!fs.existsSync(CONTRACT_CONFIG_PATH)) {
    throw new Error(
      "contract.json not found. Run `npm run deploy` inside the blockchain/ folder first."
    );
  }
  return JSON.parse(fs.readFileSync(CONTRACT_CONFIG_PATH, "utf-8"));
}

function init() {
  provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  adminWallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);

  const { address, abi } = loadContractConfig();
  contract = new ethers.Contract(address, abi, adminWallet);

  console.log("✅ Connected to blockchain contract at", address);
  return contract;
}

// Creates a brand-new random wallet for an organization when it registers.
// In this simplified prototype the backend custodies the key so the org
// doesn't need MetaMask. (Not how you'd do it in production!)
function createOrgWallet() {
  const wallet = ethers.Wallet.createRandom();
  return { address: wallet.address, privateKey: wallet.privateKey };
}

// Sends test ETH from the admin wallet to a newly created org wallet
// so it can pay gas fees when submitting reports on the local network.
async function fundOrgWallet(orgAddress) {
  return queueTx(adminWallet.address, async () => {
    const nonce = await getFreshNonce(adminWallet);
    const tx = await adminWallet.sendTransaction({
      to: orgAddress,
      value: ethers.parseEther("1.0"), // 1 fake ETH, plenty for many transactions
      nonce
    });
    await tx.wait();
  });
}

// Checks whether a wallet address is currently registered as an organization
// on the blockchain that's running RIGHT NOW. This matters because a local
// Hardhat node resets to empty every time it's restarted - so a wallet that
// was registered before a restart will show up as NOT registered afterward.
async function isOrgRegisteredOnChain(orgAddress) {
  return await contract.registeredOrganizations(orgAddress);
}

// Registers a newly created organization wallet on-chain so it is
// allowed to submit threat reports. Called once, right after signup
// (and again automatically if a local chain restart wipes registrations).
async function registerOrganizationOnChain(orgAddress, orgName) {
  return queueTx(adminWallet.address, async () => {
    const nonce = await getFreshNonce(adminWallet);
    const tx = await contract.registerOrganization(orgAddress, orgName, { nonce });
    const receipt = await tx.wait();
    return receipt.hash;
  });
}

// Adds a threat report fingerprint to the blockchain, signed by the
// SUBMITTING organization's own wallet (not the admin wallet), so the
// chain correctly records which org actually submitted it.
async function addThreatReportOnChain(orgPrivateKey, reportHash, ipfsHash, organizationName) {
  const orgSigner = new ethers.Wallet(orgPrivateKey, provider);

  return queueTx(orgSigner.address, async () => {
    const contractWithOrgSigner = contract.connect(orgSigner);
    const nonce = await getFreshNonce(orgSigner);
    const tx = await contractWithOrgSigner.addThreatReport(reportHash, ipfsHash, organizationName, { nonce });
    const receipt = await tx.wait();

    // Find the index from the emitted event
    const event = receipt.logs
      .map((log) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "ThreatReportAdded");

    const blockchainIndex = event ? Number(event.args.index) : null;

    return { txHash: receipt.hash, blockchainIndex };
  });
}

async function getAllReportsOnChain() {
  const reports = await contract.getThreatReports();
  return reports.map((r) => ({
    reportHash: r.reportHash,
    ipfsHash: r.ipfsHash,
    organization: r.organization,
    submitter: r.submitter,
    timestamp: Number(r.timestamp)
  }));
}

async function verifyReportOnChain(reportHash) {
  const [found, ipfsHash, organization, timestamp] = await contract.verifyReport(reportHash);
  return { found, ipfsHash, organization, timestamp: Number(timestamp) };
}

module.exports = {
  init,
  createOrgWallet,
  fundOrgWallet,
  isOrgRegisteredOnChain,
  registerOrganizationOnChain,
  addThreatReportOnChain,
  getAllReportsOnChain,
  verifyReportOnChain
};