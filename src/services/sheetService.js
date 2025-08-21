import { google } from "googleapis";

const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json", // Google Service Account JSON
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Keep existing updateSheet function for backward compatibility
export const updateSheet = async (data) => {
  try {
    // Import here to avoid circular dependency
    const { addInstallment } = await import(
      "../controllers/sheetsController.js"
    );

    console.log("🔍 Raw data received in updateSheet:", data);

    // Check if this is new AI-parsed format
    if (data.Installments && data.Installments.length > 0) {
      // Extract installment data from AI response
      const installmentData = data.Installments[0];
      console.log("🔍 Extracted installment data:", installmentData);

      const result = await addInstallment(installmentData);
      console.log("✅ Data added to Google Sheets:", result);
      return result;
    }

    // Fallback for old format
    const installmentData = {
      name: data.student_name || data.name,
      class: data.class,
      installment_amount: data.fee_paid || data.amount,
      date: data.payment_date || data.date,
      mode: data.mode || "cash",
      remarks: data.remarks || "",
      recorded_by: "whatsapp_bot",
    };

    console.log("🔍 Fallback installment data:", installmentData);

    const result = await addInstallment(installmentData);
    console.log("✅ Data added to Google Sheets:", result);
    return result;
  } catch (err) {
    console.error("❌ Google Sheets update error:", err);
    throw err;
  }
};
