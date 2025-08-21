import { parseMessageWithAI } from "../services/aiService.js";
import { updateSheet } from "../services/sheetService.js";
import { logAction } from "./sheetsController.js";

export const handleIncomingMessage = async (req, res) => {
  let rawMessage = "";
  // Initialize parsedData to null
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

    console.log("📩 Incoming message:", text);

    // AI interprets the message → JSON
    parsedData = await parseMessageWithAI(text);
    console.log("🤖 Parsed:", parsedData);

    // Push data to Google Sheets using new service
    const result = await updateSheet(parsedData);

    // Log successful action
    await logAction(
      "webhook_message",
      result.stud_id || "",
      rawMessage,
      parsedData,
      "success",
      "",
      `whatsapp_${from}`
    );

    // Respond to WhatsApp (optional confirmation)
    res.status(200).send("EVENT_RECEIVED");
  } catch (err) {
    console.error("❌ Webhook error:", err);

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
