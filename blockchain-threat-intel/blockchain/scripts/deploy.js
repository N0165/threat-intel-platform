// Deploys ThreatIntelligence.sol to the local Hardhat network
// and writes the deployed address + ABI into backend/config/contract.json
// so the backend can immediately talk to it.

const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const ThreatIntelligence = await hre.ethers.getContractFactory("ThreatIntelligence");
  const contract = await ThreatIntelligence.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("✅ ThreatIntelligence deployed to:", address);

  // Export ABI + address for the backend to consume
  const artifact = await hre.artifacts.readArtifact("ThreatIntelligence");
  const output = {
    address: address,
    abi: artifact.abi
  };

  const outPath = path.join(__dirname, "../../backend/config/contract.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log("📄 Contract ABI + address written to backend/config/contract.json");

  // Also register the deployer (account #0) as an example organization
  // so you can submit a test report immediately after deployment.
  const [deployer] = await hre.ethers.getSigners();
  const tx = await contract.registerOrganization(deployer.address, "DemoOrg");
  await tx.wait();
  console.log("✅ Registered DemoOrg ->", deployer.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
