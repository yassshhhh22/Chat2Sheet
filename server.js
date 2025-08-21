import express from "express";
import dotenv from "dotenv";
import morgan from "morgan";
import cors from "cors";

// Routes
import webhookRoutes from "./src/routes/webhook.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

// Routes
app.use("/webhook", webhookRoutes);
app.get("/", (req, res) => {
  res.send("Welcome to the Chat2Sheet Webhook Server!");
});

const PORT = process.env.PORT;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
