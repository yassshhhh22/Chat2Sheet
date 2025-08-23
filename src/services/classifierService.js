import Groq from "groq-sdk";
import "dotenv/config";
import { hasPendingConfirmation } from "./aiService.js";

const apiKey = process.env.GROQ_API_KEY;
const groq = new Groq({ apiKey });

// Add confirmation detection
export async function classifyMessage(userMessage, phoneNumber) {
  // Check if user has pending confirmation
  if (hasPendingConfirmation(phoneNumber)) {
    const normalizedMessage = userMessage.trim().toLowerCase();

    if (["yes", "y", "confirm", "ok", "proceed"].includes(normalizedMessage)) {
      return {
        intent: "CONFIRMATION_YES",
        confidence: 1.0,
      };
    } else if (
      ["no", "n", "cancel", "stop", "abort"].includes(normalizedMessage)
    ) {
      return {
        intent: "CONFIRMATION_NO",
        confidence: 1.0,
      };
    } else {
      return {
        intent: "CONFIRMATION_INVALID",
        confidence: 1.0,
      };
    }
  }

  const prompt = `Classify this message and return ONLY a JSON object with operation and confidence:

Message: "${userMessage}"

Return format (no markdown, no extra text):
{"operation": "CREATE|READ|UPDATE|DELETE", "confidence": 0.85}

Examples:
- "Show me details of Rahul" -> {"operation": "READ", "confidence": 0.9}
- "Add new student" -> {"operation": "CREATE", "confidence": 0.9}
- "Update phone number" -> {"operation": "UPDATE", "confidence": 0.85}
- "Delete student STU123" -> {"operation": "DELETE", "confidence": 0.9}`;

  try {
    const response = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 200,
    });

    const content = response.choices[0].message.content.trim();

    // Extract JSON
    let jsonStr = content;
    if (content.includes("{")) {
      const startIndex = content.indexOf("{");
      const lastIndex = content.lastIndexOf("}");
      if (startIndex !== -1 && lastIndex !== -1) {
        jsonStr = content.substring(startIndex, lastIndex + 1);
      }
    }

    const classification = JSON.parse(jsonStr);
    return classification;
  } catch (error) {
    console.error("❌ Classification error:", error);
    // Default to read for safety
    return {
      operation: "READ",
      confidence: 0.5,
      reasoning: "Classification failed, defaulting to read",
    };
  }
}
  
