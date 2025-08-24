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

      const successMessage = `✅ *Payment Received Successfully!*

💰 *Amount:* ₹${amount_paid}
👨‍🎓 *Student:* ${student.name}
🆔 *Student ID:* ${studid}
📚 *Class:* ${student.class}
💳 *Transaction ID:* ${transaction_id}

📄 Invoice has been generated and will be sent shortly.

Thank you for your payment!

*${process.env.SCHOOL_NAME || "School"} Management*`;

      await sendWhatsAppMessage(phoneNumber, successMessage);
      console.log(`✅ Payment confirmation sent`);
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
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
          min-height: 100vh;
          padding: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .container { 
          max-width: 500px; 
          width: 100%;
          background: white; 
          border-radius: 20px; 
          box-shadow: 0 20px 40px rgba(0,0,0,0.15);
          overflow: hidden;
          animation: slideUp 0.6s ease-out;
        }
        
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .header {
          background: linear-gradient(135deg, #007cba 0%, #005a87 100%);
          color: white;
          padding: 30px;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        
        .header::before {
          content: '';
          position: absolute;
          top: -50%;
          right: -50%;
          width: 100%;
          height: 200%;
          background: rgba(255,255,255,0.1);
          transform: rotate(45deg);
        }
        
        .school-logo {
          font-size: 50px;
          margin-bottom: 10px;
          position: relative;
          z-index: 1;
        }
        
        .school-name {
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 5px;
          position: relative;
          z-index: 1;
        }
        
        .subtitle {
          opacity: 0.9;
          font-size: 14px;
          position: relative;
          z-index: 1;
        }
        
        .content {
          padding: 30px;
        }
        
        .student-info { 
          background: linear-gradient(135deg, #e8f4fd 0%, #f0f8ff 100%); 
          padding: 25px; 
          border-radius: 15px; 
          margin-bottom: 25px;
          border-left: 5px solid #007cba;
          position: relative;
        }
        
        .student-info::before {
          content: '👨‍🎓';
          position: absolute;
          top: 15px;
          right: 20px;
          font-size: 30px;
          opacity: 0.3;
        }
        
        .student-info h3 {
          color: #007cba;
          margin-bottom: 15px;
          font-size: 18px;
        }
        
        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
          padding: 8px 0;
        }
        
        .info-label {
          font-weight: 600;
          color: #495057;
        }
        
        .info-value {
          color: #007cba;
          font-weight: 500;
        }
        
        .balance-highlight {
          background: linear-gradient(135deg, #fff3cd 0%, #fef8e6 100%);
          padding: 20px;
          border-radius: 15px;
          text-align: center;
          margin-bottom: 25px;
          border: 2px solid #ffc107;
          position: relative;
        }
        
        .balance-highlight::before {
          content: '💰';
          position: absolute;
          top: 10px;
          right: 15px;
          font-size: 25px;
        }
        
        .balance-label {
          font-size: 16px;
          color: #856404;
          margin-bottom: 8px;
          font-weight: 600;
        }
        
        .balance-amount {
          font-size: 32px;
          font-weight: bold;
          color: #d63384;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.1);
        }
        
        .payment-form {
          background: #f8f9fa;
          padding: 25px;
          border-radius: 15px;
          margin-bottom: 25px;
          border: 1px solid #e9ecef;
        }
        
        .form-group {
          margin-bottom: 20px;
        }
        
        .form-label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          color: #333;
          font-size: 15px;
        }
        
        .form-input {
          width: 100%;
          padding: 15px;
          border: 2px solid #ced4da;
          border-radius: 10px;
          font-size: 18px;
          transition: all 0.3s ease;
          background: white;
        }
        
        .form-input:focus {
          border-color: #007cba;
          outline: none;
          box-shadow: 0 0 0 3px rgba(0,124,186,0.1);
          transform: translateY(-1px);
        }
        
        .form-hint {
          margin-top: 8px;
          color: #6c757d;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        
        .pay-btn { 
          background: linear-gradient(135deg, #28a745 0%, #20c997 100%); 
          color: white; 
          padding: 18px 30px; 
          border: none; 
          border-radius: 12px; 
          cursor: pointer; 
          font-size: 18px; 
          width: 100%;
          font-weight: bold;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }
        
        .pay-btn:hover { 
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(40,167,69,0.3);
        }
        
        .pay-btn:active {
          transform: translateY(0);
        }
        
        .pay-btn::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          background: rgba(255,255,255,0.2);
          border-radius: 50%;
          transform: translate(-50%, -50%);
          transition: all 0.5s ease;
        }
        
        .pay-btn:hover::before {
          width: 300px;
          height: 300px;
        }
        
        .payment-methods {
          text-align: center;
          margin-top: 20px;
          padding: 15px;
          background: linear-gradient(135deg, #e3f2fd 0%, #f0f8ff 100%);
          border-radius: 10px;
          color: #495057;
          font-size: 14px;
        }
        
        .method-icons {
          font-size: 20px;
          margin-bottom: 8px;
        }
        
        .secure-badge {
          text-align: center;
          margin-top: 15px;
          padding: 10px;
          background: linear-gradient(135deg, #d4edda 0%, #e8f5e8 100%);
          border-radius: 8px;
          color: #155724;
          font-size: 13px;
          font-weight: 500;
        }
        
        .features {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
          margin-top: 20px;
        }
        
        .feature {
          text-align: center;
          padding: 15px;
          background: white;
          border-radius: 10px;
          border: 1px solid #e9ecef;
        }
        
        .feature-icon {
          font-size: 24px;
          margin-bottom: 5px;
        }
        
        .feature-text {
          font-size: 12px;
          color: #6c757d;
        }
        
        @media (max-width: 600px) {
          .container { 
            margin: 10px; 
            border-radius: 15px;
          }
          .content { 
            padding: 20px; 
          }
          .header {
            padding: 20px;
          }
          .school-logo {
            font-size: 40px;
          }
          .school-name {
            font-size: 20px;
          }
          .balance-amount {
            font-size: 28px;
          }
          .features {
            grid-template-columns: 1fr;
          }
        }
        
        .loading {
          opacity: 0.7;
          pointer-events: none;
        }
        
        .spinner {
          display: none;
          width: 20px;
          height: 20px;
          border: 2px solid #ffffff;
          border-top: 2px solid transparent;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-right: 10px;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
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
        
        <div class="content">
          <div class="student-info">
            <h3>📋 Student Information</h3>
            <div class="info-row">
              <span class="info-label">Student Name:</span>
              <span class="info-value">${student.name}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Class:</span>
              <span class="info-value">${student.class}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Student ID:</span>
              <span class="info-value">${studid}</span>
            </div>
          </div>
          
          <div class="balance-highlight">
            <div class="balance-label">Outstanding Balance</div>
            <div class="balance-amount">₹${amountDue}</div>
          </div>
          
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
              <div class="feature-icon">🔒</div>
              <div class="feature-text">256-bit SSL Encrypted</div>
            </div>
            <div class="feature">
              <div class="feature-icon">⚡</div>
              <div class="feature-text">Instant Processing</div>
            </div>
            <div class="feature">
              <div class="feature-icon">📄</div>
              <div class="feature-text">Digital Receipt</div>
            </div>
            <div class="feature">
              <div class="feature-icon">🛡️</div>
              <div class="feature-text">Secure by Razorpay</div>
            </div>
          </div>
          
          <div class="secure-badge">
            🔒 Payments secured by Razorpay • PCI DSS Compliant
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

          // Add input animation
          paymentAmountInput.addEventListener('focus', function() {
            this.parentElement.style.transform = 'scale(1.02)';
          });
          
          paymentAmountInput.addEventListener('blur', function() {
            this.parentElement.style.transform = 'scale(1)';
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
                image: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTIiIGZpbGw9IiMwMDdjYmEiLz4KPHN2ZyB4PSIxNiIgeT0iMTYiIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJ3aGl0ZSI+CjxwYXRoIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0tMiAxNWwtNS01aDNWOWgzdjNsMy0zaDN2M2gzbC01IDV6Ii8+Cjwvc3ZnPgo8L3N2Zz4K',
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
                  color: '#007cba'
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
