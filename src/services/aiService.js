import Groq from "groq-sdk";
import "dotenv/config";
import {
  findStudentById,
  findStudentByName,
  getStudentFeeStatus,
} from "./sheetsService.js";
import { processAIData } from "./sheetService.js";

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

6. **IMPORTANT**: Always return the main object with ALL possible arrays, even if empty:
   {
     "Students": [],
     "Fees": [],
     "Installments": [],
     "Logs": []
   }

---

### Example 1: Installment (Minimal Info)

Input: "student id STU123 paid 4000"

Output:
{
  "Students": [],
  "Fees": [],
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
  "Installments": [],
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

    // Extract JSON if wrapped in markdown or extra text
    let jsonStr = content;
    if (content.includes("{")) {
      const startIndex = content.indexOf("{");
      const lastIndex = content.lastIndexOf("}");
      if (startIndex !== -1 && lastIndex !== -1) {
        jsonStr = content.substring(startIndex, lastIndex + 1);
      }
    }

    const parsed = JSON.parse(jsonStr);

    // Ensure all arrays exist to prevent undefined errors
    const result = {
      Students: parsed.Students || [],
      Fees: parsed.Fees || [],
      Installments: parsed.Installments || [],
      Logs: parsed.Logs || [],
    };

    return result;
  } catch (error) {
    console.error("❌ AI parsing error:", error);
    // Return fallback structure with all arrays
    return {
      Students: [],
      Fees: [],
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

// Add confirmation state management
const pendingConfirmations = new Map();

// Add helper function to format data
const formatDataForConfirmation = (data, operation) => {
  if (Array.isArray(data)) {
    return data
      .map(
        (row, index) =>
          `Row ${index + 1}: ${Object.entries(row)
            .map(([key, value]) => `${key}: ${value}`)
            .join(", ")}`
      )
      .join("\n");
  } else if (typeof data === "object") {
    return Object.entries(data)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");
  }
  return JSON.stringify(data, null, 2);
};

// Add function to handle confirmation responses
export const handleConfirmationResponse = async (phoneNumber, response) => {
  const pendingConfirmation = pendingConfirmations.get(phoneNumber);

  if (!pendingConfirmation) {
    return {
      error: true,
      message: "No pending confirmation found.",
    };
  }

  const normalizedResponse = response.trim().toLowerCase();

  if (normalizedResponse === "yes" || normalizedResponse === "y") {
    // Remove from pending and proceed with operation
    pendingConfirmations.delete(phoneNumber);

    return {
      confirmed: true,
      data: pendingConfirmation.data,
      operation: pendingConfirmation.operation,
      message: "✅ Confirmed! Processing your request...",
    };
  } else if (normalizedResponse === "no" || normalizedResponse === "n") {
    // Remove from pending and cancel
    pendingConfirmations.delete(phoneNumber);

    return {
      confirmed: false,
      message: "❌ Operation cancelled.",
    };
  } else {
    return {
      error: true,
      message: "Please reply with *YES* to confirm or *NO* to cancel.",
    };
  }
};

// Add function to check if user has pending confirmation
export const hasPendingConfirmation = (phoneNumber) => {
  return pendingConfirmations.has(phoneNumber);
};

// Add this function to handle confirmation requests
export async function requestWriteConfirmation(phoneNumber, data, operation) {
  try {
    const confirmationId = `conf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Store confirmation data
    pendingConfirmations.set(phoneNumber, {
      id: confirmationId,
      data: data,
      operation: operation,
      timestamp: Date.now(),
    });

    let confirmationMessage = "⚠️ *Confirmation Required*\n\n";

    // Handle student creation
    if (data.Students && data.Students.length > 0) {
      confirmationMessage += "👨‍🎓 *Student Registration Details:*\n\n";
      
      for (const student of data.Students) {
        confirmationMessage += `👨‍🎓 *Student:* ${student.name}\n`;
        confirmationMessage += `📚 *Class:* ${student.class}\n`;
        confirmationMessage += `👤 *Parent Name:* ${student.parent_name}\n`;
        confirmationMessage += `📞 *Parent Phone:* ${student.parent_no}\n`;
        confirmationMessage += `📱 *Student Phone:* ${student.phone_no}\n`;
        confirmationMessage += `📧 *Email:* ${student.email}\n`;
        
        // Add fee details if present
        if (data.Fees && data.Fees.length > 0) {
          const studentFee = data.Fees.find(f => f.name === student.name);
          if (studentFee) {
            confirmationMessage += `💰 *Total Fees:* ₹${studentFee.total_fees}\n`;
            confirmationMessage += `💵 *Initial Balance:* ₹${studentFee.balance}\n`;
          }
        }
        confirmationMessage += "\n";
      }
    }

    // Enhanced preview for installments (existing code)
    if (data.Installments && data.Installments.length > 0) {
      confirmationMessage += "💳 *Payment Details:*\n\n";
      
      for (const inst of data.Installments) {
        // Get student details for better confirmation
        let studentDetails = null;
        try {
          if (inst.stud_id) {
            studentDetails = await findStudentById(inst.stud_id);
          } else if (inst.name) {
            studentDetails = await findStudentByName(inst.name);
          }
        } catch (error) {
          console.error("Error fetching student details for confirmation:", error);
        }

        if (studentDetails) {
          const feeStatus = await getStudentFeeStatus(studentDetails.stud_id);
          const currentBalance = parseFloat(feeStatus?.balance || 0);
          const paymentAmount = parseFloat(inst.installment_amount || 0);
          const newBalance = currentBalance - paymentAmount;

          confirmationMessage += `👨‍🎓 *Student:* ${studentDetails.name}\n`;
          confirmationMessage += `🆔 *Student ID:* ${studentDetails.stud_id}\n`;
          confirmationMessage += `📚 *Class:* ${studentDetails.class}\n`;
          confirmationMessage += `💰 *Amount:* ₹${inst.installment_amount}\n`;
          confirmationMessage += `💳 *Mode:* ${inst.mode || 'cash'}\n`;
          confirmationMessage += `📅 *Date:* ${inst.date || new Date().toISOString().split('T')[0]}\n`;
          confirmationMessage += `💵 *Current Balance:* ₹${currentBalance}\n`;
          confirmationMessage += `💵 *New Balance:* ₹${newBalance}\n`;
          
          if (inst.remarks) {
            confirmationMessage += `📝 *Remarks:* ${inst.remarks}\n`;
          }
        } else {
          // Fallback if student not found
          confirmationMessage += `🆔 *Student ID:* ${inst.stud_id || "N/A"}\n`;
          confirmationMessage += `👨‍🎓 *Student Name:* ${inst.name || "N/A"}\n`;
          confirmationMessage += `💰 *Amount:* ₹${inst.installment_amount}\n`;
          confirmationMessage += `💳 *Mode:* ${inst.mode || 'cash'}\n`;
          confirmationMessage += `📅 *Date:* ${inst.date || new Date().toISOString().split('T')[0]}\n`;
          
          if (inst.remarks) {
            confirmationMessage += `📝 *Remarks:* ${inst.remarks}\n`;
          }
        }
        confirmationMessage += "\n";
      }
    }

    confirmationMessage += "\nReply *YES* to confirm or *NO* to cancel.";

    return {
      confirmationId,
      confirmationMessage,
      requiresConfirmation: true,
    };
  } catch (error) {
    console.error("❌ Error requesting confirmation:", error);
    throw error;
  }
};

// Add function to handle webhook payments (no confirmation needed)
export async function processWebhookPayment(aiCommand) {
  try {
    console.log("🔄 Processing webhook payment:", aiCommand);

    // Parse the payment command
    const parsedData = await parseMessageWithAI(aiCommand);

    if (
      !parsedData ||
      !parsedData.Installments ||
      parsedData.Installments.length === 0
    ) {
      throw new Error("Failed to parse payment data");
    }

    // Process immediately without confirmation (webhook is trusted)
    const result = await processAIData(parsedData);

    return result;
  } catch (error) {
    console.error("❌ Webhook payment processing error:", error);
    throw error;
  }
}
