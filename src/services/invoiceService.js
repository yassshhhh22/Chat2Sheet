import PDFDocument from "pdfkit";
import fs from "fs-extra";
import path from "path";

export async function generateInvoicePDF(invoiceData) {
  try {
    console.log("📄 Generating invoice PDF for:", invoiceData.studentName);
    console.log("🔍 Invoice data received:", invoiceData); // Debug log

    // Ensure invoices directory exists
    const invoicesDir = path.join(process.cwd(), "invoices");
    await fs.ensureDir(invoicesDir);

    // Create PDF document with better layout
    const doc = new PDFDocument({
      margin: 50,
      size: "A4",
      info: {
        Title: "Payment Invoice",
        Author: "Chat2Sheet School Management System",
        Subject: "Student Fee Payment Invoice",
      },
    });

    // Generate filename
    const fileName = `invoice_${invoiceData.installmentId}_${Date.now()}.pdf`;
    const filePath = path.join(invoicesDir, fileName);

    // Create write stream
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // Define colors
    const primaryColor = "#2c3e50";
    const accentColor = "#3498db";
    const lightGray = "#ecf0f1";

    // Header Section
    doc
      .fontSize(24)
      .fillColor(primaryColor)
      .text("PAYMENT INVOICE", 50, 50, { align: "center" });

    doc
      .fontSize(12)
      .fillColor("#7f8c8d")
      .text("Chat2Sheet School Management System", 50, 80, { align: "center" });

    // Header line
    doc
      .strokeColor(accentColor)
      .lineWidth(2)
      .moveTo(50, 110)
      .lineTo(545, 110)
      .stroke();

    // Invoice number and date section
    doc.rect(50, 130, 495, 60).fillAndStroke(lightGray, "#bdc3c7");

    doc
      .fillColor(primaryColor)
      .fontSize(12)
      .text(`Invoice #: INV-${invoiceData.installmentId}`, 60, 145)
      .text(
        `Date: ${new Date(invoiceData.paymentDate).toLocaleDateString(
          "en-IN"
        )}`,
        400,
        145
      )
      .text(`Generated: ${new Date().toLocaleDateString("en-IN")}`, 400, 160);

    // Add recorded by information prominently - with debug
    const recordedByName = invoiceData.recordedBy || "System";
    console.log("🔍 Recorded by name:", recordedByName); // Debug log

    doc
      .fillColor("#2980b9")
      .fontSize(11)
      .text(`Recorded by: ${recordedByName}`, 60, 175);

    // Student Information Section
    let currentY = 210;
    doc
      .fillColor(primaryColor)
      .fontSize(14)
      .text("Student Information", 50, currentY);

    currentY += 25;
    doc
      .fontSize(11)
      .text(`Student ID: ${invoiceData.studentId}`, 50, currentY)
      .text(`Student Name: ${invoiceData.studentName}`, 50, currentY + 20)
      .text(`Class: ${invoiceData.class}`, 50, currentY + 40);

    // Payment Details Section
    currentY += 80;
    doc.rect(50, currentY, 495, 150).fillAndStroke("#f8f9fa", "#dee2e6");

    doc
      .fillColor(primaryColor)
      .fontSize(14)
      .text("Payment Details", 60, currentY + 15);

    currentY += 40;

    // Create a table-like structure
    const leftCol = 60;
    const rightCol = 300;

    doc
      .fontSize(11)
      .text("Payment Amount:", leftCol, currentY)
      .text(
        `Rs. ${Number(invoiceData.installmentAmount).toLocaleString("en-IN")}`,
        rightCol,
        currentY
      );

    currentY += 20;
    doc
      .text("Payment Mode:", leftCol, currentY)
      .text(invoiceData.paymentMode || "Cash", rightCol, currentY);

    currentY += 20;
    doc
      .text("Total Fees:", leftCol, currentY)
      .text(
        `Rs. ${Number(invoiceData.totalFee).toLocaleString("en-IN")}`,
        rightCol,
        currentY
      );

    currentY += 20;
    doc
      .text("Total Paid:", leftCol, currentY)
      .text(
        `Rs. ${Number(invoiceData.totalPaid).toLocaleString("en-IN")}`,
        rightCol,
        currentY
      );

    currentY += 20;
    doc
      .fillColor("#e74c3c")
      .text("Remaining Balance:", leftCol, currentY)
      .text(
        `Rs. ${Number(invoiceData.balance).toLocaleString("en-IN")}`,
        rightCol,
        currentY
      );

    // Status Section
    currentY += 50;
    const statusColor = invoiceData.balance > 0 ? "#f39c12" : "#27ae60";
    const statusText =
      invoiceData.balance > 0 ? "PARTIAL PAYMENT" : "FULLY PAID";

    doc.rect(50, currentY, 495, 30).fillAndStroke(statusColor, statusColor);

    doc
      .fillColor("#ffffff")
      .fontSize(12)
      .text(`STATUS: ${statusText}`, 50, currentY + 10, { align: "center" });

    // Transaction Details Section
    currentY += 60;
    doc
      .fillColor(primaryColor)
      .fontSize(12)
      .text("Transaction Details", 50, currentY);

    currentY += 20;
    doc.rect(50, currentY, 495, 40).fillAndStroke("#e8f4fd", "#3498db");

    doc
      .fillColor("#2c3e50")
      .fontSize(10)
      .text(
        `Payment Recorded by: ${invoiceData.recordedBy || "System Staff"}`,
        60,
        currentY + 10
      )
      .text(
        `Entry Created: ${
          invoiceData.createdAt
            ? new Date(invoiceData.createdAt).toLocaleString("en-IN")
            : new Date().toLocaleString("en-IN")
        }`,
        60,
        currentY + 25
      );

    // Footer Section
    currentY += 70;
    doc
      .strokeColor("#bdc3c7")
      .lineWidth(1)
      .moveTo(50, currentY)
      .lineTo(545, currentY)
      .stroke();

    currentY += 20;
    doc
      .fillColor("#7f8c8d")
      .fontSize(10)
      .text("Thank you for your payment!", 50, currentY)
      .text(
        "For any queries, please contact the school administration.",
        50,
        currentY + 15
      );

    // Generated by section with more details
    currentY += 40;
    doc
      .fillColor("#95a5a6")
      .fontSize(8)
      .text(`Generated by: Chat2Sheet School Management System`, 50, currentY)
      .text(
        `Generated on: ${new Date().toLocaleString("en-IN")}`,
        50,
        currentY + 12
      )
      .text(`System Version: v1.0.0`, 50, currentY + 24)
      .text(
        `Authorized by: ${invoiceData.recordedBy || "System Administrator"}`,
        50,
        currentY + 36
      );

    // Add a subtle border around the entire document
    doc
      .rect(30, 30, 535, doc.page.height - 60)
      .strokeColor("#ecf0f1")
      .lineWidth(1)
      .stroke();

    // Finalize the PDF and end the stream
    doc.end();

    // Wait for the file to be completely written
    return new Promise((resolve, reject) => {
      writeStream.on("finish", () => {
        console.log("✅ PDF generated successfully:", filePath);
        resolve(filePath);
      });
      writeStream.on("error", reject);
    });
  } catch (error) {
    console.error("❌ Error generating PDF:", error);
    throw error;
  }
}

export async function cleanupInvoiceFile(filePath) {
  try {
    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
      console.log(
        "🗑️ Successfully deleted invoice file:",
        path.basename(filePath)
      );
    } else {
      console.log(
        "⚠️ Invoice file not found for cleanup:",
        path.basename(filePath)
      );
    }
  } catch (error) {
    console.error("❌ Error cleaning up invoice file:", error.message);
    // Don't throw the error - cleanup failure shouldn't break the main flow
  }
}
