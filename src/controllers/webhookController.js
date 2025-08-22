import { parseMessageWithAI } from "../services/aiService.js";
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
    const from = msg.from; // sender's phone number
    const text = msg.text?.body;
    rawMessage = text;

    console.log("📩 Incoming message from:", from);
    console.log("📩 Message content:", text);

    // Step 1: Classify message as READ or WRITE
    const classification = await classifyMessage(text);
    console.log("🎯 Message classified as:", classification.operation);

    let result;

    if (classification.operation === "READ") {
      // READ flow: Parse read request → Process read request → Send read response
      console.log("📖 Processing READ request...");

      const readRequest = await parseReadRequest(text);
      console.log("🔍 Parsed read request:", readRequest);

      result = await processReadRequest(readRequest, from);
      console.log("📊 Read result:", result);

      // Send read response to WhatsApp
      await sendReadResponse(from, result);
    } else {
      // WRITE flow: Existing AI parsing → Sheet processing → Write response
      console.log("✍️ Processing WRITE request...");

      // AI interprets the message → JSON
      parsedData = await parseMessageWithAI(text);
      console.log("🤖 Parsed write data:", parsedData);

      // Push data to Google Sheets using AI processing service
      result = await processAIData(parsedData);
      console.log("📊 Sheet processing result:", result);

      // Send write response to WhatsApp
      await sendFormattedResponse(from, result);
    }

    console.log("✅ Response sent to WhatsApp");

    // Log successful action
    await logAction(
      "webhook_message",
      result.students?.[0]?.stud_id || result.installments?.[0]?.stud_id || "",
      rawMessage,
      parsedData,
      "success",
      "",
      `whatsapp_${from}`
    );

    // Respond to WhatsApp (webhook confirmation)
    res.status(200).send("EVENT_RECEIVED");
  } catch (err) {
    console.error("❌ Webhook error:", err);

    // Send error message to WhatsApp user
    try {
      await sendWhatsAppMessage(
        from,
        "❌ *System Error*\n\nSorry, something went wrong. Please try again later."
      );
    } catch (sendError) {
      console.error("❌ Failed to send error message:", sendError);
    }

    // Log error action
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
