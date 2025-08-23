import {
  getAllStudents,
  findStudentById,
  findStudentByName,
  getStudentsByClass,
  getStudentFeeStatus,
  getPaymentHistory,
  getStudentsWithFeeCriteria,
  getStudentDetails,
  getAllFees,
  getAllInstallments,
} from "../services/sheetsService.js";

export async function processReadRequest(parsedRequest) {
  try {
    console.log("📖 Processing read request:", parsedRequest);

    const { query_type, parameters, output_format } = parsedRequest;

    switch (query_type) {
      case "fee_status":
        return await getFeeStatus(parameters, output_format);

      case "student_info":
      case "student_details":
        return await getStudentInfo(parameters, output_format);

      case "payment_history":
        return await getPaymentHistoryData(parameters, output_format);

      case "student_search":
        return await getStudentSearch(parameters, output_format);

      case "class_report":
        return await getClassReport(parameters, output_format);

      case "aggregate_summary":
        return await getAggregateSummary(parameters, output_format);

      default:
        console.log(
          `⚠️ Unknown query type: ${query_type}, falling back to student search`
        );
        return await getStudentSearch(parameters, output_format);
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

// Get real student information from Google Sheets
async function getStudentInfo(parameters, output_format) {
  try {
    const student = await getStudentDetails(parameters);
    if (!student) {
      return {
        success: false,
        data: null,
        query_type: "student_details",
        message: "Student not found",
      };
    }

    return {
      success: true,
      data: student,
      query_type: "student_details",
      message: "Student details retrieved successfully",
    };
  } catch (error) {
    throw error;
  }
}

// Get real fee status from Google Sheets
async function getFeeStatus(parameters, output_format) {
  try {
    if (!parameters.stud_id && !parameters.name) {
      throw new Error(
        "Student ID or name is required for individual fee status queries"
      );
    }

    const studentDetails = await getStudentDetails(parameters);
    if (!studentDetails) {
      return {
        success: false,
        data: null,
        query_type: "fee_status",
        message: "Student not found",
      };
    }

    return {
      success: true,
      data: {
        stud_id: studentDetails.stud_id,
        name: studentDetails.name,
        class: studentDetails.class,
        total_fees: studentDetails.total_fees,
        total_paid: studentDetails.total_paid,
        balance: studentDetails.balance,
        status: studentDetails.status,
      },
      query_type: "fee_status",
      message: "Fee status retrieved successfully",
    };
  } catch (error) {
    throw error;
  }
}

// Update the getAggregateSummary function

async function getAggregateSummary(parameters, output_format) {
  try {
    console.log("📊 Processing aggregate summary with parameters:", parameters);

    let summary = {};

    // Handle class-specific queries FIRST (check both class parameter and criteria)
    if (
      (parameters.class && parameters.class !== "") ||
      (parameters.criteria && parameters.criteria.includes("class"))
    ) {
      const className =
        parameters.class ||
        (parameters.criteria.match(/class\s+(\d+)/) &&
          parameters.criteria.match(/class\s+(\d+)/)[1]);

      console.log("📚 Processing class-specific query for class:", className);

      if (className) {
        const classStudents = await getStudentsByClass(className);
        console.log("📚 Found students in class:", classStudents.length);

        const allFees = await getAllFees();

        // Get fee information for class students
        const classStudentsWithFees = classStudents.map((student) => {
          const feeInfo = allFees.find(
            (fee) => fee.stud_id === student.stud_id
          );
          return {
            ...student,
            total_fees: feeInfo?.total_fees || "0",
            total_paid: feeInfo?.total_paid || "0",
            balance: feeInfo?.balance || "0",
            status: feeInfo?.status || "unpaid",
          };
        });

        const totalFeesCollected = classStudentsWithFees.reduce(
          (sum, student) => sum + parseFloat(student.total_paid || 0),
          0
        );

        const totalOutstanding = classStudentsWithFees.reduce(
          (sum, student) => sum + parseFloat(student.balance || 0),
          0
        );

        summary = {
          query: `All students in class ${className}`,
          total_count: classStudentsWithFees.length,
          students: classStudentsWithFees.map((student) => ({
            stud_id: student.stud_id,
            name: student.name,
            class: student.class,
            parent_name: student.parent_name,
            phone_no: student.phone_no,
            paid: student.total_paid,
            balance: student.balance,
            status: student.status,
          })),
          total_fees_collected: totalFeesCollected.toString(),
          total_outstanding: totalOutstanding.toString(),
        };
      }
    }
    // Handle fee criteria queries
    else if (
      parameters.criteria &&
      parameters.criteria.includes("paid_less_than")
    ) {
      const amount = parameters.amount || "10000";
      const students = await getStudentsWithFeeCriteria(
        "paid_less_than",
        amount
      );

      const totalOutstanding = students.reduce(
        (sum, student) => sum + parseFloat(student.balance || 0),
        0
      );

      summary = {
        query: `Students with paid fees less than ₹${amount}`,
        total_count: students.length,
        students: students.map((student) => ({
          stud_id: student.stud_id,
          name: student.name,
          class: student.class,
          paid: student.total_paid,
          balance: student.balance,
        })),
        total_outstanding: totalOutstanding.toString(),
      };
    } else if (
      parameters.criteria &&
      parameters.criteria.includes("balance_more_than")
    ) {
      const amount = parameters.amount || "15000";
      const students = await getStudentsWithFeeCriteria(
        "balance_more_than",
        amount
      );

      const totalOutstanding = students.reduce(
        (sum, student) => sum + parseFloat(student.balance || 0),
        0
      );

      summary = {
        query: `Students with balance more than ₹${amount}`,
        total_count: students.length,
        students: students.map((student) => ({
          stud_id: student.stud_id,
          name: student.name,
          class: student.class,
          paid: student.total_paid,
          balance: student.balance,
        })),
        total_outstanding: totalOutstanding.toString(),
      };
    } else if (
      parameters.criteria &&
      parameters.criteria.includes("outstanding")
    ) {
      const students = await getStudentsWithFeeCriteria("outstanding_fees");

      const totalOutstanding = students.reduce(
        (sum, student) => sum + parseFloat(student.balance || 0),
        0
      );

      summary = {
        query: "All students with outstanding fees",
        total_count: students.length,
        students: students.map((student) => ({
          stud_id: student.stud_id,
          name: student.name,
          class: student.class,
          balance: student.balance,
        })),
        total_outstanding: totalOutstanding.toString(),
      };
    } else {
      // Default aggregate summary (only when no specific criteria)
      const allStudents = await getAllStudents();
      const allFees = await getAllFees();

      const totalFeesCollected = allFees.reduce(
        (sum, fee) => sum + parseFloat(fee.total_paid || 0),
        0
      );

      const totalOutstanding = allFees.reduce(
        (sum, fee) => sum + parseFloat(fee.balance || 0),
        0
      );

      const uniqueClasses = [...new Set(allStudents.map((s) => s.class))];

      summary = {
        query: "General summary",
        total_students: allStudents.length,
        classes: uniqueClasses,
        total_fees_collected: totalFeesCollected.toString(),
        total_outstanding: totalOutstanding.toString(),
      };
    }

    console.log("📊 Aggregate summary result:", summary);
    console.log("📊 Total students in result:", summary.students?.length || 0);

    return {
      success: true,
      data: summary,
      query_type: "aggregate_summary",
      message: "Aggregate summary retrieved successfully",
    };
  } catch (error) {
    throw error;
  }
}

// Get real student search results from Google Sheets
async function getStudentSearch(parameters, output_format) {
  try {
    let students = [];

    if (parameters.stud_id) {
      const student = await findStudentById(parameters.stud_id);
      students = student ? [student] : [];
    } else if (parameters.name) {
      const student = await findStudentByName(parameters.name);
      students = student ? [student] : [];
    } else if (parameters.class) {
      students = await getStudentsByClass(parameters.class);
    } else {
      students = await getAllStudents();
    }

    return {
      success: true,
      data: students,
      query_type: "student_search",
      message: `Found ${students.length} student(s)`,
    };
  } catch (error) {
    throw error;
  }
}

// Get real payment history from Google Sheets
async function getPaymentHistoryData(parameters, output_format) {
  try {
    console.log("📈 Processing payment history with parameters:", parameters);

    let result = [];

    // Handle date-based payment queries (all payments on a specific date)
    if (parameters.date_filter || parameters.date_range) {
      console.log("📅 Processing date-based payment query");

      const allInstallments = await getAllInstallments();

      let filteredInstallments = [];

      if (parameters.date_filter) {
        // Single date filter
        const targetDate = parameters.date_filter;
        filteredInstallments = allInstallments.filter((inst) => {
          const instDate = inst.date.split("T")[0]; // Get date part only
          return instDate === targetDate;
        });
        console.log(
          `📅 Found ${filteredInstallments.length} payments on ${targetDate}`
        );
      } else if (
        parameters.date_range &&
        parameters.date_range.start &&
        parameters.date_range.end
      ) {
        // Date range filter
        const startDate = new Date(parameters.date_range.start);
        const endDate = new Date(parameters.date_range.end);

        filteredInstallments = allInstallments.filter((inst) => {
          const instDate = new Date(inst.date);
          return instDate >= startDate && instDate <= endDate;
        });
        console.log(
          `📅 Found ${filteredInstallments.length} payments between ${parameters.date_range.start} and ${parameters.date_range.end}`
        );
      }

      // Add student details to each payment
      const allStudents = await getAllStudents();
      result = filteredInstallments.map((inst) => {
        const student = allStudents.find((s) => s.stud_id === inst.stud_id);
        return {
          ...inst,
          parent_name: student?.parent_name || "",
          phone_no: student?.phone_no || "",
        };
      });

      return {
        success: true,
        data: result,
        query_type: "payment_history",
        message: `Found ${result.length} payments`,
      };
    }

    // Handle individual student payment history (existing logic)
    let student = null;
    if (parameters.stud_id) {
      student = await findStudentById(parameters.stud_id);
    } else if (parameters.name) {
      student = await findStudentByName(parameters.name);
    }

    if (!student) {
      return {
        success: false,
        data: null,
        query_type: "payment_history",
        message: "Student not found",
      };
    }

    const dateRange = parameters.date_range || null;
    const paymentHistory = await getPaymentHistory(student.stud_id, dateRange);

    return {
      success: true,
      data: paymentHistory,
      query_type: "payment_history",
      message: "Payment history retrieved successfully",
    };
  } catch (error) {
    console.error("❌ Error getting payment history:", error);
    throw error;
  }
}

// Get real class report from Google Sheets
async function getClassReport(parameters, output_format) {
  try {
    if (!parameters.class) {
      throw new Error("Class is required for class report");
    }

    const students = await getStudentsByClass(parameters.class);
    return {
      success: true,
      data: students,
      query_type: "class_report",
      message: `Class ${parameters.class} report retrieved successfully`,
    };
  } catch (error) {
    throw error;
  }
}
