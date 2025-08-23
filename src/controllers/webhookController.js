import {
  parseMessageWithAI,
  hasPendingConfirmation,
  handleConfirmationResponse,
  requestWriteConfirmation, // Add this import
} from "../services/aiService.js";
import { parseReadRequest } from "../services/readAiService.js";
import { classifyMessage } from "../services/classifierService.js";
import { processAIData } from "../services/sheetService.js";
import { processReadRequest } from "../controllers/readController.js";
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

    console.log("📩 Incoming message from:", from);
    console.log("📩 Message content:", text);

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

    // Step 1: Classify message as READ or WRITE
    const classification = await classifyMessage(text);
    console.log("🎯 Message classified as:", classification.operation);

    let result;

    if (classification.operation === "READ") {
      // READ flow remains unchanged
      console.log("📖 Processing READ request...");
      const readRequest = await parseReadRequest(text);
      result = await processReadRequest(readRequest, from);
      await sendReadResponse(from, result);
    } else {
      // WRITE flow: Add validation before confirmation
      console.log("✍️ Processing WRITE request...");

      // AI interprets the message → JSON
      parsedData = await parseMessageWithAI(text);
      console.log("🤖 Parsed write data:", parsedData);

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

      // REQUEST CONFIRMATION ONLY FOR VALID DATA
      const confirmationRequest = await requestWriteConfirmation(
        from,
        parsedData,
        "CREATE"
      );

      await sendWhatsAppMessage(from, confirmationRequest.confirmationMessage);

      // Log the confirmation request
      await logAction(
        "confirmation_requested",
        parsedData.Students?.[0]?.name || "",
        rawMessage,
        JSON.stringify(parsedData),
        "pending",
        "",
        `whatsapp_${from}`
      );
    }

    res.status(200).send("EVENT_RECEIVED");
  } catch (err) {
    console.error("❌ Webhook error:", err);

    try {
      await sendWhatsAppMessage(
        from,
        "❌ *System Error*\n\nSorry, something went wrong. Please try again later."
      );
    } catch (sendError) {
      console.error("❌ Failed to send error message:", sendError);
    }

    await logAction(
      "webhook_message",
      "",
      rawMessage,
      parsedData,
      "error",
      err.message,
      "whatsapp_bot"
    );

    res.sendStatus(500);
  }
};

// Helper function to process confirmed operations
const processConfirmedOperation = async (confirmationResult) => {
  try {
    const { data, operation } = confirmationResult;

    if (operation === "CREATE") {
      const result = await sheetsService.createData(data);
      return {
        success: true,
        message: "✅ Data has been successfully added to the sheet!",
      };
    } else if (operation === "UPDATE") {
      const result = await sheetsService.updateData(data);
      return {
        success: true,
        message: "✅ Data has been successfully updated in the sheet!",
      };
    }

    return {
      success: false,
      message: "❌ Unknown operation type.",
    };
  } catch (error) {
    logger.error("Error processing confirmed operation:", error);
    return {
      success: false,
      message: "❌ Failed to process the operation. Please try again.",
    };
  }
};

// Add this validation function
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
