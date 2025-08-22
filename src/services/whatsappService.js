import axios from 'axios';

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
        text: { body: message }
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ WhatsApp message sent successfully');
    return response.data;
  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error.response?.data || error.message);
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
      result.students.forEach(student => {
        if (student.success) {
          message += `• ${student.data.name} (${student.stud_id})\n`;
        }
      });
      message += "\n";
    }

    // Add installment results
    if (result.installments?.length > 0) {
      message += "💰 *Installments Added:*\n";
      result.installments.forEach(installment => {
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