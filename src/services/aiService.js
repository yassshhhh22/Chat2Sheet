import Groq from "groq-sdk";
import "dotenv/config";

const apiKey = process.env.GROQ_API_KEY;

const groq = new Groq({ apiKey });

export async function parseMessageWithAI(userMessage) {
  const prompt = `
You are a structured data parser for a student fee management system.
Always return parsed JSON data that matches the given Excel sheet schemas exactly.
The schemas are strict and persistent — do not add or remove fields.

---

### 📑 SCHEMAS (DO NOT ALTER):

1. **Students Sheet**
   A1: stud_id
   B1: name
   C1: class
   D1: parent_name
   E1: parent_no
   F1: phone_no
   G1: email
   H1: created_at

2. **Fees Sheet**
   A1: stud_id
   B1: name
   C1: class
   D1: total_fees
   E1: total_paid
   F1: balance
   G1: status

3. **Installments Sheet**
   A1: inst_id
   B1: stud_id
   C1: name
   D1: class
   E1: installment_amount
   F1: date
   G1: mode
   H1: remarks
   I1: recorded_by
   J1: created_at

4. **Logs Sheet**
   A1: log_id
   B1: action (add_student_fee | generate_invoice | reminder | update_student | add_installment | add_student)
   C1: stud_id
   D1: raw_message
   E1: parsed_json
   F1: result (success | fail | partial)
   G1: error_msg
   H1: performed_by
   I1: timestamp

---

### RULES:

1. **Installment Payment**
   * Staff will provide the stud_id and installment amount.
   * For installments, ONLY stud_id and installment_amount are required.
   * Leave name, class, mode, and remarks as empty strings ("") if not provided.
   * Parsed data must include only:
     * **Installments** → exactly one row with stud_id, installment_amount filled, other fields can be empty
     * **Logs** → exactly one row logging the action with the same stud_id
   * Do **not** update Fees directly in the parsed data — controller calculates total_paid and balance.

2. **New Student Creation**
   * Parsed data must include:
     * **Students** → all fields except stud_id and created_at (controller will generate these)
     * **Fees** → all fields, with:
       * total_paid = "0"
       * balance = total_fees
       * status = "unpaid"
     * **Logs** → exactly one row logging the creation

3. Always include **all fields from the schema**, even if empty ("").

4. Keep field names and structure **exactly consistent**.

5. RETURN ONLY VALID JSON. NO EXPLANATIONS OR EXTRA TEXT.

---

### Example 1: Installment (Minimal Info)

Input: "student id STU123 paid 4000"

Output:
{
  "Installments": [
    {
      "inst_id": "INST234",
      "stud_id": "STU123",
      "name": "",
      "class": "",
      "installment_amount": "4000",
      "date": "2025-08-22",
      "mode": "",
      "remarks": "",
      "recorded_by": "staff01",
      "created_at": "2025-08-22T12:00:00Z"
    }
  ],
  "Logs": [
    {
      "log_id": "LOG567",
      "action": "add_installment",
      "stud_id": "STU123",
      "raw_message": "student id STU123 paid 4000",
      "parsed_json": "{Installments entry above}",
      "result": "success",
      "error_msg": "",
      "performed_by": "staff01",
      "timestamp": "2025-08-22T12:00:05Z"
    }
  ]
}

---

### Example 2: New Student

Input: "Create student Rahul Pandey class 12, parent name: Mr Pandey, parent number: 9999999999, phone: 8888888888, email: rahul@example.com, total fees: 40000"

Output:
{
  "Students": [
    {
      "name": "Rahul Pandey",
      "class": "12",
      "parent_name": "Mr Pandey",
      "parent_no": "9999999999",
      "phone_no": "8888888888",
      "email": "rahul@example.com"
    }
  ],
  "Fees": [
    {
      "name": "Rahul Pandey",
      "class": "12",
      "total_fees": "40000",
      "total_paid": "0",
      "balance": "40000",
      "status": "unpaid"
    }
  ],
  "Logs": [
    {
      "log_id": "LOG789",
      "action": "add_student",
      "stud_id": "",
      "raw_message": "Create student Rahul Pandey class 12, parent name: Mr Pandey, parent number: 9999999999, phone: 8888888888, email: rahul@example.com, total fees: 40000",
      "parsed_json": "{Students and Fees entry above}",
      "result": "success",
      "error_msg": "",
      "performed_by": "staff01",
      "timestamp": "2025-08-22T11:00:05Z"
    }
  ]
}

Input: ${userMessage}
`;

  try {
    const response = await groq.chat.completions.create({
      model: "llama3-8b-8192",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 1000,
    });

    const content = response.choices[0].message.content.trim();
    console.log("🔍 Raw AI response:", content);

    // Extract JSON if wrapped in markdown or extra text
    let jsonStr = content;
    if (content.includes("{")) {
      const startIndex = content.indexOf("{");
      const lastIndex = content.lastIndexOf("}");
      if (startIndex !== -1 && lastIndex !== -1) {
        jsonStr = content.substring(startIndex, lastIndex + 1);
      }
    }

    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("❌ AI parsing error:", error);
    // Return fallback structure
    return {
      Installments: [],
      Logs: [
        {
          log_id: `LOG_${Date.now()}`,
          action: "parse_error",
          stud_id: "",
          raw_message: userMessage,
          parsed_json: "",
          result: "fail",
          error_msg: error.message,
          performed_by: "ai_parser",
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }
}
