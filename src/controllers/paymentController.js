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
    console.log(`💳 Payment page requested for student: ${studid}`);

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

    console.log(`✅ Razorpay order created: ${order.id} for ₹${amountDue}`);

    // Render payment page with enhanced UI
    const paymentPageHTML = generatePaymentPageHTML({
      student,
      studid,
      amountDue,
      order,
    });

    res.send(paymentPageHTML);
  } catch (error) {
    console.error("❌ Payment page error:", error);
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
    console.log(`🔍 Verifying payment: ${payment_id} for amount: ₹${amount}`);

    // Verify signature
    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    hmac.update(order_id + "|" + payment_id);
    const generated_signature = hmac.digest("hex");

    if (generated_signature === signature) {
      console.log(`✅ Payment verification successful: ${payment_id}`);

      res.send(`
        <html>
          <head>
            <title>Payment Successful</title>
            <style>
              body { font-family: Arial; text-align: center; padding: 50px; background: #f8f9fa; }
              .success-container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
              .success-icon { font-size: 60px; color: #28a745; margin-bottom: 20px; }
              .transaction-id { background: #e9ecef; padding: 10px; border-radius: 5px; font-family: monospace; margin: 20px 0; }
              .amount-paid { background: #d4edda; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 18px; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="success-container">
              <div class="success-icon">✅</div>
              <h2>Payment Successful!</h2>
              <div class="amount-paid">Amount Paid: ₹${amount || "N/A"}</div>
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
    console.error("❌ Payment verification error:", error);
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
    console.log(`📨 Webhook received: ${event.event}`);

    if (event.event === "payment.captured") {
      await processPaymentSuccess(event.payload.payment.entity);
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Webhook error:", error);
    res.status(500).send("Webhook processing failed");
  }
};

// Process successful payment (webhook handler)
async function processPaymentSuccess(payment) {
  try {
    console.log("🎉 Processing successful payment:", payment.id);

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

    console.log("🤖 Sending to AI for processing:", aiCommand);

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
      console.log("✅ Payment processed successfully via AI");
      await sendPaymentConfirmation(studid, amount_paid, payment.id);
    } else {
      console.error("❌ AI processing failed:", result);
      // Log the failure but don't throw to avoid webhook retry
    }
  } catch (error) {
    console.error("❌ Error processing payment:", error);
    // Don't throw error to avoid webhook retry loops
  }
}

// Send payment confirmation to parent
async function sendPaymentConfirmation(studid, amount_paid, transaction_id) {
  try {
    const student = await findStudentById(studid);
    if (student && student.parent_no) {
      const successMessage = `✅ *Payment Received Successfully!*

💰 *Amount:* ₹${amount_paid}
👨‍🎓 *Student:* ${student.name}
🆔 *Student ID:* ${studid}
📚 *Class:* ${student.class}
💳 *Transaction ID:* ${transaction_id}

📄 Invoice has been generated and will be sent shortly.

Thank you for your payment!

*${process.env.SCHOOL_NAME || "School"} Management*`;

      await sendWhatsAppMessage(student.parent_no, successMessage);
      console.log(`✅ Payment confirmation sent to: ${student.parent_no}`);
    } else {
      console.log(`⚠️ No parent contact found for student: ${studid}`);
    }
  } catch (error) {
    console.error("❌ Error sending payment confirmation:", error);
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
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          padding: 20px; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
          min-height: 100vh;
          margin: 0;
        }
        .container { 
          max-width: 500px; 
          margin: 0 auto; 
          background: white; 
          padding: 30px; 
          border-radius: 15px; 
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          margin-top: 50px;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          color: #333;
        }
        .school-logo {
          font-size: 40px;
          margin-bottom: 10px;
        }
        .student-info { 
          background: linear-gradient(135deg, #e8f4fd 0%, #f0f8ff 100%); 
          padding: 20px; 
          border-radius: 10px; 
          margin-bottom: 25px;
          border-left: 4px solid #007cba;
        }
        .student-info h3 {
          margin: 0 0 15px 0;
          color: #007cba;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .amount-highlight {
          background: #fff3cd;
          padding: 15px;
          border-radius: 8px;
          text-align: center;
          margin-bottom: 25px;
          border: 1px solid #ffeaa7;
        }
        .amount-highlight .amount {
          font-size: 24px;
          font-weight: bold;
          color: #d63384;
        }
        .pay-btn { 
          background: linear-gradient(135deg, #007cba 0%, #005a87 100%); 
          color: white; 
          padding: 15px 30px; 
          border: none; 
          border-radius: 8px; 
          cursor: pointer; 
          font-size: 16px; 
          width: 100%;
          font-weight: bold;
          transition: all 0.3s ease;
        }
        .pay-btn:hover { 
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(0,124,186,0.4);
        }
        .payment-methods {
          margin-top: 20px;
          text-align: center;
          color: #6c757d;
          font-size: 14px;
        }
        .secure-badge {
          text-align: center;
          margin-top: 15px;
          font-size: 12px;
          color: #28a745;
        }
        .payment-form {
          margin-top: 30px;
          padding: 20px;
          border-radius: 10px;
          background: #f8f9fa;
          box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }
        .amount-input {
          margin-bottom: 15px;
        }
        .amount-input label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
          color: #333;
        }
        .amount-input input {
          width: 100%;
          padding: 12px;
          border: 2px solid #ced4da;
          border-radius: 8px;
          font-size: 16px;
          box-sizing: border-box;
        }
        .amount-input input:focus {
          border-color: #007cba;
          outline: none;
        }
        .amount-input small {
          display: block;
          margin-top: 8px;
          color: #6c757d;
          font-size: 14px;
        }
        @media (max-width: 600px) {
          .container { margin: 20px; padding: 20px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="school-logo">🏫</div>
          <h2>${process.env.SCHOOL_NAME || "School"}</h2>
          <p style="color: #6c757d;">Secure Fee Payment Portal</p>
        </div>
        
        <div class="student-info">
          <h3>📋 Student Details</h3>
          <div class="info-row">
            <span><strong>Name:</strong></span>
            <span>${student.name}</span>
          </div>
          <div class="info-row">
            <span><strong>Class:</strong></span>
            <span>${student.class}</span>
          </div>
          <div class="info-row">
            <span><strong>Student ID:</strong></span>
            <span>${studid}</span>
          </div>
        </div>
        
        <div class="amount-highlight">
          <div>Outstanding Amount</div>
          <div class="amount">₹${amountDue}</div>
        </div>
        
        <div class="payment-form">
          <div class="amount-input">
            <label for="paymentAmount">Enter Payment Amount (₹)</label>
            <input 
              type="number" 
              id="paymentAmount" 
              name="amount" 
              min="1" 
              max="${amountDue}" 
              placeholder="Enter amount to pay"
              value="${amountDue}"
              required
            />
            <small>Minimum: ₹1, Maximum: ₹${amountDue}</small>
          </div>

          <button id="pay-btn" class="pay-btn">
            💳 Pay Now
          </button>
        </div>

        <div class="payment-methods">
          💳 Card • 📱 UPI • 🏦 Net Banking • 💰 Wallet
        </div>
        
        <div class="secure-badge">
          🔒 Secured by Razorpay • SSL Encrypted
        </div>
        
        <script>
          // Update button text when amount changes
          const paymentAmountInput = document.getElementById('paymentAmount');
          const payButton = document.getElementById('pay-btn');
          
          paymentAmountInput.addEventListener('input', function() {
            const amount = this.value;
            if (amount && amount > 0) {
              payButton.textContent = '💳 Pay ₹' + amount + ' Now';
            } else {
              payButton.textContent = '💳 Pay Now';
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
            
            // Create new order with custom amount
            fetch('/api/payments/create-order', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                amount: paymentAmount,
                studid: '${studid}' // Make sure this is properly passed
              })
            })
            .then(response => response.json())
            .then(data => {
              if (data.error) {
                alert('Error: ' + data.error);
                return;
              }
              
              var options = {
                key: '${process.env.RAZORPAY_KEY_ID}',
                amount: Math.round(parseFloat(paymentAmount) * 100), // Use user input amount
                currency: 'INR',
                order_id: data.order_id,
                name: '${process.env.SCHOOL_NAME || "School"}',
                description: 'Fee Payment for ${student.name}',
                handler: function(response) {
                  // Fix: Ensure all required parameters are passed
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
                  }
                }
              };
              
              var rzp = new Razorpay(options);
              rzp.on('payment.failed', function(response) {
                alert('Payment failed: ' + response.error.description);
              });
              rzp.open();
            })
            .catch(error => {
              console.error('Error:', error);
              alert('Unable to process payment. Please try again.');
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
    console.error("Payment order creation error:", error);
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
    console.error("Payment order creation error:", error);
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
    console.error("Payment verification error:", error);
    res.status(500).json({ error: "Payment verification failed" });
  }
};
