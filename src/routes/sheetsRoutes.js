import express from "express";
import {
  addStudent,
  addInstallment,
  updateFeesSummary,
  logAction,
} from "../controllers/sheetsController.js";

const router = express.Router();

// Add student route
router.post("/students/add", async (req, res) => {
  try {
    const result = await addStudent(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// Add installment route
router.post("/installments/add", async (req, res) => {
  try {
    const result = await addInstallment(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// Update fees summary route
router.put("/fees-summary/:studId", async (req, res) => {
  try {
    const result = await updateFeesSummary(req.params.studId);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// Manual log action route (for testing)
router.post("/logs/add", async (req, res) => {
  try {
    const {
      action,
      stud_id,
      raw_message,
      parsed_json,
      result,
      error_msg,
      performed_by,
    } = req.body;
    const logResult = await logAction(
      action,
      stud_id,
      raw_message,
      parsed_json,
      result,
      error_msg,
      performed_by
    );
    res.status(201).json(logResult);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
