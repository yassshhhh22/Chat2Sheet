import Groq from "groq-sdk";
import "dotenv/config";

const apiKey = process.env.GROQ_API_KEY;

const groq = new Groq({ apiKey });

export async function parseMessageWithAI(userMessage) {
  const prompt = `
You are a structured data parser for a student fee management system.  
Always return parsed JSON data that matches the given Excel sheet schemas exactly.  
The schemas are strict and persistent — do not add or remove fields.  

📑 SCHEMAS (DO NOT ALTER):
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
H1: due_date  
I1: last_payment_date  

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
B1: action (add_student_fee | generate_invoice | reminder | update_student | add_installment)  
C1: stud_id  
D1: raw_message  
E1: parsed_json  
F1: result (success | fail | partial)  
G1: error_msg  
H1: performed_by  
I1: timestamp  

---

### RULES:
- If the input relates to an **installment payment**, return only two sections in parsed data:
  1. **Installments** → exactly one row with all fields filled.  
  2. **Logs** → exactly one row logging the action.  
- **Do NOT return or update Fees sheet directly in parsed data.**  
  Fees updates (total_paid and balance) will be calculated automatically in the controller using the installment_amount.  
- Always include all fields of the schema, even if empty ("").  
- Keep the schema field names consistent at all times.
- RETURN ONLY VALID JSON. NO EXPLANATIONS OR EXTRA TEXT.

---

### Example  
Input: "Rahul Sharma of class 10 paid ₹5000 today via UPI"  

Output:
{
  "Installments": [
    {
      "inst_id": "INST123",
      "stud_id": "STU101",
      "name": "Rahul Sharma",
      "class": "10",
      "installment_amount": "5000",
      "date": "2025-08-22",
      "mode": "UPI",
      "remarks": "",
      "recorded_by": "staff01",
      "created_at": "2025-08-22T10:30:00Z"
    }
  ],
  "Logs": [
    {
      "log_id": "LOG456",
      "action": "add_installment",
      "stud_id": "STU101",
      "raw_message": "Rahul Sharma of class 10 paid ₹5000 today via UPI",
      "parsed_json": "{Installments entry above}",
      "result": "success",
      "error_msg": "",
      "performed_by": "staff01",
      "timestamp": "2025-08-22T10:30:05Z"
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
