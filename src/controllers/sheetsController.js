import {
  addStudentToSheet,
  findStudentByName,
  findStudentById,
  addFeesSummaryRecord,
  addInstallmentToSheet,
  addLogToSheet,
  updateFeesSummaryTotals,
} from "../services/sheetsService.js";

export async function addStudent(data) {
  try {
    console.log("🔍 addStudent received data:", data);

    // Remove the duplicate name check entirely
    // Multiple students can have the same name

    // Add student to students sheet
    const studId = await addStudentToSheet(data);

    // Add initial fees summary record with proper data
    const feesData = {
      stud_id: studId,
      name: data.name,
      class: data.class,
      total_fees: data.total_fees || "0",
      total_paid: "0",
      balance: data.total_fees || "0",
      status: "unpaid",
    };

    await addFeesSummaryRecord(
      studId,
      data.name,
      data.class,
      data.total_fees || 0
    );

    // Log the action
    await logAction(
      "add_student",
      studId,
      `Student ${data.name} created`,
      data,
      "success",
      "",
      "system"
    );

    return {
      success: true,
      stud_id: studId,
      message: `Student ${data.name} added successfully`,
      data: {
        stud_id: studId,
        name: data.name,
        class: data.class,
      },
    };
  } catch (error) {
    // Log the error
    await logAction(
      "add_student",
      "",
      `Failed to create student ${data.name}`,
      data,
      "error",
      error.message,
      "system"
    );
    throw error;
  }
}

export async function addInstallment(data) {
  try {
    console.log("🔍 addInstallment received data:", data);

    let student;

    // Check if we have stud_id, then find by ID, otherwise find by name
    if (data.stud_id) {
      console.log("🔍 Looking for student with ID:", data.stud_id);
      student = await findStudentById(data.stud_id);
    } else if (data.name) {
      console.log("🔍 Looking for student with name:", data.name);
      student = await findStudentByName(data.name);
    } else {
      throw new Error("No student ID or name provided");
    }

    if (!student) {
      throw new Error(`Student ${data.stud_id || data.name} not found`);
    }

    // 1. Prepare installment data with all required fields
    const installmentData = {
      stud_id: student.stud_id,
      name: student.name,
      class: student.class,
      installment_amount: data.installment_amount || data.amount || "0",
      date: data.date || new Date().toISOString().split("T")[0],
      mode: data.mode || "cash",
      remarks: data.remarks || "",
      recorded_by: data.recorded_by || "system",
      created_at: new Date().toISOString(),
    };

    // 2. Add installment to Installments sheet
    const instId = await addInstallmentToSheet(installmentData);

    // 3. Update fees summary (recalculate totals)
    await updateFeesSummary(student.stud_id);

    // 4. Log the action
    await logAction(
      "add_installment",
      student.stud_id,
      `Installment of ₹${installmentData.installment_amount} added for ${student.name}`,
      data,
      "success",
      "",
      installmentData.recorded_by
    );

    return {
      success: true,
      inst_id: instId,
      stud_id: student.stud_id,
      message: `Installment of ₹${installmentData.installment_amount} added successfully for ${student.name}`,
      data: {
        inst_id: instId,
        stud_id: student.stud_id,
        amount: installmentData.installment_amount,
        student_name: student.name,
      },
    };
  } catch (error) {
    // Log the error
    await logAction(
      "add_installment",
      data.stud_id || "",
      `Failed to add installment for ${data.stud_id || data.name}`,
      data,
      "error",
      error.message,
      data.recorded_by || "system"
    );
    throw error;
  }
}

export async function updateFeesSummary(studId) {
  try {
    console.log("🔍 Updating fees summary for student:", studId);

    // Use manual calculation to update totals
    await updateFeesSummaryTotals(studId);

    await logAction(
      "update_fees_summary",
      studId,
      `Fees summary updated for student ${studId}`,
      { stud_id: studId },
      "success",
      "",
      "system"
    );

    return {
      success: true,
      message: `Fees summary updated successfully for student ${studId}`,
      stud_id: studId,
    };
  } catch (error) {
    await logAction(
      "update_fees_summary",
      studId,
      `Failed to update fees summary for student ${studId}`,
      { stud_id: studId },
      "error",
      error.message,
      "system"
    );
    throw error;
  }
}

export async function logAction(
  action,
  studId,
  rawMessage,
  parsedJson,
  result,
  errorMsg,
  performedBy
) {
  try {
    const logData = {
      action,
      stud_id: studId || "",
      raw_message: rawMessage || "",
      parsed_json:
        typeof parsedJson === "object"
          ? JSON.stringify(parsedJson)
          : parsedJson || "",
      result: result || "success",
      error_msg: errorMsg || "",
      performed_by: performedBy || "system",
      timestamp: new Date().toISOString(),
    };

    await addLogToSheet(logData);
    return { success: true, message: "Action logged successfully" };
  } catch (error) {
    console.error("❌ Error logging action:", error);
    // Don't throw here to avoid infinite loop
    return { success: false, error: error.message };
  }
}

// New function to process complete AI data
export async function processCompleteAIData(parsedData, rawMessage) {
  try {
    console.log("🤖 Processing complete AI data:", parsedData);

    const results = {
      students: [],
      installments: [],
      fees_updates: [],
      logs: [],
      success: true,
      message: "Complete AI data processed successfully",
    };

    // Process in order: Students -> Installments -> Logs

    // 1. Add students first (if any)
    if (parsedData.Students && parsedData.Students.length > 0) {
      for (const studentData of parsedData.Students) {
        try {
          const studentResult = await addStudent(studentData);
          results.students.push(studentResult);
        } catch (error) {
          results.students.push({
            success: false,
            error: error.message,
            data: studentData,
          });
          results.success = false;
        }
      }
    }

    // 2. Add installments (if any)
    if (parsedData.Installments && parsedData.Installments.length > 0) {
      for (const installmentData of parsedData.Installments) {
        try {
          const installmentResult = await addInstallment(installmentData);
          results.installments.push(installmentResult);
        } catch (error) {
          results.installments.push({
            success: false,
            error: error.message,
            data: installmentData,
          });
          results.success = false;
        }
      }
    }

    // 3. Process any additional logs (if not auto-generated)
    if (parsedData.Logs && parsedData.Logs.length > 0) {
      for (const logData of parsedData.Logs) {
        try {
          const logResult = await logAction(
            logData.action,
            logData.stud_id,
            rawMessage || logData.raw_message,
            logData.parsed_json,
            logData.result,
            logData.error_msg,
            logData.performed_by
          );
          results.logs.push(logResult);
        } catch (error) {
          results.logs.push({
            success: false,
            error: error.message,
            data: logData,
          });
        }
      }
    }

    return results;
  } catch (error) {
    console.error("❌ Error processing complete AI data:", error);
    await logAction(
      "process_ai_data",
      "",
      rawMessage || "AI data processing",
      parsedData,
      "error",
      error.message,
      "system"
    );
    throw error;
  }
}
