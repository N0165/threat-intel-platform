const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");

const Organization = require("../models/Organization");
const blockchain = require("../services/blockchain");

const router = express.Router();

/**
 * POST /register
 * Registers a new organization / analyst / admin account.
 * - Hashes the password with bcrypt
 * - Creates a blockchain wallet for the org
 * - Registers that wallet on-chain so it can submit reports
 */
router.post(
  "/register",
  [
    body("organizationName").trim().notEmpty().withMessage("Organization name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("role").optional().isIn(["admin", "organization", "analyst"])
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { organizationName, email, password, role } = req.body;

      const existing = await Organization.findOne({ email });
      if (existing) {
        return res.status(409).json({ error: "An account with this email already exists" });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      // Create a blockchain wallet for this org and register it on-chain.
      const wallet = blockchain.createOrgWallet();
      await blockchain.registerOrganizationOnChain(wallet.address, organizationName);
      await blockchain.fundOrgWallet(wallet.address);

      const org = new Organization({
        organizationName,
        email,
        passwordHash,
        role: role || "organization",
        walletAddress: wallet.address,
        walletPrivateKey: wallet.privateKey
      });
      await org.save();

      console.log(`[REGISTER] New account created: ${email} (${org.role})`);

      return res.status(201).json({
        message: "Organization registered successfully",
        organization: {
          id: org._id,
          organizationName: org.organizationName,
          email: org.email,
          role: org.role,
          walletAddress: org.walletAddress
        }
      });
    } catch (err) {
      console.error("Register error:", err);
      return res.status(500).json({ error: "Registration failed", details: err.message });
    }
  }
);

/**
 * POST /login
 * Verifies email + password, returns a signed JWT on success.
 */
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").notEmpty().withMessage("Password is required")
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { email, password } = req.body;

      const org = await Organization.findOne({ email });
      if (!org) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const passwordMatches = await bcrypt.compare(password, org.passwordHash);
      if (!passwordMatches) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const token = jwt.sign(
        {
          id: org._id,
          organizationName: org.organizationName,
          role: org.role,
          walletAddress: org.walletAddress
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
      );

      console.log(`[LOGIN] ${email} logged in`);

      return res.json({
        message: "Login successful",
        token,
        organization: {
          id: org._id,
          organizationName: org.organizationName,
          email: org.email,
          role: org.role
        }
      });
    } catch (err) {
      console.error("Login error:", err);
      return res.status(500).json({ error: "Login failed", details: err.message });
    }
  }
);

module.exports = router;