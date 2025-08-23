import PDFDocument from "pdfkit";
import fs from "fs-extra";
import path from "path";

export async function generateInvoicePDF(invoiceData) {
  try {
    console.log("📄 Generating invoice PDF for:", invoiceData.studentName);

    // Ensure invoices directory exists
    const invoicesDir = path.join(process.cwd(), "invoices");
    await fs.ensureDir(invoicesDir);

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });

    // Generate filename
    const fileName = `invoice_${invoiceData.installmentId}_${Date.now()}.pdf`;
    const filePath = path.join(invoicesDir, fileName);

    // Pipe to file
    doc.pipe(fs.createWriteStream(filePath));

    // Header
    doc.fontSize(20).text("PAYMENT INVOICE", 50, 50, { align: "center" });
    doc
      .fontSize(12)
      .text("Chat2Sheet School Management System", 50, 80, { align: "center" });

    // Line separator
    doc.moveTo(50, 100).lineTo(550, 100).stroke();

    // Invoice details
    doc.fontSize(14).text("Invoice Details", 50, 120);
    doc
      .fontSize(10)
      .text(`Invoice ID: ${invoiceData.installmentId}`, 50, 140)
      .text(`Date: ${invoiceData.paymentDate}`, 350, 140)
      .text(`Student ID: ${invoiceData.studentId}`, 50, 160)
      .text(`Student Name: ${invoiceData.studentName}`, 50, 180)
      .text(`Class: ${invoiceData.class}`, 50, 200);

    // Payment details box
    doc.rect(50, 230, 500, 120).stroke();
    doc.fontSize(12).text("Payment Details", 60, 240);

    doc
      .fontSize(10)
      .text(`Payment Amount: ₹${invoiceData.installmentAmount}`, 60, 260)
      .text(`Payment Mode: ${invoiceData.paymentMode || "Cash"}`, 60, 280)
      .text(`Total Fees: ₹${invoiceData.totalFee}`, 60, 300)
      .text(`Total Paid: ₹${invoiceData.totalPaid}`, 60, 320)
      .text(`Remaining Balance: ₹${invoiceData.balance}`, 300, 320);

    // Footer
    doc
      .fontSize(8)
      .text("Thank you for your payment!", 50, 400)
      .text("For queries, contact school administration.", 50, 415)
      .text(`Generated on: ${new Date().toLocaleString()}`, 50, 430);

    // Finalize PDF
    doc.end();

    // Wait for file to be written
    await new Promise((resolve) => {
      doc.on("end", resolve);
    });

    console.log("✅ Invoice PDF generated:", filePath);
    return filePath;
  } catch (error) {
    console.error("❌ Error generating invoice PDF:", error);
    throw error;
  }
}

export async function cleanupInvoiceFile(filePath) {
  try {
    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
      console.log("🗑️ Cleaned up invoice file:", filePath);
    }
  } catch (error) {
    console.error("❌ Error cleaning up invoice file:", error);
  }
}
