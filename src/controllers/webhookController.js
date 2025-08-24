import {
  parseMessageWithAI,
  hasPendingConfirmation,
  handleConfirmationResponse,
  requestWriteConfirmation, // Add this import
  processWebhookPayment,
} from "../services/aiService.js";
import { parseReadRequest } from "../services/readAiService.js";
import { classifyMessage } from "../services/classifierService.js";
import { processAIData } from "../services/sheetService.js";
import { processReadRequest } from "../controllers/readController.js";
import {
  sendReminderToAll,
  sendReminderToSpecific,
} from "../controllers/reminderController.js";
import { logAction } from "./sheetsController.js";
import {
  sendFormattedResponse,
  sendReadResponse,
  sendWhatsAppMessage,
} from "../services/whatsappService.js";

export const handleIncomingMessage = async (req, res) => {
  let rawMessage = "";
  let parsedData = null;

  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const messages = changes?.value?.messages;

    if (!messages) return res.sendStatus(200);

    const msg = messages[0];
    const from = msg.from;
    const text = msg.text?.body;
    rawMessage = text;

    if (!text) return res.sendStatus(200);

    console.log(`📩 Message from ${from}: "${text}"`);

    // Check if user has pending confirmation
    if (hasPendingConfirmation(from)) {
      const confirmationResult = await handleConfirmationResponse(from, text);

      if (confirmationResult.error) {
        await sendWhatsAppMessage(from, confirmationResult.message);
        return res.status(200).json({ success: true });
      }

      if (!confirmationResult.confirmed) {
        await sendWhatsAppMessage(from, confirmationResult.message);
        return res.status(200).json({ success: true });
      }

      // If confirmed, proceed with the original operation
      await sendWhatsAppMessage(from, confirmationResult.message);

      // Process the confirmed operation
      const operationResult = await processAIData(confirmationResult.data);
      await sendFormattedResponse(from, operationResult);

      return res.status(200).json({ success: true });
    }

    // Classify message as READ, write, or reminder
    const classification = await classifyMessage(text, from);
    console.log(
      `🎯 Classification: ${classification.operation}`,
      classification.student_id ? `(Student: ${classification.student_id})` : ""
    );

    let result;

    if (classification.operation === "READ") {
      // READ flow remains unchanged
      const readRequest = await parseReadRequest(text);
      result = await processReadRequest(readRequest, from);
      await sendReadResponse(from, result);
    } else if (classification.operation === "REMIND_ALL") {
      // Handle remind all students
      console.log("📢 Processing REMIND_ALL request");
      const reminderResult = await sendReminderToAll();
      await sendWhatsAppMessage(from, reminderResult);
    } else if (classification.operation === "REMIND_SPECIFIC") {
      // Handle remind specific student
      const studentId = classification.student_id;
      console.log(`📢 Processing REMIND_SPECIFIC request for: ${studentId}`);

      if (studentId) {
        const reminderResult = await sendReminderToSpecific(studentId);
        await sendWhatsAppMessage(from, reminderResult);
      } else {
        await sendWhatsAppMessage(
          from,
          "❌ Please specify a student ID for reminder (e.g., remind STU123)"
        );
      }
    } else {
      // WRITE flow: Add validation before confirmation (unchanged)
      // AI interprets the message → JSON
      parsedData = await parseMessageWithAI(text);

      // VALIDATE DATA BEFORE REQUESTING CONFIRMATION
      const validationResult = validateParsedData(parsedData);
      if (!validationResult.isValid) {
        await sendWhatsAppMessage(from, validationResult.errorMessage);

        // Log the validation error
        await logAction(
          "validation_failed",
          parsedData.Students?.[0]?.name ||
            parsedData.Installments?.[0]?.stud_id ||
            "",
          rawMessage,
          JSON.stringify(parsedData),
          "error",
          validationResult.errorMessage,
          `whatsapp_${from}`
        );

        return res.status(200).json({ success: true });
      }

      // Request confirmation ONLY for valid data
      const confirmationRequest = await requestWriteConfirmation(
        from,
        parsedData,
        classification.operation
      );

      await sendWhatsAppMessage(from, confirmationRequest.confirmationMessage);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("❌ Error in handleIncomingMessage:", error);

    // Log error to action logs
    try {
      await logAction(
        "webhook_error",
        "",
        rawMessage,
        JSON.stringify(parsedData),
        "error",
        error.message,
        "system"
      );
    } catch (logError) {
      console.error("❌ Failed to log error:", logError);
    }

    await sendWhatsAppMessage(
      req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from,
      "❌ Sorry, I encountered an error processing your message. Please try again."
    );

    res.status(200).json({ success: true });
  }
};

// Add this function to handle payment webhooks from Razorpay
export const handlePaymentWebhook = async (paymentData) => {
  try {
    const aiCommand = `Add installment
Student ID: ${paymentData.studid}
Amount: ${paymentData.amount}
Mode: Online
Recorded by: Razorpay
Remarks: Transaction ID: ${paymentData.transaction_id}`;

    const result = await processWebhookPayment(aiCommand);

    if (result.success) {
      console.log("✅ Webhook payment processed successfully");
      return { success: true, message: "Payment processed successfully" };
    } else {
      throw new Error("Payment processing failed");
    }
  } catch (error) {
    console.error("❌ Webhook payment error:", error);
    return { success: false, error: error.message };
  }
};

// Validation function (unchanged)
function validateParsedData(parsedData) {
  // Validate installments
  if (parsedData.Installments && parsedData.Installments.length > 0) {
    for (const installment of parsedData.Installments) {
      if (!installment.stud_id && !installment.name) {
        return {
          isValid: false,
          errorMessage:
            '❌ *Invalid Request*\n\nTo add an installment, please provide either:\n• Student ID (e.g., STU001)\n• Student name\n\nExample: "STU001 paid 100" or "Rahul paid 100"',
        };
      }

      if (
        !installment.installment_amount ||
        installment.installment_amount === "0"
      ) {
        return {
          isValid: false,
          errorMessage:
            '❌ *Invalid Request*\n\nPlease specify a valid installment amount.\n\nExample: "STU001 paid 100"',
        };
      }
    }
  }

  // Validate students
  if (parsedData.Students && parsedData.Students.length > 0) {
    for (const student of parsedData.Students) {
      if (!student.name || !student.class) {
        return {
          isValid: false,
          errorMessage:
            '❌ *Invalid Request*\n\nTo add a new student, please provide:\n• Student name\n• Class\n\nExample: "Add student Rahul class 10"',
        };
      }
    }
  }

  return { isValid: true };
}
