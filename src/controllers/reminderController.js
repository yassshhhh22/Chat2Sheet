import { getAllStudents, findStudentById } from "../services/sheetsService.js";
import { sendWhatsAppMessage } from "../services/whatsappService.js";

// Helper function to format phone number with country code
function formatPhoneNumber(phoneNumber) {
  if (!phoneNumber) return null;

  const cleanNumber = phoneNumber.toString().trim();

  // If already has country code (starts with 91), return as is
  if (cleanNumber.startsWith("91")) {
    console.log(`📞 Phone already has country code: ${cleanNumber}`);
    return cleanNumber;
  }

  // Add country code 91 for Indian numbers
  const formatted = `91${cleanNumber}`;
  console.log(`📞 Added country code: ${cleanNumber} → ${formatted}`);
  return formatted;
}

// Send reminder to all students' parents
export async function sendReminderToAll() {
  try {
    console.log("📢 Starting reminder to all students...");
    const students = await getAllStudents();

    if (!students || students.length === 0) {
      console.log("❌ No students found in database");
      return "❌ No students found";
    }

    console.log(`📊 Found ${students.length} students in database`);

    let successCount = 0;
    let failCount = 0;
    let errorDetails = [];

    for (const student of students) {
      console.log(
        `\n👨‍🎓 Processing student: ${student.name} (${student.stud_id})`
      );
      console.log(`📞 Original parent_no from sheet: "${student.parent_no}"`);

      if (student.parent_no && student.parent_no.trim() !== "") {
        const formattedNumber = formatPhoneNumber(student.parent_no);

        if (formattedNumber) {
          try {
            console.log(`📱 Sending reminder to: ${formattedNumber}`);
            const reminderMessage = createReminderMessage(student);
            await sendWhatsAppMessage(formattedNumber, reminderMessage);
            successCount++;
            console.log(
              `✅ Reminder sent successfully to ${student.name}'s parent`
            );
          } catch (error) {
            failCount++;
            console.log(
              `❌ Failed to send to ${student.name}: ${error.message}`
            );

            // Check if it's a WhatsApp allowed list error
            if (error.response?.data?.error?.code === 131030) {
              errorDetails.push(`${student.name}: Phone not in allowed list`);
            } else {
              errorDetails.push(`${student.name}: ${error.message}`);
            }
          }
        } else {
          failCount++;
          console.log(`❌ Invalid phone number for ${student.name}`);
          errorDetails.push(`${student.name}: Invalid phone number`);
        }
      } else {
        failCount++;
        console.log(`❌ No parent number available for ${student.name}`);
        errorDetails.push(`${student.name}: No parent number available`);
      }
    }

    console.log(
      `\n📊 Final Summary: Success: ${successCount}, Failed: ${failCount}`
    );

    let response = `📢 Reminder process completed\n\n📊 Summary:\n• Total Students: ${students.length}\n• Successful: ${successCount}\n• Failed: ${failCount}`;

    if (failCount > 0 && errorDetails.length > 0) {
      response += `\n\n❌ Errors:\n${errorDetails
        .slice(0, 5)
        .map((detail) => `• ${detail}`)
        .join("\n")}`;
      if (errorDetails.length > 5) {
        response += `\n• ... and ${errorDetails.length - 5} more errors`;
      }
    }

    return response;
  } catch (error) {
    console.error("❌ Error in sendReminderToAll:", error);
    return "❌ Failed to send reminders to all students";
  }
}

// Send reminder to specific student's parent
export async function sendReminderToSpecific(studentId) {
  try {
    console.log(`📢 Starting reminder for specific student: ${studentId}`);
    const student = await findStudentById(studentId);

    if (!student) {
      console.log(`❌ Student not found: ${studentId}`);
      return `❌ Student ${studentId} not found`;
    }

    console.log(`👨‍🎓 Found student: ${student.name}`);
    console.log(`📞 Original parent_no from sheet: "${student.parent_no}"`);

    if (!student.parent_no || student.parent_no.trim() === "") {
      console.log(`❌ No parent number available for ${student.name}`);
      return `❌ No parent number available for ${student.name} (${studentId})`;
    }

    const formattedNumber = formatPhoneNumber(student.parent_no);

    if (!formattedNumber) {
      console.log(`❌ Invalid phone number format for ${student.name}`);
      return `❌ Invalid phone number for ${student.name} (${studentId})`;
    }

    try {
      console.log(
        `📱 Sending reminder to formatted number: ${formattedNumber}`
      );
      const reminderMessage = createReminderMessage(student);
      await sendWhatsAppMessage(formattedNumber, reminderMessage);

      console.log(`✅ Reminder sent successfully to ${student.name}'s parent`);
      return `✅ Reminder sent successfully\n\n👨‍🎓 Student: ${student.name}\n🆔 ID: ${student.stud_id}\n📚 Class: ${student.class}\n📞 Parent Number: ${formattedNumber}`;
    } catch (error) {
      console.log(
        `❌ Failed to send reminder to ${student.name}: ${error.message}`
      );

      // Handle WhatsApp specific errors
      if (error.response?.data?.error?.code === 131030) {
        return `❌ Cannot send reminder to ${student.name}\n\nReason: Parent's phone number (${formattedNumber}) is not in WhatsApp Business allowed list.\n\n💡 To fix this:\n1. Add ${formattedNumber} to your WhatsApp Business allowed recipients\n2. Or use a verified phone number`;
      } else {
        return `❌ Failed to send reminder to ${student.name}\n\nError: ${error.message}`;
      }
    }
  } catch (error) {
    console.error("❌ Error in sendReminderToSpecific:", error);
    return "❌ Failed to process reminder request";
  }
}

// Create reminder message template
function createReminderMessage(student) {
  const schoolName = process.env.SCHOOL_NAME || "School";
  const paymentLink = `https://ebbb59c082d6.ngrok-free.app/payments/${student.stud_id}`;

  return `🔔 *Fee Reminder - ${schoolName}*

Dear Parent,

This is a gentle reminder regarding the fee payment for:

👨‍🎓 *Student:* ${student.name}
🆔 *ID:* ${student.stud_id}
📚 *Class:* ${student.class}
💰 *Outstanding Amount:* ₹${student.balance || "Contact school"}

💳 *Quick Payment Link:* 
${paymentLink}

🚀 *Pay instantly via:*
• Credit/Debit Card
• UPI (Google Pay, PhonePe, Paytm)
• Net Banking

✅ *Benefits of Online Payment:*
• Instant confirmation
• Auto-generated invoice
• Secure transactions
• 24/7 availability

For any queries, please contact the school office.

Thank you for your cooperation.

*${schoolName} Management*`;
}

// Add this function to handle reminder-related message flows
export async function handleReminderMessage(from, classification, sendMessage) {
  let result;
  let responseMessage;

  switch (classification.operation) {
    case "REMIND_ALL":
      result = await sendReminderToAll();
      responseMessage = formatReminderResponse(result);
      await sendMessage(from, responseMessage);
      break;

    case "REMIND_SPECIFIC":
      if (classification.student_id) {
        result = await sendReminderToSpecific(classification.student_id);
        responseMessage = formatReminderResponse(result);
        await sendMessage(from, responseMessage);
      } else {
        await sendMessage(
          from,
          "❌ Please specify a student ID for reminder (e.g., STU123)"
        );
      }
      break;

    default:
      await sendMessage(
        from,
        "❌ I couldn't understand your request. Please try again."
      );
  }
}

// Helper function to format reminder responses
function formatReminderResponse(result) {
  if (typeof result === "string") {
    // If result is a string, just return it
    return result;
  }
  if (result.success) {
    let message = "📢 *Reminder Status*\n\n";
    message += `✅ ${result.message}\n\n`;

    if (result.total_students) {
      message += `📊 *Summary:*\n`;
      message += `• Total Students: ${result.total_students}\n`;
      message += `• Successful: ${result.success_count}\n`;
      message += `• Failed: ${result.fail_count}\n`;
    } else if (result.student) {
      message += `👨‍🎓 *Student Details:*\n`;
      message += `• Name: ${result.student.name}\n`;
      message += `• ID: ${result.student.stud_id}\n`;
      message += `• Class: ${result.student.class}\n`;
      message += `• Parent Number: ${result.student.parent_no}\n`;
    }

    return message;
  } else {
    return `❌ *Reminder Failed*\n\n${result.message}`;
  }
}
