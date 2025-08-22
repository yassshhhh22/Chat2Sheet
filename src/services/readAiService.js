import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

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

  // Update the prompt to include date-based queries
  const prompt = `You are a school fee management assistant for READ queries. Analyze this user query and return ONLY valid JSON.

User Query: "${userMessage}"

Determine the query type and extract parameters. Return JSON in this exact format:

For date-based payment queries:
{"query_type": "payment_history", "parameters": {"date_filter": "2025-08-22", "date_range": {"start": "2025-08-22", "end": "2025-08-22"}}, "output_format": "detailed"}

For individual student details: 
{"query_type": "student_details", "parameters": {"stud_id": "STU123", "name": "", "class": ""}, "output_format": "detailed"}

For individual fee status:
{"query_type": "fee_status", "parameters": {"stud_id": "STU123", "name": "", "class": ""}, "output_format": "detailed"}

For class-specific queries:
{"query_type": "class_report", "parameters": {"class": "11"}, "output_format": "list"}

For aggregate/summary queries:
{"query_type": "aggregate_summary", "parameters": {"criteria": "paid_less_than_10000", "amount": "10000", "class": ""}, "output_format": "summary"}

For student search by name:
{"query_type": "student_search", "parameters": {"stud_id": "", "name": "John", "class": ""}, "output_format": "list"}

For payment history:
{"query_type": "payment_history", "parameters": {"stud_id": "STU123", "name": "", "class": ""}, "output_format": "detailed"}

IMPORTANT CLASSIFICATION RULES:
- "payments received on [date]" or "payments on [date]" -> use "payment_history" with date_filter
- "payments between [date1] and [date2]" -> use "payment_history" with date_range
- "students in class X" -> use "class_report"
- "total students with [fee criteria]" -> use "aggregate_summary"

RETURN ONLY THE JSON OBJECT, NO OTHER TEXT.`;

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

    // If no valid JSON found, use fallback
    if (!jsonStr.includes("{") || !jsonStr.includes("}")) {
      console.log("❌ No valid JSON found in response, using fallback");
      return createFallbackResponse(userMessage);
    }

    const parsed = JSON.parse(jsonStr);

    // Validate the response structure
    const validQueryTypes = [
      "student_search",
      "fee_status", 
      "payment_history",
      "student_details",
      "class_report",
      "aggregate_summary",
    ];

    if (!parsed.query_type || !validQueryTypes.includes(parsed.query_type)) {
      console.error("❌ Invalid query type returned:", parsed.query_type);
      return createFallbackResponse(userMessage);
    }

    // Ensure parameters exist
    if (!parsed.parameters) {
      parsed.parameters = {
        stud_id: "",
        name: "",
        class: "",
        date_range: { start: "", end: "" },
      };
    }

    console.log("✅ Parsed read request:", parsed);
    return parsed;
  } catch (error) {
    console.error("❌ Read AI parsing error:", error);
    console.error("❌ Failed to parse message:", userMessage);
    return createFallbackResponse(userMessage);
  }
}

// Helper function to create fallback response for READ operations
function createFallbackResponse(userMessage) {
  const fallbackResult = {
    query_type: "student_search",
    parameters: {
      stud_id: "",
      name: "",
      class: "",
      criteria: "",
      amount: "",
      date_range: { start: "", end: "" },
    },
    output_format: "summary",
  };

  // Check for class queries first (BEFORE aggregate)
  const classMatch = userMessage.match(/class\s+(\d+)|students\s+in\s+class\s+(\d+)/i);
  if (classMatch) {
    const classNumber = classMatch[1] || classMatch[2];
    fallbackResult.query_type = "class_report";
    fallbackResult.parameters.class = classNumber;
    console.log("🔧 Created class report fallback for class:", classNumber);
    return fallbackResult;
  }

  // Check for aggregate queries
  const aggregateKeywords = /total|count|all students|how many|list of students/i;
  const feeKeywords = /fee|paid|balance|outstanding|pending/i;
  const amountMatch = userMessage.match(/(\d+)/);

  if (aggregateKeywords.test(userMessage) && feeKeywords.test(userMessage)) {
    fallbackResult.query_type = "aggregate_summary";
    
    if (userMessage.includes("less than") && amountMatch) {
      fallbackResult.parameters.criteria = `paid_less_than_${amountMatch[1]}`;
      fallbackResult.parameters.amount = amountMatch[1];
    } else if (userMessage.includes("more than") && amountMatch) {
      fallbackResult.parameters.criteria = `balance_more_than_${amountMatch[1]}`;
      fallbackResult.parameters.amount = amountMatch[1];
    } else if (userMessage.includes("outstanding") || userMessage.includes("pending")) {
      fallbackResult.parameters.criteria = "outstanding_fees";
    }
    
    console.log("🔧 Created aggregate fallback response:", fallbackResult);
    return fallbackResult;
  }

  // Try to extract student ID
  const studIdMatch = userMessage.match(/STU\d+/i);
  if (studIdMatch) {
    fallbackResult.parameters.stud_id = studIdMatch[0].toUpperCase();
    fallbackResult.query_type = "student_details";
  }

  console.log("🔧 Created fallback response:", fallbackResult);
  return fallbackResult;
}
