import {
  addStudentToSheet,
  findStudentByName,
  findStudentById,
  addFeesSummaryRecord,
  addInstallmentToSheet,
  addLogToSheet,
  updateFeesSummaryTotals,
  getStudentFeeStatus, // Add this import
} from "../services/sheetsService.js";
import {
  requestWriteConfirmation,
  handleConfirmationResponse,
  hasPendingConfirmation,
} from "../services/aiService.js";
import {
  generateInvoicePDF,
  cleanupInvoiceFile,
} from "../services/invoiceService.js";
import { sendInvoiceDocument } from "../services/whatsappService.js"; // ✅ Correct function name

export async function addStudent(data) {
  try {
    console.log("📝 Adding student with data:", data);

    // Add student to Students sheet - this already generates and returns the proper ID
    const studentId = await addStudentToSheet(data);

    const studentData = {
      ...data,
      stud_id: studentId,
      created_at: new Date().toISOString(),
    };

    // Add corresponding fee record if total_fees is provided
    if (data.total_fees) {
      const feeData = {
        stud_id: studentId,
        name: data.name,
        class: data.class,
        total_fees: data.total_fees,
        total_paid: "0",
        balance: data.total_fees,
        status: "unpaid",
      };

      console.log("💰 Adding fee record:", feeData);
      // ISSUE: Wrong function call - should pass individual parameters
      await addFeesSummaryRecord(
        studentId,
        data.name,
        data.class,
        data.total_fees
      );
    }

    // ISSUE: Missing log action call
    await logAction(
      "add_student",
      studentId,
      `Student ${data.name} added successfully`,
      data,
      "success",
      "",
      data.recorded_by || "system"
    );

    console.log("✅ Student added successfully");

    return {
      success: true,
      stud_id: studentId,
      data: studentData,
      message: `Student ${data.name} added successfully with ID ${studentId}`,
    };
  } catch (error) {
    console.error("❌ Error adding student:", error);

    // Log the error
    await logAction(
      "add_student",
      "",
      `Failed to add student ${data.name}`,
      data,
      "error",
      error.message,
      data.recorded_by || "system"
    );

    return {
      success: false,
      error: error.message,
      data: data,
    };
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

    // Prepare installment data with auto-generated fields
    const installmentData = {
      stud_id: student.stud_id,
      name: student.name,
      class: student.class,
      installment_amount: data.installment_amount || data.amount || "0",
      date: data.date || new Date().toISOString().split("T")[0], // Auto-generate current date
      mode: data.mode || "cash", // Default payment mode
      remarks: data.remarks || "",
      recorded_by: data.recorded_by || "system", // Auto-set recorded_by
      created_at: new Date().toISOString(), // Auto-generate timestamp
    };

    console.log("📝 Prepared installment data:", installmentData);

    // Add installment to Installments sheet
    const instId = await addInstallmentToSheet(installmentData);
    console.log("✅ Installment added to sheet with ID:", instId);

    // Update fees summary (recalculate totals)
    await updateFeesSummaryTotals(student.stud_id);
    console.log("✅ Fees summary updated for student:", student.stud_id);

    // Get updated fee status for invoice
    const feeStatus = await getStudentFeeStatus(student.stud_id);

    // Generate and send invoice with complete data
    try {
      // Format parent phone number before passing to invoice function
      const formattedParentPhone = formatPhoneNumber(student.parent_no);

      await generateAndSendInvoice({
        installmentId: instId,
        studentName: student.name,
        studentId: student.stud_id,
        class: student.class,
        installmentAmount: installmentData.installment_amount,
        paymentDate: installmentData.date,
        paymentMode: installmentData.mode,
        totalFee: feeStatus?.total_fees || "0",
        totalPaid: feeStatus?.total_paid || "0",
        balance: feeStatus?.balance || "0",
        parentPhone: formattedParentPhone, // Use formatted phone number
        recordedBy: installmentData.recorded_by, // Pass recorded_by
        createdAt: installmentData.created_at, // Pass created_at
      });
    } catch (invoiceError) {
      console.error("❌ Error generating/sending invoice:", invoiceError);
      // Don't fail the whole operation if invoice fails
    }

    // Log the action
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
        date: installmentData.date,
        mode: installmentData.mode,
        recorded_by: installmentData.recorded_by, // Include in response
      },
    };
  } catch (error) {
    console.error("❌ Error in addInstallment:", error);

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

    return {
      success: false,
      error: error.message,
      data: data,
    };
  }
}

// Fix the generateAndSendInvoice function to include recordedBy data
async function generateAndSendInvoice(invoiceData) {
  let pdfPath = null;
  try {
    console.log("📄 Starting invoice generation process...");

    // Generate PDF invoice with complete data
    const completeInvoiceData = {
      ...invoiceData,
      recordedBy: invoiceData.recordedBy, // Make sure this is passed
      createdAt: invoiceData.createdAt, // Make sure this is passed
    };

    pdfPath = await generateInvoicePDF(completeInvoiceData);

    // Prepare message for parent
    const caption = `Dear Parent,

We have received ₹${invoiceData.installmentAmount} on ${invoiceData.paymentDate} for ${invoiceData.studentName} (${invoiceData.class}).

Payment Details:
• Amount: ₹${invoiceData.installmentAmount}
• Mode: ${invoiceData.paymentMode}
• Remaining Balance: ₹${invoiceData.balance}

Please find the detailed invoice attached.

Thank you!
- School Administration`;

    // Format parent phone number with country code
    const formattedParentPhone = formatPhoneNumber(invoiceData.parentPhone);

    // Send invoice to parent (if parent phone exists)
    if (formattedParentPhone) {
      console.log("📱 Sending invoice to parent:", formattedParentPhone);
      await sendInvoiceDocument(formattedParentPhone, pdfPath, caption);
      console.log("✅ Invoice sent to parent successfully");
    } else {
      console.log(
        "⚠️ No valid parent phone number found, skipping invoice send"
      );
    }
  } catch (error) {
    console.error("❌ Error in invoice generation/sending:", error);
    throw error;
  } finally {
    // Always cleanup the PDF file, regardless of success or failure
    if (pdfPath) {
      try {
        await cleanupInvoiceFile(pdfPath);
        console.log("🗑️ Invoice file cleaned up successfully");
      } catch (cleanupError) {
        console.error("❌ Error cleaning up invoice file:", cleanupError);
      }
    }
  }
}

// Add phone number formatting utility function
function formatPhoneNumber(phoneNumber) {
  if (!phoneNumber || phoneNumber.trim() === "") {
    return null;
  }

  // Clean the phone number (remove spaces, hyphens, etc.)
  let cleanedNumber = phoneNumber.toString().replace(/[\s\-\(\)]/g, "");

  // Remove any leading + or 0
  cleanedNumber = cleanedNumber.replace(/^[\+0]+/, "");

  // If number already starts with 91, return as is
  if (cleanedNumber.startsWith("91")) {
    return cleanedNumber;
  }

  // If it's a 10-digit Indian number, add 91
  if (cleanedNumber.length === 10 && /^[6-9]\d{9}$/.test(cleanedNumber)) {
    return "91" + cleanedNumber;
  }

  // If it's an 11-digit number starting with 1-9, assume it needs 91
  if (cleanedNumber.length === 10) {
    return "91" + cleanedNumber;
  }

  console.warn("⚠️ Invalid phone number format:", phoneNumber);
  return null;
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

// Modify existing write operations to require confirmation
export const createData = async (req, res) => {
  try {
    const { phoneNumber, data, sheetName } = req.body;

    // Check if this is a confirmation response
    if (hasPendingConfirmation(phoneNumber)) {
      const confirmationResult = await handleConfirmationResponse(
        phoneNumber,
        data
      );

      if (confirmationResult.error) {
        return res.status(400).json({
          success: false,
          message: confirmationResult.message,
        });
      }

      if (!confirmationResult.confirmed) {
        return res.status(200).json({
          success: true,
          message: confirmationResult.message,
        });
      }

      // Proceed with actual data creation
      const result = await sheetsService.createData(
        confirmationResult.data,
        sheetName
      );
      return res.status(200).json({
        success: true,
        message:
          confirmationResult.message +
          "\n\n" +
          "Data has been successfully added to the sheet.",
        data: result,
      });
    }

    // Request confirmation for new write operation
    const confirmationRequest = await requestWriteConfirmation(
      phoneNumber,
      data,
      "CREATE"
    );

    return res.status(200).json({
      success: true,
      requiresConfirmation: true,
      message: confirmationRequest.confirmationMessage,
    });
  } catch (error) {
    logger.error("Error in createData:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process create request",
    });
  }
};

export const updateData = async (req, res) => {
  try {
    const { phoneNumber, data, sheetName, conditions } = req.body;

    // Check if this is a confirmation response
    if (hasPendingConfirmation(phoneNumber)) {
      const confirmationResult = await handleConfirmationResponse(
        phoneNumber,
        data
      );

      if (confirmationResult.error) {
        return res.status(400).json({
          success: false,
          message: confirmationResult.message,
        });
      }

      if (!confirmationResult.confirmed) {
        return res.status(200).json({
          success: true,
          message: confirmationResult.message,
        });
      }

      // Proceed with actual data update
      const result = await sheetsService.updateData(
        confirmationResult.data,
        sheetName,
        conditions
      );
      return res.status(200).json({
        success: true,
        message:
          confirmationResult.message +
          "\n\n" +
          "Data has been successfully updated in the sheet.",
        data: result,
      });
    }

    // Request confirmation for new write operation
    const confirmationRequest = await requestWriteConfirmation(
      phoneNumber,
      data,
      "UPDATE"
    );

    return res.status(200).json({
      success: true,
      requiresConfirmation: true,
      message: confirmationRequest.confirmationMessage,
    });
  } catch (error) {
    logger.error("Error in updateData:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process update request",
    });
  }
};

// Add this function after your existing installment processing
async function processInvoiceGeneration(installmentData, studentData) {
  let pdfPath = null;
  try {
    console.log("🧾 Processing invoice generation for:", studentData.name);

    // Prepare invoice data
    const invoiceData = {
      installmentId: installmentData.inst_id,
      paymentDate: installmentData.date,
      studentId: studentData.stud_id,
      studentName: studentData.name,
      class: studentData.class,
      installmentAmount: installmentData.installment_amount,
      paymentMode: installmentData.mode || "Cash",
      totalFee: studentData.total_fees || 0,
      totalPaid: studentData.total_paid || 0,
      balance: studentData.balance || 0,
      recordedBy: installmentData.recorded_by, // Add this field
      createdAt: installmentData.created_at, // Add this field
    };

    // Generate PDF
    pdfPath = await generateInvoicePDF(invoiceData);

    // Format and send to parent via WhatsApp
    const formattedParentPhone = formatPhoneNumber(
      studentData.phone_no || studentData.parent_no
    );
    if (formattedParentPhone) {
      await sendInvoiceDocument(
        formattedParentPhone,
        pdfPath,
        studentData.name
      );
      console.log("✅ Invoice sent to parent:", formattedParentPhone);
    } else {
      console.log(
        "⚠️ No valid parent phone number found for:",
        studentData.name
      );
    }

    return { success: true, pdfPath };
  } catch (error) {
    console.error("❌ Error processing invoice:", error);
    return { success: false, error: error.message };
  } finally {
    // Always cleanup the PDF file
    if (pdfPath) {
      try {
        await cleanupInvoiceFile(pdfPath);
        console.log("🗑️ Invoice file cleaned up after generation");
      } catch (cleanupError) {
        console.error("❌ Error cleaning up invoice file:", cleanupError);
      }
    }
  }
}

// Modify your existing installment processing function to include invoice generation
// Add this call after successfully adding an installment:
// await processInvoiceGeneration(installmentData, studentData);
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
