import express from "express";
import {
  renderPaymentPage,
  verifyPaymentSuccess,
  handleRazorpayWebhook,
} from "../controllers/paymentController.js";
import { findStudentById, getStudentFeeStatus } from "../services/sheetsService.js";
import Razorpay from "razorpay";

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const router = express.Router();

// Payment success verification route
router.get("/payments/success", verifyPaymentSuccess);

// Payment page route - when parent clicks from WhatsApp
router.get("/payments/:studid", renderPaymentPage);

// Razorpay webhook route
router.post("/payments/webhook", handleRazorpayWebhook);

// Add route for creating order with custom amount
router.post("/api/payments/create-order", async (req, res) => {
  try {
    const { amount, studid } = req.body;

    // Add proper validation logging
    console.log("📝 Received create-order request:", { amount, studid });

    if (!studid) {
      console.log("❌ Missing studid parameter");
      return res.status(400).json({
        success: false,
        message: "Student ID is required",
      });
    }

    // Validate amount
    if (!amount || amount < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount",
      });
    }

    // Get student details and validate amount doesn't exceed balance
    const student = await findStudentById(studid); // Fixed parameter name
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    const feeStatus = await getStudentFeeStatus(studid); // Fixed parameter name
    const maxAmount = parseFloat(feeStatus?.balance || 0);

    if (amount > maxAmount) {
      return res.status(400).json({
        success: false,
        message: `Amount cannot exceed outstanding balance of ₹${maxAmount}`,
      });
    }

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: amount * 100, // Convert to paise
      currency: "INR",
      notes: {
        studid: studid, // Fixed parameter name to match your other code
        student_name: student.name,
      },
    });

    res.json({
      success: true,
      order_id: order.id,
      amount: amount,
      student: {
        name: student.name,
        class: student.class,
        stud_id: studid, // This can stay as stud_id for response
      },
    });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create order",
    });
  }
});

export default router;
