// Represents an organization / analyst / admin account that can log into
// the system. Passwords are always stored hashed (bcrypt), never plaintext.

const mongoose = require("mongoose");

const organizationSchema = new mongoose.Schema(
  {
    organizationName: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ["admin", "organization", "analyst"],
      default: "organization"
    },
    // Blockchain wallet address representing this organization on-chain.
    // In this prototype, the backend auto-generates one wallet per org
    // (see services/blockchain.js) so orgs don't need to manage MetaMask.
    walletAddress: {
      type: String
    },
    walletPrivateKey: {
      // NOTE: For a real production system, NEVER store private keys like this.
      // This is simplified for educational/demo purposes only.
      type: String
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { versionKey: false }
);

module.exports = mongoose.model("Organization", organizationSchema);
