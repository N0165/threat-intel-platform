require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const connectDB = require("./config/db");
const blockchain = require("./services/blockchain");
const ipfs = require("./services/ipfs");

const authRoutes = require("./routes/auth");
const threatRoutes = require("./routes/threats");

const app = express();

// --- Core middleware ---
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(morgan("combined")); // basic request logging (security requirement)

// --- Routes ---
app.use("/", authRoutes);      // /register, /login
app.use("/", threatRoutes);    // /submitThreat, /getThreats, /verifyThreat/:hash, /stats

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "Threat Intelligence Sharing API" });
});

// --- Central error handler (catches anything not handled in routes) ---
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB();
  blockchain.init();
  ipfs.init();

  app.listen(PORT, () => {
    console.log(`🚀 Threat Intelligence API running on http://localhost:${PORT}`);
    console.log(`   (For HTTPS in production, put this behind a reverse proxy like Nginx with TLS.)`);
  });
}

start();
