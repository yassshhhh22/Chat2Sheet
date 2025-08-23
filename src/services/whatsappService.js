import axios from "axios";
import fs from "fs/promises";
import path from "path";

const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_API_URL = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

export async function sendWhatsAppMessage(to, message) {
  try {
    const response = await axios.post(
      WHATSAPP_API_URL,
      {
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ WhatsApp message sent successfully");
    return response.data;
  } catch (error) {
    console.error(
      "❌ Error sending WhatsApp message:",
      error.response?.data || error.message
    );
    throw error;
  }
}

export async function sendFormattedResponse(to, result) {
  let message = "";

  if (result.success) {
    message = "✅ *Data processed successfully!*\n\n";

    // Add student results
    if (result.students?.length > 0) {
      message += "👨‍🎓 *Students Added:*\n";
      result.students.forEach((student) => {
        if (student.success) {
          message += `• ${student.data.name} (${student.stud_id})\n`;
        }
      });
      message += "\n";
    }

    // Add installment results
    if (result.installments?.length > 0) {
      message += "💰 *Installments Added:*\n";
      result.installments.forEach((installment) => {
        if (installment.success) {
          message += `• ₹${installment.data.amount} for ${installment.data.student_name}\n`;
        }
      });
      message += "\n";
    }

    message += "Data has been updated in the Google Sheets! 📊";
  } else {
    message = "❌ *Error processing your request*\n\n";
    message += `Error: ${result.message}`;
  }

  return await sendWhatsAppMessage(to, message);
}

export async function sendReadResponse(to, result) {
  let message = "";

  if (result.success) {
    message = "📊 *Information Retrieved*\n\n";

    switch (result.query_type) {
      case "student_details":
      case "student_info": // Handle both types
        if (result.data) {
          message += `👨‍🎓 *Student Details:*\n`;
          message += `• ID: ${result.data.stud_id}\n`;
          message += `• Name: ${result.data.name}\n`;
          message += `• Class: ${result.data.class}\n`;
          message += `• Parent: ${result.data.parent_name}\n`;
          message += `• Phone: ${result.data.phone_no}\n`;
          if (result.data.email) message += `• Email: ${result.data.email}\n`;
        } else {
          message += "❌ Student not found";
        }
        break;

      case "fee_status":
        if (result.data) {
          message += `💰 *Fee Status for ${result.data.name}:*\n`;
          message += `• Total Fees: ₹${result.data.total_fees}\n`;
          message += `• Paid: ₹${result.data.total_paid}\n`;
          message += `• Balance: ₹${result.data.balance}\n`;
          message += `• Status: ${result.data.status}\n`;
        } else {
          message += "❌ Fee information not found";
        }
        break;

      case "payment_history":
        if (result.data && result.data.length > 0) {
          // Check if this is a date-based query (multiple students) or individual student
          const isDateBased = result.data.some(
            (payment) => payment.parent_name !== undefined
          );

          if (isDateBased) {
            // Date-based payment report
            message += `📅 *Payments Report:*\n`;
            message += `📈 *Total Payments:* ${result.data.length}\n\n`;

            let totalAmount = 0;
            result.data.forEach((payment, index) => {
              const amount = parseFloat(payment.installment_amount || 0);
              totalAmount += amount;

              message += `${index + 1}. ${payment.name} (${payment.stud_id})\n`;
              message += `   🆔 Installment ID: ${payment.inst_id}\n`;
              message += `   💰 Amount: ₹${payment.installment_amount}\n`;
              message += `   📅 Date: ${payment.date}\n`;
              message += `   💳 Mode: ${payment.mode}\n`;
              if (payment.remarks)
                message += `   📝 Remarks: ${payment.remarks}\n`;
              message += `\n`;
            });

            message += `💰 *Total Amount Collected:* ₹${totalAmount}`;
          } else {
            // Individual student payment history
            message += `📈 *Payment History:*\n`;
            result.data.forEach((payment, index) => {
              const amount = payment.installment_amount || "0";
              const date = payment.date || "Unknown date";
              const mode = payment.mode || "Unknown mode";
              const instId = payment.inst_id || "N/A";

              message += `${index + 1}. 🆔 ${instId}\n`;
              message += `   💰 Amount: ₹${amount}\n`;
              message += `   📅 Date: ${date}\n`;
              message += `   💳 Mode: ${mode}\n`;
              if (payment.remarks)
                message += `   📝 Remarks: ${payment.remarks}\n`;
              message += `\n`;
            });

            const total = result.data.reduce(
              (sum, payment) =>
                sum + parseFloat(payment.installment_amount || 0),
              0
            );
            message += `💰 *Total Paid:* ₹${total}`;
          }
        } else {
          message += "❌ No payment history found";
        }
        break;

      case "student_search":
        if (result.data && result.data.length > 0) {
          message += `🔍 *Search Results (${result.data.length} found):*\n`;
          result.data.forEach((student) => {
            message += `• ${student.name} (${student.stud_id}) - Class ${student.class}\n`;
          });
        } else {
          message += "❌ No students found";
        }
        break;

      case "class_report":
        if (result.data && result.data.length > 0) {
          message += `📚 *Class ${result.data[0].class} Report (${result.data.length} students):*\n`;
          result.data.forEach((student) => {
            message += `• ${student.name} (${student.stud_id})\n`;
          });
        } else {
          message += "❌ No students found in this class";
        }
        break;

      case "aggregate_summary":
        if (result.data) {
          console.log(
            "🔍 DEBUG: Total students to show:",
            result.data.students?.length
          );
          console.log("🔍 DEBUG: Students data:", result.data.students);

          message += `📊 *${result.data.query}*\n\n`;

          if (result.data.total_count) {
            message += `📈 *Total Count:* ${result.data.total_count}\n\n`;
          }

          if (result.data.students && result.data.students.length > 0) {
            message += `👥 *Complete Students List:*\n`;

            console.log(
              "🔍 DEBUG: About to loop through",
              result.data.students.length,
              "students"
            );

            // Show ALL students - no limits
            result.data.students.forEach((student, index) => {
              message += `${index + 1}. ${student.name} (${
                student.stud_id
              }) - Class ${student.class}\n`;
              if (student.paid)
                message += `   Paid: ₹${student.paid}, Balance: ₹${student.balance}\n`;
              if (student.balance && !student.paid)
                message += `   Balance: ₹${student.balance}\n`;
              message += `\n`;
            });

            console.log("🔍 DEBUG: Final message length:", message.length);
          }

          if (result.data.total_outstanding) {
            message += `💰 *Total Outstanding:* ₹${result.data.total_outstanding}`;
          }

          if (result.data.total_fees_collected) {
            message += `\n💰 *Total Collected:* ₹${result.data.total_fees_collected}`;
          }
        } else {
          message += "❌ No aggregate data found";
        }
        break;

      default:
        message += `📋 *Query Result:*\n${result.message}`;
        break;
    }
  } else {
    message = "❌ *Error retrieving information*\n\n";
    message += `Error: ${result.message}`;
  }

  return await sendWhatsAppMessage(to, message);
}

export async function sendInvoiceDocument(to, filePath, caption) {
  try {
    console.log("📎 Sending invoice document to:", to);

    const formData = new FormData();

    // Add the PDF file
    const fileBuffer = await fs.readFile(filePath);
    const blob = new Blob([fileBuffer], { type: "application/pdf" });
    formData.append("media", blob, path.basename(filePath));

    // First, upload the media
    const mediaResponse = await fetch(
      `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/media`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
        body: formData,
      }
    );

    const mediaData = await mediaResponse.json();
    console.log("📎 Media upload response:", mediaData);

    if (!mediaData.id) {
      throw new Error("Failed to upload media");
    }

    // Send the document message
    const messageData = {
      messaging_product: "whatsapp",
      to: to,
      type: "document",
      document: {
        id: mediaData.id,
        caption: caption,
        filename: path.basename(filePath),
      },
    };

    const response = await fetch(
      `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messageData),
      }
    );

    const result = await response.json();
    console.log("📎 Document send response:", result);

    return result;
  } catch (error) {
    console.error("❌ Error sending invoice document:", error);
    throw error;
  }
}
