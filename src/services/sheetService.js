import { google } from "googleapis";
import { addStudent, addInstallment } from "../controllers/sheetsController.js";

const auth = new google.auth.GoogleAuth({
  keyFile:
    process.env.GOOGLE_CREDENTIALS_FILE ||
    "chat2sheet-469716-1bebf546c040.json", // Fixed: Use correct credentials file
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Remove due date and last payment date fields from fee sheet operations
function createFeeSheetHeaders() {
  return [
    "Student Name",
    "Roll Number",
    "Class",
    "Fee Amount",
    "Payment Status",
    "Remarks",
    // Removed: 'Due Date', 'Last Payment Date'
  ];
}

function formatFeeSheetData(studentData) {
  return studentData.map((student) => [
    student.name,
    student.rollNumber,
    student.class,
    student.feeAmount,
    student.paymentStatus,
    student.remarks,
    // Removed: student.dueDate, student.lastPaymentDate
  ]);
}

// Main function to process AI-parsed data
export async function processAIData(parsedData, rawMessage = "", isConfirmed = false) {
  try {
    console.log("📊 Processing AI data:", JSON.stringify(parsedData, null, 2));

    const results = {
      students: [],
      installments: [],
      logs: [],
      success: true,
      message: "Data processed successfully",
    };

    // Process students first if any
    if (parsedData.Students && parsedData.Students.length > 0) {
      console.log("👨‍🎓 Processing Students data...");

      for (const studentData of parsedData.Students) {
        try {
          console.log("Adding student:", studentData);
          const studentResult = await addStudent(studentData);
          results.students.push(studentResult);
          console.log("✅ Student added:", studentResult);
        } catch (error) {
          console.error("❌ Error adding student:", error);
          results.students.push({
            success: false,
            error: error.message,
            data: studentData,
          });
          results.success = false;
        }
      }
    }

    // Process installments with better success messaging
    if (parsedData.Installments && parsedData.Installments.length > 0) {
      console.log("💰 Processing Installments data...");

      for (let index = 0; index < parsedData.Installments.length; index++) {
        const installmentData = parsedData.Installments[index];

        try {
          // Validate student ID or name before processing
          if (!installmentData.stud_id && !installmentData.name) {
            console.error("❌ Invalid installment data: No student ID or name provided");
            results.installments.push({
              success: false,
              error: "Invalid student ID or name provided. Please specify either student ID or student name.",
              data: installmentData,
            });
            continue;
          }

          // Ensure required fields are populated
          const completeInstallmentData = {
            ...installmentData,
            date: installmentData.date || new Date().toISOString().split("T")[0],
            mode: installmentData.mode || "cash",
            remarks: installmentData.remarks || "",
            recorded_by: installmentData.recorded_by || "WhatsApp",
          };

          const installmentResult = await addInstallment(completeInstallmentData);
          results.installments.push(installmentResult);

          console.log("✅ Installment added:", installmentResult);
        } catch (error) {
          console.error("❌ Error adding installment:", error);
          results.installments.push({
            success: false,
            error: error.message,
            data: installmentData,
          });
        }
      }
    }

    // Generate success message based on what was processed
    if (results.students.length > 0 && results.students.every(s => s.success)) {
      let successMessage = "✅ *Data processed successfully!*\n\n";
      successMessage += "👨‍🎓 *Students Added:*\n";
      
      results.students.forEach(student => {
        // Access the correct stud_id from the addStudent response
        const studentId = student.stud_id; // This comes directly from addStudent return
        const studentName = student.data.name;
        successMessage += `• ${studentName} (${studentId})\n`;
      });
      
      successMessage += "\nData has been updated in the Google Sheets! 📊";
      results.message = successMessage;
    }

    // Generate better success message for installments
    const successfulInstallments = results.installments.filter(i => i.success);
    
    if (successfulInstallments.length > 0) {
      let successMessage = "✅ *Payment processed successfully!*\n\n";
      successMessage += "💰 *Installments Added:*\n";
      
      successfulInstallments.forEach(inst => {
        const studentName = inst.student_name || inst.data?.name || "Student";
        const amount = inst.data?.installment_amount || inst.amount || "0";
        successMessage += `• ₹${amount} for ${studentName}\n`;
      });
      
      successMessage += "\n📊 Data has been updated in the Google Sheets! 📋";
      
      results.message = successMessage;
    }

    return results;

  } catch (error) {
    console.error("❌ Error in processAIData:", error);
    throw error;
  }
}
