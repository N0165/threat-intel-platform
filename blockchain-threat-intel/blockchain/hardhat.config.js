require("@nomicfoundation/hardhat-toolbox");

/**
 * Hardhat config.
 * We run a local Ethereum network on http://127.0.0.1:8545
 * using `npx hardhat node`. This gives us 20 test accounts
 * pre-loaded with fake ETH - perfect for a student prototype
 * (no real money, no real network needed).
 */
module.exports = {
  solidity: "0.8.19",
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337
    }
  }
};
