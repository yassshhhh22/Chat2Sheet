import {
  findStudentByName,
  findStudentById,
  getStudentFeeStatus,
  getPaymentHistory,
  getStudentsByClass,
  getAllStudents,
} from "../services/sheetsService.js";
import { logAction } from "./sheetsController.js";

export async function processReadRequest(parsedRequest) {
  try {
    console.log("📖 Processing read request:", parsedRequest);

    const { query_type, parameters, output_format } = parsedRequest;

    switch (query_type) {
      case "fee_status":
        return await getFeeStatus(parameters, output_format);
      case "student_info":
        return await getStudentInfo(parameters, output_format);
      case "payment_history":
        return await getPaymentHistory(parameters, output_format);
      case "aggregate_summary":
        return await getAggregateSummary(parameters, output_format);
      default:
        throw new Error(`Unknown query type: ${query_type}`);
    }
  } catch (error) {
    console.error("❌ Read processing error:", error);
    return {
      success: false,
      data: null,
      query_type: parsedRequest.query_type,
      message: error.message,
    };
  }
}

async function getStudentDetails(params) {
  if (params.stud_id) {
    return await findStudentById(params.stud_id);
  } else if (params.name) {
    return await findStudentByName(params.name);
  } else {
    throw new Error("Student ID or name is required");
  }
}

async function getAggregateSummary(parameters, output_format) {
  try {
    const { date_range, class: classFilter, fee_filter } = parameters;

    // Build filter conditions
    const filters = [];

    if (date_range && date_range.start) {
      filters.push(`Date >= "${date_range.start}"`);
    }
    if (date_range && date_range.end) {
      filters.push(`Date <= "${date_range.end}"`);
    }
    if (classFilter) {
      filters.push(`Class = "${classFilter}"`);
    }
    if (fee_filter) {
      filters.push(`Fee_Type = "${fee_filter}"`);
    }

    const filterCondition =
      filters.length > 0 ? ` WHERE ${filters.join(" AND ")}` : "";

    // Get aggregate data from Google Sheets
    const query = `SELECT SUM(Amount) as total_amount, COUNT(*) as total_records${filterCondition}`;

    const result = await sheetService.executeQuery(query);

    if (!result || result.length === 0) {
      return {
        success: true,
        data: {
          total_amount: 0,
          total_records: 0,
          date_range: date_range,
          message: "No records found for the specified criteria",
        },
        query_type: "aggregate_summary",
      };
    }

    const aggregateData = result[0];

    return {
      success: true,
      data: {
        total_amount: aggregateData.total_amount || 0,
        total_records: aggregateData.total_records || 0,
        date_range: date_range,
        class_filter: classFilter,
        fee_filter: fee_filter,
        message: `Total installments received: ₹${
          aggregateData.total_amount || 0
        } (${aggregateData.total_records || 0} records)`,
      },
      query_type: "aggregate_summary",
    };
  } catch (error) {
    console.error("❌ Error getting aggregate summary:", error);
    throw error;
  }
}

async function getFeeStatus(parameters, output_format) {
  try {
    // Only require student identification for individual fee status
    if (!parameters.stud_id && !parameters.name) {
      throw new Error(
        "Student ID or name is required for individual fee status queries"
      );
    }

    const studentDetails = await getStudentDetails(parameters);
    if (!studentDetails) {
      throw new Error("Student not found");
    }

    return await getStudentFeeStatus(studentDetails.stud_id);
  } catch (error) {
    throw error;
  }
}

async function getPaymentHistoryData(params) {
  const student = await getStudentDetails(params);
  if (!student) {
    throw new Error("Student not found");
  }

  return await getPaymentHistory(student.stud_id, params.date_range);
}

async function searchStudents(params) {
  if (params.fee_filter) {
    // Handle fee-based filtering
    return await getStudentsByFeeFilter(params.fee_filter);
  } else if (params.class) {
    return await getStudentsByClass(params.class);
  } else if (params.name) {
    return await findStudentByName(params.name);
  } else {
    return await getAllStudents();
  }
}

// Add new function for fee filtering
async function getStudentsByFeeFilter(feeFilter) {
  const allStudents = await getAllStudents();

  // Get fee status for each student and filter
  const filteredStudents = [];

  for (const student of allStudents) {
    try {
      const feeStatus = await getStudentFeeStatus(student.stud_id);
      const amount = parseFloat(feeFilter.amount);

      switch (feeFilter.type) {
        case "paid_less_than":
          if (parseFloat(feeStatus.total_paid || 0) < amount) {
            filteredStudents.push({
              ...student,
              total_paid: feeStatus.total_paid,
              balance: feeStatus.balance,
            });
          }
          break;
        case "paid_more_than":
          if (parseFloat(feeStatus.total_paid || 0) > amount) {
            filteredStudents.push({
              ...student,
              total_paid: feeStatus.total_paid,
              balance: feeStatus.balance,
            });
          }
          break;
        case "balance_less_than":
          if (parseFloat(feeStatus.balance || 0) < amount) {
            filteredStudents.push({
              ...student,
              total_paid: feeStatus.total_paid,
              balance: feeStatus.balance,
            });
          }
          break;
        case "balance_more_than":
          if (parseFloat(feeStatus.balance || 0) > amount) {
            filteredStudents.push({
              ...student,
              total_paid: feeStatus.total_paid,
              balance: feeStatus.balance,
            });
          }
          break;
      }
    } catch (error) {
      console.error(`Error getting fee status for ${student.stud_id}:`, error);
    }
  }

  return filteredStudents;
}

async function getClassReport(params) {
  return await getStudentsByClass(params.class);
}
