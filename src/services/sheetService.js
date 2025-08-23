import { google } from "googleapis";

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
export const processAIData = async (parsedData) => {
  try {
    console.log("🔍 Processing AI parsed data:", parsedData);

    const { addStudent, addInstallment, updateFeesSummary, logAction } =
      await import("../controllers/sheetsController.js");

    const results = {
      students: [],
      installments: [],
      fees_updates: [],
      logs: [],
      success: true,
      message: "Data processed successfully",
    };

    // Track processed installments to avoid duplicates
    const processedInstallments = new Set();
    const studentsToUpdate = new Set();

    // 1. Process Students data (new student creation)
    if (parsedData.Students && parsedData.Students.length > 0) {
      console.log("📝 Processing Students data...");
      for (const studentData of parsedData.Students) {
        try {
          const feesData =
            parsedData.Fees?.find((fee) => fee.name === studentData.name) || {};
          const completeStudentData = {
            ...studentData,
            total_fees: feesData.total_fees || "0",
          };

          const studentResult = await addStudent(completeStudentData);
          results.students.push(studentResult);
          console.log("✅ Student added:", studentResult);

          if (studentResult.success && studentResult.stud_id) {
            studentsToUpdate.add(studentResult.stud_id);
          }

          // Check for immediate installment
          const immediateInstallmentIndex = parsedData.Installments?.findIndex(
            (inst) =>
              inst.name === studentData.name ||
              inst.stud_id === studentResult.stud_id
          );

          if (immediateInstallmentIndex !== -1) {
            const immediateInstallment =
              parsedData.Installments[immediateInstallmentIndex];
            console.log(
              "💰 Processing immediate installment for new student..."
            );

            try {
              const installmentData = {
                ...immediateInstallment,
                stud_id: studentResult.stud_id,
                name: studentData.name,
                class: studentData.class,
                date:
                  immediateInstallment.date ||
                  new Date().toISOString().split("T")[0], // Auto-generate date
                recorded_by: immediateInstallment.recorded_by || "system",
              };

              const installmentResult = await addInstallment(installmentData);
              results.installments.push(installmentResult);
              processedInstallments.add(immediateInstallmentIndex);

              // Add to update list
              if (installmentResult.success) {
                studentsToUpdate.add(studentResult.stud_id);
              }

              console.log("✅ Immediate installment added:", installmentResult);
            } catch (error) {
              console.error("❌ Error adding immediate installment:", error);
              results.installments.push({
                success: false,
                error: error.message,
                data: immediateInstallment,
              });
            }
          }
        } catch (error) {
          console.error("❌ Error adding student:", error);
          results.students.push({
            success: false,
            error: error.message,
            data: studentData,
          });
        }
      }
    }

    // 2. Process remaining Installments data
    if (parsedData.Installments && parsedData.Installments.length > 0) {
      console.log("💰 Processing remaining Installments data...");

      for (let index = 0; index < parsedData.Installments.length; index++) {
        const installmentData = parsedData.Installments[index];

        if (processedInstallments.has(index)) {
          console.log(
            "⏭️ Skipping already processed installment at index:",
            index
          );
          continue;
        }

        try {
          // Validate student ID or name before processing
          if (!installmentData.stud_id && !installmentData.name) {
            console.error(
              "❌ Invalid installment data: No student ID or name provided"
            );
            results.installments.push({
              success: false,
              error:
                "Invalid student ID or name provided. Please specify either student ID or student name.",
              data: installmentData,
            });
            continue;
          }

          // Ensure required fields are populated with auto-generated values
          const completeInstallmentData = {
            ...installmentData,
            date:
              installmentData.date || new Date().toISOString().split("T")[0], // Auto-generate date
            mode: installmentData.mode || "cash", // Default payment mode
            remarks: installmentData.remarks || "",
            recorded_by: installmentData.recorded_by || "system",
          };

          const installmentResult = await addInstallment(
            completeInstallmentData
          );
          results.installments.push(installmentResult);
          console.log("✅ Installment added:", installmentResult);

          // Add student ID to update set if installment was successful
          if (installmentResult.success && installmentResult.stud_id) {
            studentsToUpdate.add(installmentResult.stud_id);
          }
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

    // 3. Process Logs data
    if (parsedData.Logs && parsedData.Logs.length > 0) {
      console.log("📋 Processing additional Logs data...");
      for (const logData of parsedData.Logs) {
        try {
          if (!logData.action?.includes("auto_generated")) {
            const logResult = await logAction(
              logData.action,
              logData.stud_id,
              logData.raw_message,
              logData.parsed_json,
              logData.result,
              logData.error_msg,
              logData.performed_by
            );
            results.logs.push(logResult);
            console.log("✅ Log added:", logResult);
          }
        } catch (error) {
          console.error("❌ Error adding log:", error);
          results.logs.push({
            success: false,
            error: error.message,
            data: logData,
          });
        }
      }
    }

    // 4. Update fees summary for all affected students
    console.log(
      "🔄 Updating fees summary for students:",
      Array.from(studentsToUpdate)
    );
    for (const studId of studentsToUpdate) {
      try {
        const updateResult = await updateFeesSummary(studId);
        results.fees_updates.push(updateResult);
        console.log("✅ Fees summary updated for:", studId);
      } catch (error) {
        console.error("❌ Error updating fees summary:", error);
        results.fees_updates.push({
          success: false,
          error: error.message,
          stud_id: studId,
        });
      }
    }

    console.log("🎉 All data processed successfully:", results);
    return results;
  } catch (error) {
    console.error("❌ Error processing AI data:", error);
    return {
      students: [],
      installments: [],
      fees_updates: [],
      logs: [],
      success: false,
      message: error.message,
    };
  }
};
