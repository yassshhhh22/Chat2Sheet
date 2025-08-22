import express from "express";
import { processAIData } from "../services/sheetService.js";

const router = express.Router();

// Process AI-parsed data (comprehensive route for all data types)
router.post("/process-ai-data", async (req, res) => {
  try {
    console.log("🤖 Processing AI-parsed data:", req.body);
    const result = await processAIData(req.body);

    if (result.success) {
      res.status(201).json({
        success: true,
        message: "AI data processed successfully",
        data: result,
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
        data: result,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
