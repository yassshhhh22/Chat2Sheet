import { google } from "googleapis";
import fs from "fs";
import path from "path";

const auth = new google.auth.GoogleAuth({
  keyFile:
    process.env.GOOGLE_CREDENTIALS_FILE ||
    "chat2sheet-469716-1bebf546c040.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Sheet names
const SHEETS = {
  STUDENTS: "Student_info",
  FEES_SUMMARY: "Totalfee_details",
  INSTALLMENTS: "Installment_details",
  LOGS: "Log_details",
};

// Helper function to get Google Sheets client
async function getGoogleSheetsClient() {
  return sheets;
}

// Consolidated ID Generator
async function generateId(sheetName, prefix) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:A`,
    });

    const rows = response.data.values || [];
    const lastId = rows.length > 1 ? rows[rows.length - 1][0] : `${prefix}000`;
    const nextNum = parseInt(lastId.replace(prefix, "")) + 1;
    return `${prefix}${nextNum.toString().padStart(3, "0")}`;
  } catch (error) {
    console.error(`Error generating ${prefix} ID:`, error);
    return `${prefix}001`;
  }
}

// ID Generators using consolidated function
async function generateStudentId() {
  return generateId(SHEETS.STUDENTS, "STU");
}

async function generateInstallmentId() {
  return generateId(SHEETS.INSTALLMENTS, "INST");
}

async function generateLogId() {
  return generateId(SHEETS.LOGS, "LOG");
}

// Students sheet operations
export async function addStudentToSheet(studentData) {
  try {
    const studId = await generateStudentId();
    const values = [
      [
        studId,
        studentData.name,
        studentData.class,
        studentData.parent_name || "",
        studentData.parent_no || "",
        studentData.phone_no || "",
        studentData.email || "",
        new Date().toISOString(),
      ],
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.STUDENTS}!A:H`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    return studId;
  } catch (error) {
    console.error("Error adding student to sheet:", error);
    throw error;
  }
}

// SINGLE DECLARATION - Find student by name
export async function findStudentByName(name) {
  try {
    if (!name || typeof name !== "string") {
      console.log(`Invalid name parameter: ${name}`);
      return null;
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.STUDENTS}!A:H`,
    });

    const rows = response.data.values || [];

    const studentRow = rows.slice(1).find((row) => {
      if (!row || row.length < 2 || !row[1]) {
        return false;
      }
      return row[1].toString().toLowerCase().includes(name.toLowerCase());
    });

    if (studentRow) {
      return {
        stud_id: studentRow[0] || "",
        name: studentRow[1] || "",
        class: studentRow[2] || "",
        parent_name: studentRow[3] || "",
        parent_no: studentRow[4] || "",
        phone_no: studentRow[5] || "",
        email: studentRow[6] || "",
        created_at: studentRow[7] || "",
      };
    }

    return null;
  } catch (error) {
    console.error("Error finding student:", error);
    throw error;
  }
}

// SINGLE DECLARATION - Find student by ID
export async function findStudentById(studId) {
  try {
    if (!studId || typeof studId !== "string") {
      console.log(`Invalid studId parameter: ${studId}`);
      return null;
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.STUDENTS}!A:H`,
    });

    const rows = response.data.values || [];

    const studentRow = rows.slice(1).find((row) => {
      if (!row || row.length < 1 || !row[0]) {
        return false;
      }
      return row[0].toString() === studId.toString();
    });

    if (studentRow) {
      return {
        stud_id: studentRow[0] || "",
        name: studentRow[1] || "",
        class: studentRow[2] || "",
        parent_name: studentRow[3] || "",
        parent_no: studentRow[4] || "",
        phone_no: studentRow[5] || "",
        email: studentRow[6] || "",
        created_at: studentRow[7] || "",
      };
    }

    return null;
  } catch (error) {
    console.error("Error finding student by ID:", error);
    throw error;
  }
}

// Fees summary sheet operations
export async function addFeesSummaryRecord(studId, name, className, totalFees) {
  try {
    const rowIndex = await getNextRowIndex(SHEETS.FEES_SUMMARY);

    const values = [
      [
        studId,
        name,
        className,
        totalFees,
        `=SUMIF(Installment_details!B:B,"${studId}",Installment_details!E:E)`,
        `=D${rowIndex}-E${rowIndex}`,
        `=IF(F${rowIndex}<=0,"Paid",IF(E${rowIndex}>0,"Partial","Pending"))`,
      ],
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.FEES_SUMMARY}!A:G`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    return true;
  } catch (error) {
    console.error("Error adding fees summary record:", error);
    throw error;
  }
}

// Installments sheet operations
export async function addInstallmentToSheet(installmentData) {
  try {
    const instId = await generateInstallmentId();
    const values = [
      [
        instId,
        installmentData.stud_id,
        installmentData.name,
        installmentData.class,
        installmentData.installment_amount,
        installmentData.date || new Date().toISOString().split("T")[0],
        installmentData.mode || "cash",
        installmentData.remarks || "",
        installmentData.recorded_by || "system",
                new Date().toISOString(),
      ],
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.INSTALLMENTS}!A:J`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    return instId;
  } catch (error) {
    console.error("Error adding installment to sheet:", error);
    throw error;
  }
}

// Logs sheet operations
export async function addLogToSheet(logData) {
  try {
    const logId = await generateLogId();
    const values = [
      [
        logId,
        logData.action,
        logData.stud_id || "",
        logData.raw_message || "",
        JSON.stringify(logData.parsed_json) || "",
        logData.result || "",
        logData.error_msg || "",
        logData.performed_by || "system",
        new Date().toISOString(),
      ],
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.LOGS}!A:I`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    return logId;
  } catch (error) {
    console.error("Error adding log to sheet:", error);
    throw error;
  }
}

// Helper function to get next row index
async function getNextRowIndex(sheetName) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:A`,
    });

    const rows = response.data.values || [];
    return rows.length + 1;
  } catch (error) {
    console.error("Error getting next row index:", error);
    return 2;
  }
}

// Function to manually update fees summary totals
export async function updateFeesSummaryTotals(studId) {
  try {
    const installmentsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.INSTALLMENTS}!A:J`,
    });

    const installmentRows = installmentsResponse.data.values || [];
    const studentInstallments = installmentRows.filter(
      (row) => row[1] === studId
    );

    const totalPaid = studentInstallments.reduce((sum, row) => {
      return sum + (parseFloat(row[4]) || 0);
    }, 0);

    const feesResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.FEES_SUMMARY}!A:G`,
    });

    const feesRows = feesResponse.data.values || [];
    const studentFeeRowIndex = feesRows.findIndex((row) => row[0] === studId);

    if (studentFeeRowIndex !== -1) {
      const rowNum = studentFeeRowIndex + 1;
      const totalFees = parseFloat(feesRows[studentFeeRowIndex][3]) || 0;
      const balance = totalFees - totalPaid;
      const status =
        balance <= 0 ? "Paid" : totalPaid > 0 ? "Partial" : "Pending";

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEETS.FEES_SUMMARY}!E${rowNum}:G${rowNum}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[totalPaid, balance, status]],
        },
      });
    }

    return true;
  } catch (error) {
    console.error("Error updating fees summary totals:", error);
    throw error;
  }
}

// READ OPERATIONS - Get data from Google Sheets

// Get all students from Students sheet
export async function getAllStudents() {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.STUDENTS}!A:H`,
    });

    const rows = response.data.values;
    if (!rows || rows.length <= 1) return [];

    const students = rows.slice(1).map((row) => ({
      stud_id: row[0] || "",
      name: row[1] || "",
      class: row[2] || "",
      parent_name: row[3] || "",
      parent_no: row[4] || "",
      phone_no: row[5] || "",
      email: row[6] || "",
      created_at: row[7] || "",
    }));

    return students;
  } catch (error) {
    console.error("❌ Error getting all students:", error);
    throw error;
  }
}

// Get students by class from Students sheet
export async function getStudentsByClass(className) {
  try {
    const students = await getAllStudents();
    return students.filter((student) => student.class === className);
  } catch (error) {
    console.error("❌ Error getting students by class:", error);
    throw error;
  }
}

// Get all fee records from Fees sheet
export async function getAllFees() {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.FEES_SUMMARY}!A:G`,
    });

    const rows = response.data.values;
    if (!rows || rows.length <= 1) return [];

    const fees = rows.slice(1).map((row) => ({
      stud_id: row[0] || "",
      name: row[1] || "",
      class: row[2] || "",
      total_fees: row[3] || "0",
      total_paid: row[4] || "0",
      balance: row[5] || "0",
      status: row[6] || "unpaid",
    }));

    return fees;
  } catch (error) {
    console.error("❌ Error getting all fees:", error);
    throw error;
  }
}

// Get fee status for a specific student
export async function getStudentFeeStatus(studId) {
  try {
    const fees = await getAllFees();
    return fees.find((fee) => fee.stud_id === studId) || null;
  } catch (error) {
    console.error("❌ Error getting student fee status:", error);
    throw error;
  }
}

// Get all installments from Installments sheet
export async function getAllInstallments() {
  try {
    console.log("🔍 DEBUG: Fetching installments from sheet:", SHEETS.INSTALLMENTS);
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.INSTALLMENTS}!A:J`,
    });

    const rows = response.data.values;
    console.log("🔍 DEBUG: Total rows in installments sheet:", rows?.length || 0);
    
    if (!rows || rows.length <= 1) {
      console.log("🔍 DEBUG: No installment data found");
      return [];
    }

    // Debug: Show header row
    console.log("🔍 DEBUG: Header row:", rows[0]);

    const installments = rows.slice(1).map((row, index) => {
      const installment = {
        inst_id: row[0] || "",
        stud_id: row[1] || "",
        name: row[2] || "",
        class: row[3] || "",
        installment_amount: row[4] || "0", // Column E (index 4)
        date: row[5] || "",
        mode: row[6] || "",
        remarks: row[7] || "",
        recorded_by: row[8] || "",
        created_at: row[9] || "",
      };
      
      // Debug first few rows
      if (index < 3) {
        console.log(`🔍 DEBUG: Row ${index + 2} data:`, row);
        console.log(`🔍 DEBUG: Mapped installment:`, installment);
      }
      
      return installment;
    });

    console.log("🔍 DEBUG: Total installments processed:", installments.length);
    console.log("🔍 DEBUG: Sample processed installment:", installments[0]);
    
    return installments;
  } catch (error) {
    console.error("❌ Error getting all installments:", error);
    throw error;
  }
}

// Get payment history (installments) for a specific student
export async function getPaymentHistory(studId, dateRange = null) {
  try {
    console.log("🔍 DEBUG: Getting payment history for studId:", studId);
    
    const installments = await getAllInstallments();
    console.log("🔍 DEBUG: All installments count:", installments.length);
    
    // Show first few installments to verify data structure
    console.log("🔍 DEBUG: First 3 installments:", installments.slice(0, 3));
    
    let studentInstallments = installments.filter(
      (inst) => inst.stud_id === studId
    );
    
    console.log("🔍 DEBUG: Student installments found:", studentInstallments.length);
    console.log("🔍 DEBUG: Student installments data:", studentInstallments);

    // Check if amounts are actually there
    studentInstallments.forEach((inst, index) => {
      console.log(`🔍 DEBUG: Payment ${index + 1}:`, {
        inst_id: inst.inst_id,
        stud_id: inst.stud_id,
        amount: inst.installment_amount,
        date: inst.date,
        mode: inst.mode
      });
    });

    if (dateRange && dateRange.start && dateRange.end) {
      studentInstallments = studentInstallments.filter((inst) => {
        const instDate = new Date(inst.date);
        const startDate = new Date(dateRange.start);
        const endDate = new Date(dateRange.end);
        return instDate >= startDate && instDate <= endDate;
      });
    }

    return studentInstallments;
  } catch (error) {
    console.error("❌ Error getting payment history:", error);
    throw error;
  }
}

// Get students with fee criteria (for aggregate queries)
export async function getStudentsWithFeeCriteria(criteria, amount) {
  try {
    const fees = await getAllFees();
    const students = await getAllStudents();

    let filteredFees = [];

    switch (criteria) {
      case "paid_less_than":
        filteredFees = fees.filter(
          (fee) => parseFloat(fee.total_paid) < parseFloat(amount)
        );
        break;
      case "balance_more_than":
        filteredFees = fees.filter(
          (fee) => parseFloat(fee.balance) > parseFloat(amount)
        );
        break;
      case "outstanding_fees":
        filteredFees = fees.filter((fee) => parseFloat(fee.balance) > 0);
        break;
      default:
        filteredFees = fees;
    }

    const result = filteredFees.map((fee) => {
      const student = students.find((s) => s.stud_id === fee.stud_id);
      return {
        ...fee,
        parent_name: student?.parent_name || "",
        phone_no: student?.phone_no || "",
        email: student?.email || "",
      };
    });

    return result;
  } catch (error) {
    console.error("❌ Error getting students with fee criteria:", error);
    throw error;
  }
}

// Helper function to get complete student details (combines student + fee data)
export async function getStudentDetails(parameters) {
  try {
    let student = null;

    if (parameters.stud_id) {
      student = await findStudentById(parameters.stud_id);
    } else if (parameters.name) {
      student = await findStudentByName(parameters.name);
    }

    if (!student) return null;

    const feeInfo = await getStudentFeeStatus(student.stud_id);

    return {
      ...student,
      total_fees: feeInfo?.total_fees || "0",
      total_paid: feeInfo?.total_paid || "0",
      balance: feeInfo?.balance || "0",
      status: feeInfo?.status || "unpaid",
    };
  } catch (error) {
    console.error("❌ Error getting student details:", error);
    throw error;
  }
}
