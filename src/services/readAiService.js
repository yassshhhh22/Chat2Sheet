import Groq from "groq-sdk";
import "dotenv/config";

const apiKey = process.env.GROQ_API_KEY;
const groq = new Groq({ apiKey });

export async function parseReadRequest(userMessage) {
  // Handle undefined or empty messages
  if (!userMessage || userMessage.trim() === "") {
    return {
      query_type: "error",
      parameters: {
        stud_id: "",
        name: "",
        class: "",
        date_range: { start: "", end: "" },
      },
      output_format: "summary",
      error: "Empty message received",
    };
  }

  // ...existing code...
  // ...existing code...
// Update the prompt to handle aggregate queries better
const prompt = `You are a school fee management assistant. Analyze user queries and extract structured information.

For READ operations, determine:
1. query_type: "fee_status", "student_info", "payment_history", "aggregate_summary"
2. parameters: Extract relevant filters
3. output_format: "detailed", "summary", "list"

Query Types:
- fee_status: Individual student fee information (requires stud_id OR name)
- student_info: Student details (requires stud_id OR name)  
- payment_history: Payment records (requires stud_id OR name)
- aggregate_summary: Total/summary data across students (no individual student required)

For aggregate queries like "total installments received", "total fees collected", "summary for date":
- Use query_type: "aggregate_summary"
- Set parameters based on filters (date_range, class, fee_type)
- Student ID/name not required

Parameters:
- stud_id: Student ID number
- name: Student name
- class: Class/grade
- fee_filter: Fee type filter
- date_range: {start: "YYYY-MM-DD", end: "YYYY-MM-DD"}

ALWAYS return valid JSON only.`;
// ...existing code...
  // ...existing code...

  try {
    const response = await groq.chat.completions.create({
      model: "llama3-8b-8192",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 300,
    });

    const content = response.choices[0].message.content.trim();
    console.log("🔍 Raw read AI response:", content);

    // Extract JSON more reliably
    let jsonStr = content;

    // Remove markdown formatting
    jsonStr = jsonStr.replace(/```json\n?/g, "").replace(/```\n?/g, "");

    // Find JSON object boundaries
    const startIndex = jsonStr.indexOf("{");
    const lastIndex = jsonStr.lastIndexOf("}");

    if (startIndex !== -1 && lastIndex !== -1 && lastIndex > startIndex) {
      jsonStr = jsonStr.substring(startIndex, lastIndex + 1);
    }

    const parsed = JSON.parse(jsonStr);

    // Validate the response
    const validQueryTypes = [
      "student_search",
      "fee_status",
      "payment_history",
      "student_details",
      "class_report",
    ];

    if (!validQueryTypes.includes(parsed.query_type)) {
      console.error("❌ Invalid query type returned:", parsed.query_type);
      return {
        query_type: "student_search",
        parameters: {
          stud_id: "",
          name: userMessage,
          class: "",
          date_range: { start: "", end: "" },
        },
        output_format: "summary",
      };
    }

    console.log("✅ Parsed read request:", parsed);
    return parsed;
  } catch (error) {
    console.error("❌ Read AI parsing error:", error);
    console.error("❌ Failed to parse message:", userMessage);

    // Fallback: try to extract basic info
    const fallbackResult = {
      query_type: "student_search",
      parameters: {
        stud_id: "",
        name: "",
        class: "",
        fee_filter: null,
        date_range: { start: "", end: "" },
      },
      output_format: "summary",
    };

    // Try to extract student ID
    const studIdMatch = userMessage.match(/STU\d+/i);
    if (studIdMatch) {
      fallbackResult.parameters.stud_id = studIdMatch[0].toUpperCase();
      fallbackResult.query_type = "student_details";
    }

    // Try to extract class
    const classMatch = userMessage.match(/class\s+(\d+)/i);
    if (classMatch) {
      fallbackResult.parameters.class = classMatch[1];
    }

    // Try to extract fee filters
    const paidLessThanMatch = userMessage.match(/paid.*less.*?(\d+)/i);
    const balanceMoreThanMatch = userMessage.match(/balance.*more.*?(\d+)/i);
    const feesDueMatch = userMessage.match(/fees?\s+due|outstanding|pending/i);

    if (paidLessThanMatch) {
      fallbackResult.parameters.fee_filter = {
        type: "paid_less_than",
        amount: paidLessThanMatch[1],
      };
    } else if (balanceMoreThanMatch) {
      fallbackResult.parameters.fee_filter = {
        type: "balance_more_than",
        amount: balanceMoreThanMatch[1],
      };
    } else if (feesDueMatch) {
      fallbackResult.parameters.fee_filter = {
        type: "balance_more_than",
        amount: "0",
      };
    }

    // If no specific patterns found, treat as name search
    if (!studIdMatch && !classMatch && !fallbackResult.parameters.fee_filter) {
      fallbackResult.parameters.name = userMessage;
    }

    return fallbackResult;
  }
}
