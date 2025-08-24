import { sendReminderToAll, sendReminderToSpecific } from "./reminderController.js";

// Add this in your main message handling logic where you handle different operations
export async function handleMessage(req, res) {
  try {
    const { from, body } = req.body;
    
    // Classify the message
    const classification = await classifyMessage(body, from);
    
    let result;
    let responseMessage;
    
    switch (classification.operation) {
      case "READ":
        // Existing read logic
        break;
        
      case "CREATE":
      case "UPDATE":
      case "DELETE":
        // Existing write operations logic
        break;
        
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
          await sendMessage(from, "❌ Please specify a student ID for reminder (e.g., STU123)");
        }
        break;
        
      default:
        await sendMessage(from, "❌ I couldn't understand your request. Please try again.");
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error handling message:", error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// Helper function to format reminder responses
function formatReminderResponse(result) {
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