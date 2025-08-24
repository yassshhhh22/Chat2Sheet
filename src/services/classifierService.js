import Groq from "groq-sdk";
import "dotenv/config";
import { hasPendingConfirmation } from "./aiService.js";

const apiKey = process.env.GROQ_API_KEY;
const groq = new Groq({ apiKey });

// Add confirmation detection
export async function classifyMessage(userMessage, phoneNumber) {
  try {
    // Check for confirmation responses first
    const normalizedMessage = userMessage.toLowerCase().trim();
    if (normalizedMessage === "yes" || normalizedMessage === "y") {
      return {
        operation: "CONFIRM",
        confidence: 1.0,
        student_id: null,
      };
    }

    if (normalizedMessage === "no" || normalizedMessage === "n") {
      return {
        operation: "CANCEL",
        confidence: 1.0,
        student_id: null,
      };
    }

    console.log("🤖 Classifying message:", userMessage);

    const prompt = `Classify this school fee management message. Determine the operation type.

Message: "${userMessage}"

Return ONLY a JSON object in this exact format:
{"operation": "CREATE|READ|UPDATE|DELETE|REMIND_ALL|REMIND_SPECIFIC", "confidence": 0.85, "student_id": "STU123"}

Rules:
- READ: Viewing/searching information, reports, payment history
- CREATE: Adding new students, fees, or payments  
- UPDATE: Modifying existing data
- DELETE: Removing data
- REMIND_ALL: Sending reminders to all students' parents
- REMIND_SPECIFIC: Sending reminder to specific student's parent (include student_id)

Examples:
- "Show me details of Rahul" → {"operation": "READ", "confidence": 0.9}
- "Add new student" → {"operation": "CREATE", "confidence": 0.9}
- "Add installment for STU1257" → {"operation": "CREATE", "confidence": 0.9}
- "Update phone number" → {"operation": "UPDATE", "confidence": 0.85}
- "Delete student STU123" → {"operation": "DELETE", "confidence": 0.9}
- "Send reminder to all" → {"operation": "REMIND_ALL", "confidence": 0.9}
- "Send reminder to STU123" → {"operation": "REMIND_SPECIFIC", "confidence": 0.9, "student_id": "STU123"}`;

    const response = await groq.chat.completions.create({
      model: "llama3-8b-8192",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 150,
    });

    let responseText = response.choices[0].message.content.trim();
    console.log("🤖 Raw classifier response:", responseText);

    // Clean up the response to ensure it's valid JSON
    responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    responseText = responseText.replace(/^\s*[\r\n]+/gm, ''); // Remove empty lines
    responseText = responseText.trim();

    // Extract JSON if there's extra text
    const jsonMatch = responseText.match(/\{[^}]*\}/);
    if (jsonMatch) {
      responseText = jsonMatch[0];
    }

    console.log("🧹 Cleaned classifier response:", responseText);

    const result = JSON.parse(responseText);
    console.log("✅ Parsed classification:", result);

    return result;
  } catch (error) {
    console.error("❌ Classification error:", error.message);
    console.error("Raw response that failed:", error);
    
    // Fallback classification based on keywords
    const lowerMessage = userMessage.toLowerCase();
    
    if (lowerMessage.includes("add") || lowerMessage.includes("installment") || lowerMessage.includes("payment")) {
      console.log("🔧 Fallback: Detected CREATE operation");
      return {
        operation: "CREATE",
        confidence: 0.7,
        student_id: extractStudentId(userMessage),
      };
    }
    
    if (lowerMessage.includes("show") || lowerMessage.includes("get") || lowerMessage.includes("history")) {
      console.log("🔧 Fallback: Detected READ operation");
      return {
        operation: "READ",
        confidence: 0.7,
        student_id: extractStudentId(userMessage),
      };
    }
    
    // Default fallback
    console.log("🔧 Fallback: Defaulting to READ operation");
    return {
      operation: "READ",
      confidence: 0.5,
      student_id: null,
    };
  }
}

// Helper function to extract student ID from message
function extractStudentId(message) {
  const studentIdMatch = message.match(/STU\d+/i);
  return studentIdMatch ? studentIdMatch[0].toUpperCase() : null;
}

