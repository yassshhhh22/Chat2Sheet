import Groq from "groq-sdk";
import "dotenv/config";

const apiKey = process.env.GROQ_API_KEY;
const groq = new Groq({ apiKey });

export async function classifyMessage(userMessage) {
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
    console.log("🔍 Raw classifier response:", content);

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
    console.log("✅ Message classified as:", classification);
    return classification;
  } catch (error) {
    console.error("❌ Classification error:", error);
    // Default to READ for safety
    return {
      operation: "READ",
      confidence: 0.5,
      reasoning: "Classification failed, defaulting to read",
    };
  }
}
