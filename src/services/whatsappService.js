import axios from "axios";

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
          message += `📈 *Payment History:*\n`;
          result.data.forEach((payment) => {
            message += `• ${payment.date}: ₹${payment.amount} (${payment.mode})\n`;
          });
          const total = result.data.reduce(
            (sum, payment) => sum + parseFloat(payment.amount || 0),
            0
          );
          message += `\n💰 Total Paid: ₹${total}`;
        } else {
          message += "❌ No payment history found";
        }
        break;

      case "student_search":
        if (result.data && result.data.length > 0) {
          message += `🔍 *Search Results (${result.data.length} found):*\n`;
          // Remove the slice limit and show ALL results
          result.data.forEach((student) => {
            message += `• ${student.name} (${student.stud_id}) - Class ${student.class}\n`;
          });
          // Remove the truncation message completely
        } else {
          message += "❌ No students found";
        }
        break;
    }
  } else {
    message = "❌ *Error retrieving information*\n\n";
    message += `Error: ${result.message}`;
  }

  return await sendWhatsAppMessage(to, message);
}
