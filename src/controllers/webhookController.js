import { parseMessageWithAI } from "../services/aiService.js";
import { processAIData } from "../services/sheetService.js";
import { logAction } from "./sheetsController.js";
import { sendFormattedResponse } from "../services/whatsappService.js";

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

    // AI interprets the message → JSON
    parsedData = await parseMessageWithAI(text);
    console.log("🤖 Parsed:", parsedData);

    // Push data to Google Sheets using AI processing service
    const result = await processAIData(parsedData);
    console.log("📊 Sheet processing result:", result);

    // Send response back to WhatsApp
    try {
      await sendFormattedResponse(from, result);
      console.log("✅ Response sent to WhatsApp");
    } catch (whatsappError) {
      console.error("❌ Failed to send WhatsApp response:", whatsappError);
      // Continue processing even if WhatsApp response fails
    }

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
      const errorMessage = "❌ Sorry, there was an error processing your request. Please try again or contact support.";
      await sendWhatsAppMessage(msg.from, errorMessage);
    } catch (whatsappError) {
      console.error("❌ Failed to send error message to WhatsApp:", whatsappError);
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
