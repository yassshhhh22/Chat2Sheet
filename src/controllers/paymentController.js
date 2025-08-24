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

        // Process payment through existing webhook function (avoid duplication)
        const paymentEntity = {
          id: payment_id,
          order_id: order_id,
          amount: amount_paid * 100, // Convert to paisa for consistency
        };

        await processPaymentSuccess(paymentEntity);

        console.log(`✅ Payment processed for student: ${studid}`);
      } catch (processingError) {
        console.error("❌ Payment processing error:", processingError.message);
        // Still show success to user, but log the error
      }

      res.send(`
        <html>
          <head>
            <title>Payment Successful</title>
            <style>
              body { font-family: Arial; text-align: center; padding: 50px; background: #f8f9fa; }
              .success-container { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
              .success-icon { font-size: 60px; color: #28a745; margin-bottom: 20px; }
              .amount { font-size: 24px; color: #007cba; font-weight: bold; margin: 20px 0; }
              .transaction-id { background: #f8f9fa; padding: 10px; border-radius: 5px; font-family: monospace; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="success-container">
              <div class="success-icon">✅</div>
              <h2>Payment Successful!</h2>
              <div class="amount">Amount Paid: ₹${amount}</div>
              <div class="transaction-id">Transaction ID: ${payment_id}</div>
              <p>Your payment has been processed successfully.</p>
              <p><strong>📄 Invoice will be sent to you shortly via WhatsApp.</strong></p>
              <p style="margin-top: 30px; color: #6c757d;">You can now close this window.</p>
            </div>
          </body>
        </html>
      `);
    } else {
      console.error(`❌ Payment verification failed: ${payment_id}`);
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
      console.log("✅ Payment processed and invoice sent automatically");
      // REMOVE THIS LINE - it's causing the duplicate message
      // await sendPaymentConfirmation(studid, amount_paid, payment.id);

      return {
        success: true,
        message: "Payment processed successfully",
        transaction_id: payment.id,
      };
    } else {
      throw new Error("Payment processing failed");
    }
  } catch (error) {
    console.error("❌ Payment processing error:", error);
    throw error;
  }
}

// Send payment confirmation to parent
async function sendPaymentConfirmation(studid, amount_paid, transaction_id) {
  try {
    const student = await findStudentById(studid);
    if (student && student.parent_no) {
      // Format phone number to include country code
      let phoneNumber = student.parent_no.toString();
      if (!phoneNumber.startsWith("91")) {
        phoneNumber = "91" + phoneNumber;
      }

      // Get updated fee status
      const feeStatus = await getStudentFeeStatus(studid);
      const remainingBalance = parseFloat(feeStatus?.balance || 0);

      const successMessage = `📄 *Payment Invoice*

Dear Parent,

We have received ₹${amount_paid} on ${
        new Date().toISOString().split("T")[0]
      } for ${student.name} (${student.class}).

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
        * { 
          margin: 0; 
          padding: 0; 
          box-sizing: border-box; 
        }
        
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Inter', system-ui, sans-serif;
          background: #fafafa;
          min-height: 100vh;
          color: #1a1a1a;
          line-height: 1.5;
        }
        
        .header {
          background: #ffffff;
          border-bottom: 1px solid #e0e0e0;
          padding: 24px 0;
        }
        
        .header-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 24px;
          text-align: center;
        }
        
        .school-name {
          font-size: 28px;
          font-weight: 700;
          color: #1a1a1a;
          margin-bottom: 4px;
        }
        
        .subtitle {
          color: #666666;
          font-size: 16px;
          font-weight: 400;
        }
        
        .container { 
          max-width: 1200px;
          margin: 40px auto;
          padding: 0 24px;
        }
        
        .main-content {
          display: grid;
          grid-template-columns: 1fr 400px;
          gap: 40px;
          align-items: start;
        }
        
        .left-section {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        
        .card {
          background: #ffffff;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 24px;
        }
        
        .card-title {
          font-size: 18px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .icon {
          width: 20px;
          height: 20px;
          fill: #666666;
        }
        
        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid #f5f5f5;
        }
        
        .info-row:last-child {
          border-bottom: none;
        }
        
        .info-label {
          font-weight: 500;
          color: #666666;
          font-size: 14px;
        }
        
        .info-value {
          color: #1a1a1a;
          font-weight: 600;
          font-size: 14px;
        }
        
        .balance-card {
          background: #ffffff;
          border: 2px solid #1a1a1a;
          border-radius: 8px;
          padding: 32px 24px;
          text-align: center;
        }
        
        .balance-label {
          font-size: 14px;
          color: #666666;
          margin-bottom: 8px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .balance-amount {
          font-size: 36px;
          font-weight: 700;
          color: #1a1a1a;
          letter-spacing: -1px;
        }
        
        .right-section {
          position: sticky;
          top: 40px;
        }
        
        .payment-card {
          background: #ffffff;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 32px 24px;
        }
        
        .payment-title {
          font-size: 20px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 24px;
          text-align: center;
        }
        
        .form-group {
          margin-bottom: 24px;
        }
        
        .form-label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          color: #1a1a1a;
          font-size: 14px;
        }
        
        .form-input {
          width: 100%;
          padding: 16px;
          border: 1px solid #d0d0d0;
          border-radius: 4px;
          font-size: 16px;
          font-weight: 500;
          background: #ffffff;
          color: #1a1a1a;
          transition: border-color 0.2s ease;
        }
        
        .form-input:focus {
          border-color: #528ff0;
          outline: none;
        }
        
        .form-hint {
          margin-top: 8px;
          color: #666666;
          font-size: 12px;
          font-weight: 400;
        }
        
        .pay-btn { 
          background: #1a1a1a;
          color: #ffffff;
          padding: 16px 24px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
          width: 100%;
          font-weight: 600;
          transition: background-color 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        
        .pay-btn:hover { 
          background: #528ff0;
        }
        
        .pay-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        .spinner {
          display: none;
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top: 2px solid #ffffff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .payment-methods {
          text-align: center;
          margin-top: 24px;
          padding: 16px;
          background: #f9f9f9;
          border-radius: 4px;
          color: #666666;
          font-size: 12px;
        }
        
        .methods-title {
          font-weight: 600;
          margin-bottom: 8px;
          color: #1a1a1a;
        }
        
        .security-info {
          margin-top: 24px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        
        .security-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: #666666;
        }
        
        .security-icon {
          width: 16px;
          height: 16px;
          fill: #666666;
        }
        
        .info-list {
          background: #f9f9f9;
          border-radius: 4px;
          padding: 20px;
        }
        
        .info-list h4 {
          font-size: 16px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 16px;
        }
        
        .info-list ul {
          list-style: none;
        }
        
        .info-list li {
          color: #666666;
          font-size: 14px;
          margin-bottom: 8px;
          padding-left: 16px;
          position: relative;
        }
        
        .info-list li:before {
          content: "•";
          color: #1a1a1a;
          position: absolute;
          left: 0;
        }
        
        .razorpay-badge {
          text-align: center;
          margin-top: 24px;
          padding: 12px;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          font-size: 12px;
          color: #666666;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        
        @media (max-width: 968px) {
          .main-content {
            grid-template-columns: 1fr;
            gap: 32px;
          }
          
          .right-section {
            position: static;
          }
          
          .payment-card {
            padding: 24px 20px;
          }
        }
        
        @media (max-width: 640px) {
          .container {
            padding: 0 16px;
            margin: 24px auto;
          }
          
          .main-content {
            gap: 24px;
          }
          
          .card, .payment-card {
            padding: 20px 16px;
          }
          
          .header-content {
            padding: 0 16px;
          }
          
          .school-name {
            font-size: 24px;
          }
          
          .balance-amount {
            font-size: 32px;
          }
          
          .security-info {
            grid-template-columns: 1fr;
            gap: 12px;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-content">
          <div class="school-name">${process.env.SCHOOL_NAME || "School"}</div>
          <div class="subtitle">Secure Fee Payment Portal</div>
        </div>
      </div>
      
      <div class="container">
        <div class="main-content">
          <div class="left-section">
            <div class="card">
              <h3 class="card-title">
                <svg class="icon" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
                Student Information
              </h3>
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
            
            <div class="balance-card">
              <div class="balance-label">Outstanding Balance</div>
              <div class="balance-amount">₹${amountDue}</div>
            </div>
            
            <div class="card">
              <div class="info-list">
                <h4>Payment Information</h4>
                <ul>
                  <li>You can pay any amount up to the outstanding balance</li>
                  <li>Digital receipt will be sent via WhatsApp immediately</li>
                  <li>All payments are processed securely through Razorpay</li>
                  <li>Contact school office for any payment related queries</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div class="right-section">
            <div class="payment-card">
              <h2 class="payment-title">Make Payment</h2>
              
              <div class="form-group">
                <label class="form-label" for="paymentAmount">Payment Amount</label>
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
                  Minimum: ₹1 • Maximum: ₹${amountDue}
                </div>
              </div>

              <button id="pay-btn" class="pay-btn">
                <span class="spinner"></span>
                <span class="btn-text">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
                  </svg>
                  Pay ₹${amountDue}
                </span>
              </button>

              <div class="payment-methods">
                <div class="methods-title">Accepted Payment Methods</div>
                <div>Credit Card • Debit Card • UPI • Net Banking • Wallets</div>
              </div>
              
              <div class="security-info">
                <div class="security-item">
                  <svg class="security-icon" viewBox="0 0 24 24">
                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6z"/>
                  </svg>
                  256-bit SSL
                </div>
                <div class="security-item">
                  <svg class="security-icon" viewBox="0 0 24 24">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
                  </svg>
                  PCI Compliant
                </div>
                <div class="security-item">
                  <svg class="security-icon" viewBox="0 0 24 24">
                    <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9z"/>
                  </svg>
                  Instant Processing
                </div>
                <div class="security-item">
                  <svg class="security-icon" viewBox="0 0 24 24">
                    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h8c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-4 18c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>
                  </svg>
                  WhatsApp Receipt
                </div>
              </div>
              
              <div class="razorpay-badge">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#528ff0">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2z"/>
                </svg>
                Secured by Razorpay
              </div>
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
              btnText.innerHTML = \`
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
                </svg>
                Pay ₹\${amount}
              \`;
            } else {
              btnText.innerHTML = \`
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
                </svg>
                Pay Now
              \`;
            }
          });

          document.getElementById('pay-btn').addEventListener('click', function(e) {
            e.preventDefault();
            
            const paymentAmount = document.getElementById('paymentAmount').value;
            const maxAmount = ${amountDue};
            
            // Validation
            if (!paymentAmount || paymentAmount <= 0) {
              alert('Please enter a valid payment amount');
              return;
            }
            
            if (parseFloat(paymentAmount) > maxAmount) {
              alert('Payment amount cannot exceed outstanding balance of ₹' + maxAmount);
              return;
            }
            
            // Show loading state
            this.disabled = true;
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
              payButton.disabled = false;
              spinner.style.display = 'none';
              btnText.innerHTML = \`
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
                </svg>
                Pay ₹\${paymentAmount}
              \`;
              
              if (data.error) {
                alert('Error: ' + data.error);
                return;
              }
              
              var options = {
                key: '${process.env.RAZORPAY_KEY_ID}',
                amount: Math.round(parseFloat(paymentAmount) * 100),
                currency: 'INR',
                order_id: data.order_id,
                name: '${process.env.SCHOOL_NAME || "School"}',
                description: 'Fee Payment for ${student.name}',
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
                  color: '#528ff0'
                },
                modal: {
                  ondismiss: function() {
                    console.log('Payment modal closed');
                    // Reset button state
                    payButton.disabled = false;
                    spinner.style.display = 'none';
                    btnText.innerHTML = \`
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
                      </svg>
                      Pay ₹\${paymentAmount}
                    \`;
                  }
                }
              };
              
              var rzp = new Razorpay(options);
              rzp.on('payment.failed', function(response) {
                alert('Payment failed: ' + response.error.description);
                // Reset button state
                payButton.disabled = false;
                spinner.style.display = 'none';
                btnText.innerHTML = \`
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
                  </svg>
                  Pay ₹\${paymentAmount}
                \`;
              });
              rzp.open();
            })
            .catch(error => {
              console.error('Error:', error);
              alert('Unable to process payment. Please try again.');
              // Reset button state
              payButton.disabled = false;
              spinner.style.display = 'none';
              btnText.innerHTML = \`
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
                </svg>
                Pay ₹\${paymentAmount}
              \`;
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
Date: ${new Date().toISOString().split("T")[0]}`;

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
