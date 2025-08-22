import { google } from "googleapis";

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

export async function findStudentByName(name) {
  try {
    // Add validation for name parameter
    if (!name || typeof name !== "string") {
      console.log(`Invalid name parameter: ${name}`);
      return null;
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.STUDENTS}!A:H`,
    });

    const rows = response.data.values || [];

    // Skip header row and find student
    const studentRow = rows.slice(1).find((row) => {
      // Check if row exists and has at least 2 columns (stud_id and name)
      if (!row || row.length < 2 || !row[1]) {
        return false;
      }

      // Safe comparison with toLowerCase
      return row[1].toString().toLowerCase() === name.toLowerCase();
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

// Add this new function to find student by ID
export async function findStudentById(studId) {
  try {
    // Add validation for studId parameter
    if (!studId || typeof studId !== "string") {
      console.log(`Invalid studId parameter: ${studId}`);
      return null;
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.STUDENTS}!A:H`,
    });

    const rows = response.data.values || [];

    // Skip header row and find student by ID
    const studentRow = rows.slice(1).find((row) => {
      // Check if row exists and has at least 1 column (stud_id)
      if (!row || row.length < 1 || !row[0]) {
        return false;
      }

      // Safe comparison with toString
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
        `=SUMIF(Installment_details!B:B,"${studId}",Installment_details!E:E)`, // total_paid formula
        `=D${rowIndex}-E${rowIndex}`, // balance formula
        `=IF(F${rowIndex}<=0,"Paid",IF(E${rowIndex}>0,"Partial","Pending"))`, // status formula
        // Removed: due_date and last_payment_date columns
      ],
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.FEES_SUMMARY}!A:G`, // Changed from A:I to A:G (removed 2 columns)
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
    return 2; // Default to row 2 if error
  }
}

// Function to manually update fees summary totals
export async function updateFeesSummaryTotals(studId) {
  try {
    // Get all installments for this student
    const installmentsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.INSTALLMENTS}!A:J`,
    });

    const installmentRows = installmentsResponse.data.values || [];
    const studentInstallments = installmentRows.filter(
      (row) => row[1] === studId
    );

    // Calculate total paid
    const totalPaid = studentInstallments.reduce((sum, row) => {
      return sum + (parseFloat(row[4]) || 0); // column E is installment_amount
    }, 0);

    // Find the fees summary row for this student
    const feesResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.FEES_SUMMARY}!A:G`, // Changed from A:I to A:G
    });

    const feesRows = feesResponse.data.values || [];
    const studentFeeRowIndex = feesRows.findIndex((row) => row[0] === studId);

    if (studentFeeRowIndex !== -1) {
      const rowNum = studentFeeRowIndex + 1;
      const totalFees = parseFloat(feesRows[studentFeeRowIndex][3]) || 0;
      const balance = totalFees - totalPaid;
      const status =
        balance <= 0 ? "Paid" : totalPaid > 0 ? "Partial" : "Pending";

      // Update the row (only columns E, F, G - removed H and I)
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

// Read operations
export async function getStudentFeeStatus(studId) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.FEES_SUMMARY}!A:G`,
    });

    const rows = response.data.values || [];
    const studentFeeRow = rows.slice(1).find((row) => row[0] === studId);

    if (studentFeeRow) {
      return {
        stud_id: studentFeeRow[0],
        name: studentFeeRow[1],
        class: studentFeeRow[2],
        total_fees: studentFeeRow[3],
        total_paid: studentFeeRow[4],
        balance: studentFeeRow[5],
        status: studentFeeRow[6],
      };
    }

    return null;
  } catch (error) {
    console.error("Error getting fee status:", error);
    throw error;
  }
}

export async function getPaymentHistory(studId, dateRange = {}) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.INSTALLMENTS}!A:J`,
    });

    const rows = response.data.values || [];
    const installments = rows
      .slice(1)
      .filter((row) => row[1] === studId)
      .map((row) => ({
        inst_id: row[0],
        stud_id: row[1],
        name: row[2],
        class: row[3],
        amount: row[4],
        date: row[5],
        mode: row[6],
        remarks: row[7],
        recorded_by: row[8],
        created_at: row[9],
      }));

    return installments;
  } catch (error) {
    console.error("Error getting payment history:", error);
    throw error;
  }
}

export async function getStudentsByClass(className) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.STUDENTS}!A:H`,
    });

    const rows = response.data.values || [];
    const students = rows
      .slice(1)
      .filter((row) => row[2] === className)
      .map((row) => ({
        stud_id: row[0],
        name: row[1],
        class: row[2],
        parent_name: row[3],
        parent_no: row[4],
        phone_no: row[5],
        email: row[6],
        created_at: row[7],
      }));

    return students;
  } catch (error) {
    console.error("Error getting students by class:", error);
    throw error;
  }
}

export async function getAllStudents() {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.STUDENTS}!A:H`,
    });

    const rows = response.data.values || [];
    const students = rows.slice(1).map((row) => ({
      stud_id: row[0],
      name: row[1],
      class: row[2],
      parent_name: row[3],
      parent_no: row[4],
      phone_no: row[5],
      email: row[6],
      created_at: row[7],
    }));

    return students;
  } catch (error) {
    console.error("Error getting all students:", error);
    throw error;
  }
}
