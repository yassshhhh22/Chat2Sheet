import express from "express";
import dotenv from "dotenv";
import morgan from "morgan";
import cors from "cors";

// Routes
import webhookRoutes from "./src/routes/webhook.js";
import KeepAliveService from "./src/services/keepAliveService.js";
import paymentRoutes from "./src/routes/paymentRoutes.js"; // Fixed path

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: "Chat2Sheet",
  });
});

// Routes
app.use("/webhook", webhookRoutes);
app.use("/", paymentRoutes);
app.get("/", (req, res) => {
  res.send("Welcome to the Chat2Sheet Webhook Server!");
});

const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`🚀 Server Running on port ${PORT}`);

  // Start keep-alive service in production
  if (process.env.RENDER_SERVICE_NAME) {
    const appUrl = `https://${process.env.RENDER_SERVICE_NAME}.onrender.com`;
    const keepAlive = new KeepAliveService(appUrl);
    keepAlive.start();
  }
});
