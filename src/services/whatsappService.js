import axios from "axios";
import fs from "fs-extra"; // Use fs-extra for better file handling
import path from "path";
import FormData from "form-data"; // Import form-data directly

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
          message += `📊 *${result.data.query}*\n\n`;

          if (result.data.total_count) {
            message += `📈 *Total Count:* ${result.data.total_count}\n\n`;
          }

          if (result.data.students && result.data.students.length > 0) {
            message += `👥 *Complete Students List:*\n`;

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

export async function sendInvoicePDF(phoneNumber, pdfPath, studentName) {
  try {
    console.log("📎 Sending invoice PDF to:", phoneNumber);

    // Read the file as a buffer to ensure it's not corrupted
    const fileBuffer = await fs.readFile(pdfPath);

    const FormData = (await import("form-data")).default;
    const formData = new FormData();

    // Append the buffer directly instead of using a stream
    formData.append("file", fileBuffer, {
      filename: path.basename(pdfPath),
      contentType: "application/pdf",
      knownLength: fileBuffer.length, // Specify the length
    });

    // Use axios for media upload with query parameters
    const mediaResponse = await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/media?messaging_product=whatsapp&type=application/pdf`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          ...formData.getHeaders(),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    const mediaData = mediaResponse.data;
    console.log("✅ Media uploaded successfully");

    if (!mediaData.id) {
      throw new Error("Failed to upload media: " + JSON.stringify(mediaData));
    }

    // Send the PDF document
    const messageData = {
      messaging_product: "whatsapp",
      to: phoneNumber,
      type: "document",
      document: {
        id: mediaData.id,
        caption: `📄 Payment Invoice for ${studentName}\n\nThank you for your payment!`,
        filename: path.basename(pdfPath),
      },
    };

    const response = await fetch(WHATSAPP_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messageData),
    });

    const result = await response.json();
    console.log("✅ Invoice sent successfully");
    return result;
  } catch (error) {
    console.error("❌ Error sending invoice:", error.message);
    throw error;
  }
}

export async function sendInvoiceDocument(to, filePath, caption) {
  try {
    console.log("📎 Sending invoice document to:", to);

    // Read the file as a buffer
    const fileBuffer = await fs.readFile(filePath);

    const FormData = (await import("form-data")).default;
    const formData = new FormData();

    // Append the buffer directly
    formData.append("file", fileBuffer, {
      filename: path.basename(filePath),
      contentType: "application/pdf",
      knownLength: fileBuffer.length,
    });

    // Use axios for media upload with query parameters
    const mediaResponse = await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/media?messaging_product=whatsapp&type=application/pdf`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          ...formData.getHeaders(),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    const mediaData = mediaResponse.data;
    console.log("✅ Media uploaded successfully");

    if (!mediaData.id) {
      throw new Error("Failed to upload media: " + JSON.stringify(mediaData));
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

    const response = await fetch(WHATSAPP_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messageData),
    });

    const result = await response.json();
    console.log("📎 Document sent successfully");

    return result;
  } catch (error) {
    console.error("❌ Error sending invoice document:", error.message);
    throw error;
  }
}

export async function sendPaymentLink(to, studentData) {
  const paymentLink = `https://75dc5d4ca51f.ngrok-free.app/payments/${studentData.stud_id}`;

  const message = `🔔 *Fee Payment - ${process.env.SCHOOL_NAME || "School"}*

Dear Parent,

👨‍🎓 *Student:* ${studentData.name}
🆔 *ID:* ${studentData.stud_id}
📚 *Class:* ${studentData.class}
💰 *Total Outstanding:* ₹${studentData.balance || "0"}

💳 *Pay Any Amount Online:*
${paymentLink}

✨ *Flexible Payment Options:*
• Pay full amount or partial
• Choose your payment amount
• Instant confirmation & receipt
• Secure online transactions

🚀 *Supported Payment Methods:*
• Credit/Debit Cards
• UPI (Google Pay, PhonePe, Paytm)
• Net Banking
• Wallets

For any queries, please contact the school office.

Thank you!`;

  return await sendWhatsAppMessage(to, message);
}
