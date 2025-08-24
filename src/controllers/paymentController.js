import Razorpay from "razorpay";
import crypto from "crypto";
import {
  findStudentById,
  getStudentFeeStatus,
} from "../services/sheetsService.js";
import { parseMessageWithAI } from "../services/aiService.js";
import { processAIData } from "../services/sheetService.js";
import { sendWhatsAppMessage } from "../services/whatsappService.js";

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Payment page controller - when parent clicks payment link
export const renderPaymentPage = async (req, res) => {
  try {
    const { studid } = req.params;
    console.log(`💳 Payment page requested for: ${studid}`);

    // Fetch student details
    const student = await findStudentById(studid);
    if (!student) {
      return res.status(404).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h2>❌ Student Not Found</h2>
            <p>Student ID: ${studid} not found in our records.</p>
            <p>Please contact the school office.</p>
          </body>
        </html>
      `);
    }

    // Get fee status
    const feeStatus = await getStudentFeeStatus(studid);
    const amountDue = parseInt(feeStatus?.balance || 0);

    if (amountDue <= 0) {
      return res.send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h2>✅ No Pending Fees</h2>
            <p>Dear Parent, <strong>${student.name}</strong>'s fees are fully paid.</p>
            <p>Current Balance: ₹0</p>
            <div style="margin-top: 30px; padding: 20px; background: #d4edda; border-radius: 5px;">
              <p>Thank you for keeping the payments up to date!</p>
            </div>
          </body>
        </html>
      `);
    }

    // Create Razorpay Order
    const order = await razorpay.orders.create({
      amount: amountDue * 100, // Amount in paisa
      currency: "INR",
      receipt: `fee_${studid}_${Date.now()}`,
      notes: {
        studid: studid,
        student_name: student.name,
        class: student.class,
        type: "fee_payment",
      },
    });

    console.log(`✅ Order created: ${order.id} for ₹${amountDue}`);

    // Render payment page with enhanced UI
    const paymentPageHTML = generatePaymentPageHTML({
      student,
      studid,
      amountDue,
      order,
    });

    res.send(paymentPageHTML);
  } catch (error) {
    console.error("❌ Payment page error:", error.message);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h2>❌ Payment Service Unavailable</h2>
          <p>We're experiencing technical difficulties.</p>
          <p>Please try again later or contact the school office.</p>
        </body>
      </html>
    `);
  }
};

// Payment success verification controller
export const verifyPaymentSuccess = async (req, res) => {
  try {
    const { payment_id, order_id, signature, amount } = req.query;
    console.log(`🔍 Verifying payment: ${payment_id} (₹${amount})`);

    // Verify signature
    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    hmac.update(order_id + "|" + payment_id);
    const generated_signature = hmac.digest("hex");

    if (generated_signature === signature) {
      console.log(`✅ Payment verified: ${payment_id}`);

      // Get order details to extract student info
      try {
        const order = await razorpay.orders.fetch(order_id);
        const studid = order.notes.studid;
        const amount_paid = parseFloat(amount);

        // Process payment through AI system (bypass confirmation)
        await processPaymentThroughAI(studid, amount_paid, payment_id);
        
        console.log(`✅ Payment processed for student: ${studid}`);
      } catch (processingError) {
        console.error("❌ Payment processing error:", processingError.message);
        // Still show success to user, but log the error
      }

      res.send(`
        <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Successful - Razorpay</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            line-height: 1.6;
            color: #334155;
        }

        .success-container {
            background: white;
            border-radius: 16px;
            box-shadow: 
                0 0 0 1px rgba(0, 0, 0, 0.03),
                0 1px 3px rgba(0, 0, 0, 0.1),
                0 4px 12px rgba(0, 0, 0, 0.08),
                0 16px 32px rgba(0, 0, 0, 0.05);
            max-width: 480px;
            width: 100%;
            padding: 48px 40px 40px;
            text-align: center;
            position: relative;
            overflow: hidden;
        }

        .success-container::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: linear-gradient(90deg, #10b981 0%, #059669 100%);
        }

        .success-icon {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
            animation: successPulse 0.8s ease-out;
            box-shadow: 0 8px 32px rgba(16, 185, 129, 0.3);
        }

        .success-icon svg {
            width: 40px;
            height: 40px;
            fill: white;
            animation: checkmarkDraw 1s ease-out 0.3s both;
        }

        @keyframes successPulse {
            0% {
                transform: scale(0.8);
                opacity: 0;
            }
            50% {
                transform: scale(1.1);
            }
            100% {
                transform: scale(1);
                opacity: 1;
            }
        }

        @keyframes checkmarkDraw {
            0% {
                transform: scale(0) rotate(45deg);
                opacity: 0;
            }
            100% {
                transform: scale(1) rotate(0deg);
                opacity: 1;
            }
        }

        .success-title {
            font-size: 26px;
            font-weight: 700;
            color: #1e293b;
            margin-bottom: 8px;
            letter-spacing: -0.02em;
        }

        .success-subtitle {
            font-size: 16px;
            color: #64748b;
            margin-bottom: 36px;
            font-weight: 400;
        }

        .payment-details {
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            border-radius: 12px;
            padding: 28px 24px;
            margin-bottom: 28px;
            border: 1px solid #e2e8f0;
            position: relative;
        }

        .payment-details::before {
            content: '';
            position: absolute;
            top: 0;
            left: 20px;
            right: 20px;
            height: 1px;
            background: linear-gradient(90deg, transparent 0%, #10b981 50%, transparent 100%);
        }

        .amount-section {
            margin-bottom: 24px;
            padding-bottom: 24px;
            border-bottom: 1px solid #e2e8f0;
        }

        .amount-header {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-bottom: 8px;
        }

        .amount-icon {
            width: 18px;
            height: 18px;
            fill: #10b981;
        }

        .amount-label {
            font-size: 14px;
            font-weight: 600;
            color: #475569;
            text-transform: uppercase;
            letter-spacing: 0.8px;
        }

        .amount {
            font-size: 32px;
            font-weight: 800;
            color: #1e293b;
            letter-spacing: -0.02em;
        }

        .transaction-details {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding: 12px 0;
            border-bottom: 1px solid #f1f5f9;
        }

        .transaction-details:last-child {
            margin-bottom: 0;
            border-bottom: none;
        }

        .transaction-label {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            color: #64748b;
            font-weight: 500;
        }

        .transaction-label-icon {
            width: 16px;
            height: 16px;
            fill: #94a3b8;
        }

        .transaction-value {
            font-size: 14px;
            color: #1e293b;
            font-weight: 600;
            background: white;
            padding: 6px 12px;
            border-radius: 6px;
            border: 1px solid #e2e8f0;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
        }

        .invoice-notice {
            background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
            border: 1px solid #a7f3d0;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 28px;
            position: relative;
        }

        .invoice-notice::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 2px;
            background: linear-gradient(90deg, #10b981 0%, #059669 100%);
            border-radius: 12px 12px 0 0;
        }

        .invoice-notice-content {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }

        .invoice-notice-icon {
            width: 22px;
            height: 22px;
            fill: #059669;
            flex-shrink: 0;
        }

        .invoice-notice-text {
            font-size: 15px;
            color: #065f46;
            font-weight: 600;
        }

        .security-badge {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 24px;
        }

        .security-icon {
            width: 18px;
            height: 18px;
            fill: #059669;
        }

        .security-text {
            font-size: 13px;
            color: #475569;
            font-weight: 500;
        }

        .close-notice {
            font-size: 14px;
            color: #64748b;
            font-weight: 400;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }

        .close-icon {
            width: 16px;
            height: 16px;
            fill: #94a3b8;
        }

        .footer {
            margin-top: 36px;
            padding-top: 24px;
            border-top: 1px solid #f1f5f9;
        }

        .footer-text {
            font-size: 12px;
            color: #94a3b8;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            font-weight: 500;
        }

        .razorpay-logo {
            width: 16px;
            height: 16px;
            fill: #0C4BFB;
        }

        /* Hover Effects */
        .transaction-value:hover {
            background: #f8fafc;
            transform: translateY(-1px);
            transition: all 0.2s ease;
        }

        /* Responsive Design */
        @media (max-width: 480px) {
            .success-container {
                padding: 36px 28px 32px;
                margin: 16px;
            }

            .success-title {
                font-size: 22px;
            }

            .amount {
                font-size: 26px;
            }

            .transaction-details {
                flex-direction: column;
                gap: 8px;
                align-items: flex-start;
                text-align: left;
            }

            .transaction-value {
                font-size: 13px;
                width: 100%;
                text-align: center;
            }

            .invoice-notice-content {
                flex-direction: column;
                gap: 12px;
                text-align: center;
            }
        }
    </style>
</head>
<body>
    <div class="success-container">
        <div class="success-icon">
            <svg viewBox="0 0 24 24">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
            </svg>
        </div>
        
        <h1 class="success-title">Payment Successful!</h1>
        <p class="success-subtitle">Your transaction has been completed successfully</p>
        
        <div class="payment-details">
            <div class="amount-section">
                <div class="amount-header">
                    <svg class="amount-icon" viewBox="0 0 24 24">
                        <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 1H5C3.9 1 3 1.9 3 3V17C3 18.1 3.9 19 5 19H11V21C11 21.6 11.4 22 12 22S13 21.6 13 21V19H19C20.1 19 21 18.1 21 17V9Z"/>
                    </svg>
                    <span class="amount-label">Amount Paid</span>
                </div>
                <div class="amount">₹${amount}</div>
            </div>
            
            <div class="transaction-details">
                <div class="transaction-label">
                    <svg class="transaction-label-icon" viewBox="0 0 24 24">
                        <path d="M9,4V6H15V4H17V6H20A2,2 0 0,1 22,8V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V8A2,2 0 0,1 4,6H7V4H9M4,8V18H20V8H4Z"/>
                    </svg>
                    <span>Transaction ID</span>
                </div>
                <span class="transaction-value">${payment_id}</span>
            </div>
            
            <div class="transaction-details">
                <div class="transaction-label">
                    <svg class="transaction-label-icon" viewBox="0 0 24 24">
                        <path d="M20,8H4V6C4,4.89 4.89,4 6,4H18A2,2 0 0,1 20,6V8M4,10H20V18A2,2 0 0,1 18,20H6C4.89,20 4,19.11 4,18V10Z"/>
                    </svg>
                    <span>Payment Method</span>
                </div>
                <span class="transaction-value">Razorpay</span>
            </div>
            

        </div>
        
        <div class="security-badge">
            <svg class="security-icon" viewBox="0 0 24 24">
                <path d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M10,17L6,13L7.41,11.59L10,14.17L16.59,7.58L18,9L10,17Z"/>
            </svg>
            <span class="security-text">Secured by 256-bit SSL encryption</span>
        </div>
        
        <div class="invoice-notice">
            <div class="invoice-notice-content">
                <svg class="invoice-notice-icon" viewBox="0 0 24 24">
                    <path d="M22,3H2C0.91,3.04 0.04,3.91 0,5V19C0.04,20.09 0.91,20.96 2,21H22C23.09,20.96 23.96,20.09 24,19V5C23.96,3.91 23.09,3.04 22,3M22,19H2V5H22V19M14,17V15.5C14,14.11 15.11,13 16.5,13V11A2.5,2.5 0 0,0 14,8.5H10A2.5,2.5 0 0,0 7.5,11V13C8.89,13 10,14.11 10,15.5V17H14Z"/>
                </svg>
                <span class="invoice-notice-text">Invoice will be sent via WhatsApp shortly</span>
            </div>
        </div>
        
        <div class="close-notice">
            <svg class="close-icon" viewBox="0 0 24 24">
                <path d="M13,14H11V10H13M13,18H11V16H13M1,21H23L12,2L1,21Z"/>
            </svg>
            <span>You can safely close this window</span>
        </div>
        
        <div class="footer">
            <div class="footer-text">
                <span>Powered by</span>
                <svg class="razorpay-logo" viewBox="0 0 24 24">
                    <path d="M14.5 4l-7 7h4.5l-7 9L22 9h-7l7-5z"/>
                </svg>
                <span>Razorpay </span>
            </div>
        </div>
    </div>
</body>
</html>
      `);
    } else {
      console.error(`❌ Payment verification failed:-${payment_id}`);
      res.status(400).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h2>❌ Payment Verification Failed</h2>
            <p>Unable to verify your payment.</p>
            <p>Please contact the school office with Transaction ID: ${payment_id}</p>
          </body>
        </html>
      `);
    }
  } catch (error) {
    console.error("❌ Payment verification error:", error.message);
    res.status(500).send("Payment verification failed");
  }
};

// Razorpay webhook controller
export const handleRazorpayWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    // Verify webhook signature
    const hmac = crypto.createHmac("sha256", webhookSecret);
    hmac.update(JSON.stringify(req.body));
    const generated_signature = hmac.digest("hex");

    if (generated_signature !== signature) {
      console.error("❌ Invalid webhook signature");
      return res.status(400).send("Invalid signature");
    }

    const event = req.body;
    console.log(`📨 Webhook: ${event.event}`);

    if (event.event === "payment.captured") {
      await processPaymentSuccess(event.payload.payment.entity);
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Webhook error:", error.message);
    res.status(500).send("Webhook processing failed");
  }
};

// Process successful payment (webhook handler)
async function processPaymentSuccess(payment) {
  try {
    console.log("🎉 Processing webhook payment:", payment.id);

    // Get order details to extract student info
    const order = await razorpay.orders.fetch(payment.order_id);
    const studid = order.notes.studid;
    const amount_paid = payment.amount / 100; // Convert from paisa to rupees

    // Form AI command for automatic processing
    const aiCommand = `Add installment
Student ID: ${studid}
Amount: ${amount_paid}
Mode: Online
Recorded by: Razorpay
Remarks: Transaction ID: ${payment.id}`;

    // Parse with AI (no confirmation needed for webhook)
    const parsedData = await parseMessageWithAI(aiCommand);

    if (
      !parsedData ||
      !parsedData.Installments ||
      parsedData.Installments.length === 0
    ) {
      throw new Error("AI parsing failed for payment data");
    }

    // Process the data automatically
    const result = await processAIData(parsedData);

    if (result.success) {
      console.log("✅ Webhook payment processed successfully");
      await sendPaymentConfirmation(studid, amount_paid, payment.id);
    } else {
      console.error("❌ AI processing failed");
      // Log the failure but don't throw to avoid webhook retry
    }
  } catch (error) {
    console.error("❌ Webhook processing error:", error.message);
    // Don't throw error to avoid webhook retry loops
  }
}

// Send payment confirmation to parent
async function sendPaymentConfirmation(studid, amount_paid, transaction_id) {
  try {
    const student = await findStudentById(studid);
    if (student && student.parent_no) {
      // Format phone number to include country code
      let phoneNumber = student.parent_no.toString();
      if (!phoneNumber.startsWith('91')) {
        phoneNumber = '91' + phoneNumber;
      }

      // Get updated fee status
      const feeStatus = await getStudentFeeStatus(studid);
      const remainingBalance = parseFloat(feeStatus?.balance || 0);

      const successMessage = `📄 *Payment Invoice*

Dear Parent,

We have received ₹${amount_paid} on ${new Date().toISOString().split('T')[0]} for ${student.name} (${student.class}).

*Payment Details:*
• Amount: ₹${amount_paid}
• Mode: Online
• Transaction ID: ${transaction_id}
• Remaining Balance: ₹${remainingBalance}

Please find the detailed invoice attached.

Thank you!
- School Administration`;

      await sendWhatsAppMessage(phoneNumber, successMessage);
      console.log(`✅ Payment confirmation sent to ${phoneNumber}`);
    } else {
      console.log(`⚠️ No parent contact found for: ${studid}`);
    }
  } catch (error) {
    // Handle WhatsApp restrictions gracefully  
    if (error.response?.data?.error?.code === 131030) {
      console.log(`⚠️ WhatsApp: Phone number not in allowed list`);
    } else {
      console.error("❌ Payment confirmation error:", error.message);
    }
  }
}

// Generate payment page HTML
function generatePaymentPageHTML({ student, studid, amountDue, order }) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Fee Payment - ${process.env.SCHOOL_NAME || "School"}</title>
      <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); 
          min-height: 100vh;
          padding: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .container { 
          max-width: 800px; 
          width: 100%;
          background: white; 
          border-radius: 16px; 
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
          overflow: hidden;
          animation: slideUp 0.6s ease-out;
          border: 1px solid #e2e8f0;
        }
        
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .header {
          background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
          color: white;
          padding: 40px;
          text-align: center;
          position: relative;
        }
        
        .school-logo {
          font-size: 48px;
          margin-bottom: 12px;
        }
        
        .school-name {
          font-size: 28px;
          font-weight: 600;
          margin-bottom: 8px;
          letter-spacing: -0.5px;
        }
        
        .subtitle {
          opacity: 0.9;
          font-size: 16px;
          font-weight: 400;
        }
        
        .main-content {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          padding: 40px;
        }
        
        .left-section {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        
        .right-section {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        
        .student-info { 
          background: #f8fafc; 
          padding: 24px; 
          border-radius: 12px; 
          border: 1px solid #e2e8f0;
        }
        
        .student-info h3 {
          color: #1e293b;
          margin-bottom: 16px;
          font-size: 18px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          padding: 8px 0;
          border-bottom: 1px solid #f1f5f9;
        }
        
        .info-row:last-child {
          border-bottom: none;
          margin-bottom: 0;
        }
        
        .info-label {
          font-weight: 500;
          color: #64748b;
          font-size: 14px;
        }
        
        .info-value {
          color: #1e293b;
          font-weight: 600;
          font-size: 14px;
        }
        
        .balance-highlight {
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          padding: 24px;
          border-radius: 12px;
          text-align: center;
          border: 1px solid #f59e0b;
        }
        
        .balance-label {
          font-size: 14px;
          color: #92400e;
          margin-bottom: 8px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .balance-amount {
          font-size: 32px;
          font-weight: 700;
          color: #b91c1c;
          letter-spacing: -1px;
        }
        
        .payment-form {
          background: #f8fafc;
          padding: 28px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
        }
        
        .form-group {
          margin-bottom: 24px;
        }
        
        .form-label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          color: #1e293b;
          font-size: 15px;
        }
        
        .form-input {
          width: 100%;
          padding: 16px;
          border: 2px solid #e2e8f0;
          border-radius: 8px;
          font-size: 16px;
          transition: all 0.2s ease;
          background: white;
          color: #1e293b;
        }
        
        .form-input:focus {
          border-color: #3b82f6;
          outline: none;
          box-shadow: 0 0 0 3px rgba(59,130,246,0.1);
        }
        
        .form-hint {
          margin-top: 8px;
          color: #64748b;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .pay-btn { 
          background: linear-gradient(135deg, #059669 0%, #10b981 100%); 
          color: white; 
          padding: 16px 28px; 
          border: none; 
          border-radius: 8px; 
          cursor: pointer; 
          font-size: 16px; 
          width: 100%;
          font-weight: 600;
          transition: all 0.2s ease;
          letter-spacing: 0.3px;
        }
        
        .pay-btn:hover { 
          transform: translateY(-1px);
          box-shadow: 0 8px 20px rgba(16,185,129,0.3);
          background: linear-gradient(135deg, #047857 0%, #059669 100%);
        }
        
        .pay-btn:active {
          transform: translateY(0);
        }
        
        .payment-methods {
          text-align: center;
          margin-top: 20px;
          padding: 16px;
          background: #f1f5f9;
          border-radius: 8px;
          color: #475569;
          font-size: 14px;
        }
        
        .method-icons {
          font-size: 18px;
          margin-bottom: 8px;
          letter-spacing: 8px;
        }
        
        .features {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        
        .feature {
          text-align: center;
          padding: 20px 16px;
          background: white;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          transition: all 0.2s ease;
        }
        
        .feature:hover {
          border-color: #3b82f6;
          transform: translateY(-1px);
        }
        
        .feature-icon {
          font-size: 24px;
          margin-bottom: 8px;
          display: block;
        }
        
        .feature-text {
          font-size: 12px;
          color: #64748b;
          font-weight: 500;
        }
        
        .secure-badge {
          text-align: center;
          margin-top: 20px;
          padding: 12px;
          background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
          border-radius: 8px;
          color: #166534;
          font-size: 13px;
          font-weight: 500;
          border: 1px solid #16a34a;
        }
        
        @media (max-width: 1024px) {
          .main-content {
            grid-template-columns: 1fr;
            gap: 30px;
            padding: 30px;
          }
        }
        
        @media (max-width: 768px) {
          .container { 
            margin: 10px;
            max-width: 100%;
          }
          .main-content { 
            padding: 24px; 
            gap: 24px;
          }
          .header {
            padding: 30px 24px;
          }
          .school-logo {
            font-size: 40px;
          }
          .school-name {
            font-size: 24px;
          }
          .balance-amount {
            font-size: 28px;
          }
          .features {
            grid-template-columns: 1fr;
            gap: 12px;
          }
        }
        
        .loading {
          opacity: 0.7;
          pointer-events: none;
        }
        
        .spinner {
          display: none;
          width: 18px;
          height: 18px;
          border: 2px solid #ffffff;
          border-top: 2px solid transparent;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-right: 8px;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .info-section {
          background: #f8fafc;
          padding: 20px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }
        
        .info-section h4 {
          color: #1e293b;
          margin-bottom: 12px;
          font-size: 16px;
          font-weight: 600;
        }
        
        .info-section p {
          color: #64748b;
          font-size: 14px;
          line-height: 1.5;
          margin-bottom: 8px;
        }
        
        .info-section p:last-child {
          margin-bottom: 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="school-logo">🏫</div>
          <div class="school-name">${process.env.SCHOOL_NAME || "School"}</div>
          <div class="subtitle">Secure Fee Payment Portal</div>
        </div>
        
        <div class="main-content">
          <div class="left-section">
            <div class="student-info">
              <h3>📋 Student Information</h3>
              <div class="info-row">
                <span class="info-label">Student Name</span>
                <span class="info-value">${student.name}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Class</span>
                <span class="info-value">${student.class}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Student ID</span>
                <span class="info-value">${studid}</span>
              </div>
            </div>
            
            <div class="balance-highlight">
              <div class="balance-label">Outstanding Balance</div>
              <div class="balance-amount">₹${amountDue}</div>
            </div>
            
            <div class="info-section">
              <h4>📋 Important Information</h4>
              <p>• You can pay any amount up to the outstanding balance</p>
              <p>• Digital receipt will be sent via WhatsApp immediately</p>
              <p>• All payments are processed securely through Razorpay</p>
              <p>• Contact school office for any payment related queries</p>
            </div>
          </div>
          
          <div class="right-section">
            <div class="payment-form">
              <div class="form-group">
                <label class="form-label" for="paymentAmount">💳 Enter Payment Amount</label>
                <input 
                  type="number" 
                  id="paymentAmount" 
                  name="amount" 
                  class="form-input"
                  min="1" 
                  max="${amountDue}" 
                  placeholder="Enter amount to pay"
                  value="${amountDue}"
                  required
                />
                <div class="form-hint">
                  ℹ️ Minimum: ₹1 • Maximum: ₹${amountDue}
                </div>
              </div>

              <button id="pay-btn" class="pay-btn">
                <span class="spinner"></span>
                <span class="btn-text">💳 Pay ₹${amountDue} Now</span>
              </button>
            </div>

            <div class="payment-methods">
              <div class="method-icons">💳 📱 🏦 💰</div>
              <div>Credit/Debit Card • UPI • Net Banking • Wallets</div>
            </div>
            
            <div class="features">
              <div class="feature">
                <span class="feature-icon">🔒</span>
                <div class="feature-text">256-bit SSL Encrypted</div>
              </div>
              <div class="feature">
                <span class="feature-icon">⚡</span>
                <div class="feature-text">Instant Processing</div>
              </div>
              <div class="feature">
                <span class="feature-icon">📄</span>
                <div class="feature-text">Digital Receipt</div>
              </div>
              <div class="feature">
                <span class="feature-icon">🛡️</span>
                <div class="feature-text">Secure by Razorpay</div>
              </div>
            </div>
            
            <div class="secure-badge">
              🔒 Payments secured by Razorpay • PCI DSS Compliant
            </div>
          </div>
        </div>
        
        <script>
          const paymentAmountInput = document.getElementById('paymentAmount');
          const payButton = document.getElementById('pay-btn');
          const btnText = document.querySelector('.btn-text');
          const spinner = document.querySelector('.spinner');
          
          // Update button text when amount changes
          paymentAmountInput.addEventListener('input', function() {
            const amount = this.value;
            if (amount && amount > 0) {
              btnText.textContent = '💳 Pay ₹' + amount + ' Now';
            } else {
              btnText.textContent = '💳 Pay Now';
            }
          });

          document.getElementById('pay-btn').addEventListener('click', function(e) {
            e.preventDefault();
            
            const paymentAmount = document.getElementById('paymentAmount').value;
            const maxAmount = ${amountDue};
            
            // Validation
            if (!paymentAmount || paymentAmount <= 0) {
              alert('⚠️ Please enter a valid payment amount');
              return;
            }
            
            if (parseFloat(paymentAmount) > maxAmount) {
              alert('⚠️ Payment amount cannot exceed outstanding balance of ₹' + maxAmount);
              return;
            }
            
            // Show loading state
            this.classList.add('loading');
            spinner.style.display = 'inline-block';
            btnText.textContent = 'Processing...';
            
            // Create new order with custom amount
            fetch('/api/payments/create-order', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                amount: paymentAmount,
                studid: '${studid}'
              })
            })
            .then(response => response.json())
            .then(data => {
              // Reset loading state
              payButton.classList.remove('loading');
              spinner.style.display = 'none';
              btnText.textContent = '💳 Pay ₹' + paymentAmount + ' Now';
              
              if (data.error) {
                alert('❌ Error: ' + data.error);
                return;
              }
              
              var options = {
                key: '${process.env.RAZORPAY_KEY_ID}',
                amount: Math.round(parseFloat(paymentAmount) * 100),
                currency: 'INR',
                order_id: data.order_id,
                name: '${process.env.SCHOOL_NAME || "School"}',
                description: 'Fee Payment for ${student.name}',
                image: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTIiIGZpbGw9IiMzYjgyZjYiLz4KPHN2ZyB4PSIxNiIgeT0iMTYiIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJ3aGl0ZSI+CjxwYXRoIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0tMiAxNWwtNS01aDNWOWgzdjNsMy0zaDN2M2gzbC01IDV6Ii8+Cjwvc3ZnPgo8L3N2Zz4K',
                handler: function(response) {
                  const params = new URLSearchParams({
                    payment_id: response.razorpay_payment_id,
                    order_id: response.razorpay_order_id,
                    signature: response.razorpay_signature,
                    amount: paymentAmount
                  });
                  window.location.href = '/payments/success?' + params.toString();
                },
                prefill: {
                  name: '${student.parent_name || ""}',
                  contact: '${student.parent_no || student.phone_no || ""}',
                  email: '${student.email || ""}'
                },
                theme: {
                  color: '#3b82f6'
                },
                modal: {
                  ondismiss: function() {
                    console.log('Payment modal closed');
                    // Reset button state
                    payButton.classList.remove('loading');
                    spinner.style.display = 'none';
                    btnText.textContent = '💳 Pay ₹' + paymentAmount + ' Now';
                  }
                }
              };
              
              var rzp = new Razorpay(options);
              rzp.on('payment.failed', function(response) {
                alert('❌ Payment failed: ' + response.error.description);
                // Reset button state
                payButton.classList.remove('loading');
                spinner.style.display = 'none';
                btnText.textContent = '💳 Pay ₹' + paymentAmount + ' Now';
              });
              rzp.open();
            })
            .catch(error => {
              console.error('Error:', error);
              alert('❌ Unable to process payment. Please try again.');
              // Reset button state
              payButton.classList.remove('loading');
              spinner.style.display = 'none';
              btnText.textContent = '💳 Pay ₹' + paymentAmount + ' Now';
            });
          });

          // Set initial button text
          paymentAmountInput.dispatchEvent(new Event('input'));
        </script>
      </div>
    </body>
    </html>
  `;
}

export async function processPayment(req, res) {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      amount, // Add this to accept user-specified amount
      stud_id,
    } = req.body;

    // Verify payment signature
    const isValidSignature = verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isValidSignature) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    // Process the payment with user-specified amount
    const result = await addInstallment({
      stud_id: stud_id,
      installment_amount: amount, // Use the amount specified by parent
      mode: "online",
      date: new Date().toISOString().split("T")[0],
      remarks: `Online payment - ${razorpay_payment_id}`,
      recorded_by: "Online Portal",
    });

    res.json({
      success: true,
      message: "Payment processed successfully",
      data: result,
    });
  } catch (error) {
    console.error("Payment processing error:", error);
    res.status(500).json({
      success: false,
      message: "Payment processing failed",
    });
  }
}

// Update the payment route handler
export const createPaymentOrder = async (req, res) => {
  try {
    const { stud_id } = req.params;
    const { amount } = req.body; // Get amount from form

    // Get student details
    const student = await findStudentById(stud_id);
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Get fee status to validate amount
    const feeStatus = await getStudentFeeStatus(stud_id);
    const maxAmount = parseFloat(feeStatus?.balance || 0);
    const paymentAmount = parseFloat(amount);

    // Validate payment amount
    if (!paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({ error: "Invalid payment amount" });
    }

    if (paymentAmount > maxAmount) {
      return res.status(400).json({
        error: `Payment amount cannot exceed outstanding balance of ₹${maxAmount}`,
      });
    }

    // Create Razorpay order with custom amount
    const order = await razorpay.orders.create({
      amount: Math.round(paymentAmount * 100), // Use custom amount
      currency: "INR",
      receipt: `fee_${stud_id}_${Date.now()}`,
      notes: {
        student_id: stud_id,
        student_name: student.name,
        payment_amount: paymentAmount.toString(),
        outstanding_balance: maxAmount.toString(),
      },
    });

    res.json({
      order_id: order.id,
      amount: paymentAmount, // Return the custom amount
      currency: "INR",
      student: student,
      razorpay_key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("❌ Order creation error:", error.message);
    res.status(500).json({ error: "Failed to create payment order" });
  }
};

// Add this new function for creating orders with custom amounts
export const createCustomPaymentOrder = async (req, res) => {
  try {
    const { studid, amount } = req.body;

    // Get student details
    const student = await findStudentById(studid);
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Get fee status to validate amount
    const feeStatus = await getStudentFeeStatus(studid);
    const maxAmount = parseFloat(feeStatus?.balance || 0);
    const paymentAmount = parseFloat(amount);

    // Validate payment amount
    if (!paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({ error: "Invalid payment amount" });
    }

    if (paymentAmount > maxAmount) {
      return res.status(400).json({
        error: `Payment amount cannot exceed outstanding balance of ₹${maxAmount}`,
      });
    }

    // Create Razorpay order with custom amount
    const order = await razorpay.orders.create({
      amount: Math.round(paymentAmount * 100), // Use custom amount
      currency: "INR",
      receipt: `fee_${studid}_${Date.now()}`,
      notes: {
        studid: studid,
        student_name: student.name,
        payment_amount: paymentAmount.toString(),
        outstanding_balance: maxAmount.toString(),
      },
    });

    res.json({
      order_id: order.id,
      amount: paymentAmount,
      currency: "INR",
      student: student,
      razorpay_key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("❌ Order creation error:", error.message);
    res.status(500).json({ error: "Failed to create payment order" });
  }
};

// Update payment verification to use actual paid amount
export const verifyPayment = async (req, res) => {
  try {
    const { payment_id, order_id, signature, amount } = req.body;

    // Verify payment signature
    const isValid = verifyPaymentSignature(payment_id, order_id, signature);

    if (!isValid) {
      return res.status(400).json({ error: "Invalid payment signature" });
    }

    // Get order details to extract student info
    const order = await razorpay.orders.fetch(order_id);
    const student_id = order.notes.student_id;
    const paidAmount = parseFloat(amount); // Use actual paid amount

    // Create installment record with actual paid amount
    const installmentData = {
      stud_id: student_id,
      installment_amount: paidAmount, // Use custom amount
      mode: "Online",
      date: new Date().toISOString().split("T")[0],
      remarks: `Online Payment - Transaction ID: ${payment_id}`,
      recorded_by: "Razorpay",
    };

    // Add installment to sheets
    const result = await addInstallment(installmentData);

    if (result.success) {
      res.json({
        success: true,
        message: "Payment successful",
        amount_paid: paidAmount,
        transaction_id: payment_id,
      });
    } else {
      throw new Error("Failed to record payment in sheets");
    }
  } catch (error) {
    console.error("❌ Payment verification error:", error.message);
    res.status(500).json({ error: "Payment verification failed" });
  }
};

// Add this new function to process payment through AI system
async function processPaymentThroughAI(studid, amount_paid, transaction_id) {
  try {
    console.log(`🤖 Processing AI payment for: ${studid} (₹${amount_paid})`);
    
    // Create AI command similar to your existing format
    const aiCommand = `Add installment
Student ID: ${studid}
Amount: ${amount_paid}
Mode: Online
Recorded by: Razorpay: ${transaction_id}
Date: ${new Date().toISOString().split('T')[0]}`;

    // Import the processWebhookPayment function that bypasses confirmation
    const { processWebhookPayment } = await import("../services/aiService.js");
    
    // Process through your existing webhook payment function (bypasses confirmation)
    const result = await processWebhookPayment(aiCommand);
    
    if (result.success) {
      console.log("✅ AI payment processing completed");
      
      // Send payment confirmation to parent
      await sendPaymentConfirmation(studid, amount_paid, transaction_id);
    } else {
      console.error("❌ AI processing failed");
      throw new Error("Payment processing failed");
    }
    
    return result;
  } catch (error) {
    console.error("❌ AI payment processing error:", error.message);
    throw error;
  }
}
