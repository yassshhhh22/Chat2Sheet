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
    // Check if student already exists
    const existingStudent = await findStudentByName(data.name);
    if (existingStudent) {
      throw new Error(
        `Student ${data.name} already exists with ID: ${existingStudent.stud_id}`
      );
    }

    // Add student to students sheet
    const studId = await addStudentToSheet(data);

    // Add initial fees summary record
    await addFeesSummaryRecord(
      studId,
      data.name,
      data.class,
      data.total_fees || 0
    );

    // Log the action
    await logAction("add_student", studId, "", data, "success", "", "system");

    return {
      success: true,
      stud_id: studId,
      message: "Student added successfully",
    };
  } catch (error) {
    // Log the error
    await logAction(
      "add_student",
      "",
      "",
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

    // 1. Append installment to Installments sheet
    const installmentData = {
      ...data,
      stud_id: student.stud_id,
      name: student.name,
      class: student.class,
    };

    const instId = await addInstallmentToSheet(installmentData);

    // 2. Update fees summary (formulas will auto-calculate total_paid and balance)
    await updateFeesSummary(student.stud_id);

    // 3. Append to Logs sheet
    await logAction(
      "add_installment",
      student.stud_id,
      `Installment of ${data.installment_amount} added for ${student.name}`,
      data,
      "success",
      "",
      data.recorded_by || "system"
    );

    return {
      success: true,
      inst_id: instId,
      stud_id: student.stud_id,
      message: "Installment added successfully",
    };
  } catch (error) {
    // 3. Log the error
    await logAction(
      "add_installment",
      "",
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
    // Use manual calculation instead of relying on formulas
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
      message: "Fees summary updated successfully",
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
      stud_id: studId,
      raw_message: rawMessage,
      parsed_json: parsedJson,
      result,
      error_msg: errorMsg,
      performed_by: performedBy,
    };

    await addLogToSheet(logData);
    return { success: true };
  } catch (error) {
    console.error("Error logging action:", error);
    // Don't throw here to avoid infinite loop
    return { success: false, error: error.message };
  }
}
