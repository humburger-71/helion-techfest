/* The server is the only source of payment status, amount and Interest ID. */
(function () {
  "use strict";
  const get = id => document.getElementById(id);
  let loading;
  async function resume() {
    loading ||= fetch('/api/application',{cache:'no-store'}).then(async response => {
      const payload=await response.json();
      if(!response.ok) throw new Error(payload.message||'Unable to load your application. Please try again.');
      render(payload);
    }).finally(()=>{loading=null;});
    return loading;
  }
  function render(payload) {
    const row=payload.application;
    if(!row) return;
    const needsPayment=['payment_pending','rejected'].includes(row.paymentStatus);
    get('interest-form-view').hidden=true;
    get('interest-payment').hidden=!needsPayment;
    get('interest-success').hidden=needsPayment;
    get('interest-dialog').setAttribute('aria-labelledby',needsPayment?'payment-title':'payment-result-title');
    get('payment-error').textContent='';
    const amount=`₹${Number(row.amount).toLocaleString('en-IN',{maximumFractionDigits:2})}`;
    if(needsPayment) {
      get('payment-title').textContent=`Complete your ${amount} waitlist payment`;
      get('payment-instructions').textContent=row.paymentStatus==='rejected'
        ? 'Your previous payment reference was rejected. waitlist is unconfirmed. Check your transfer or contact HELION before paying again. Submit a new, correct reference below.'
        : 'Scan the QR code using any UPI app.';
      get('payment-amount').textContent=`Amount: ${amount}`;
      get('payment-qr').src=row.qr;
      get('payment-upi').textContent=row.upiId;
      get('payment-open').href=row.upiUri;
      get('payment-submit').textContent=`I've Paid ${amount}`;
      get('interest-payment').focus({preventScroll:true});
      get('interest-dialog').querySelector('.interest-shell').scrollTop=0;
    } else {
      const paid=row.paymentStatus==='paid';
      get('payment-status-label').textContent=paid?'Payment verified · waitlist confirmed':'Payment status: Pending verification';
      get('payment-result-title').textContent=paid?'waitlist confirmed':'Payment Submitted';
      get('payment-result-message').textContent=paid
        ? `Your payment has been verified. Keep your HELION Interest ID safe. ${row.emailStatus==='sent'?'Your confirmation email has been sent. Check your inbox and spam folder.':'Your confirmation email is awaiting delivery; your waitlist spot is already confirmed.'} As a waitlist member, you'll receive special perks and early updates before registration opens.`
        : `Your ${amount} waitlist payment has been submitted for verification. Once your payment is verified, your HELION Interest ID will be generated and sent to the email address provided during registration. Keep an eye on your inbox. 📩`;
      get('interest-reference-block').hidden=!paid;
      get('interest-reference').textContent=paid?row.interestId:'';
      get('interest-success').focus({preventScroll:true});
      get('interest-dialog').querySelector('.interest-shell').scrollTop=0;
    }
  }
  window.helionPayment={resume,render};
  document.addEventListener('DOMContentLoaded',()=>{
    // Establish an HttpOnly session before submission, including response-loss retries.
    resume().catch(()=>{});
    get('payment-form').addEventListener('submit',async event=>{
      event.preventDefault();
      const button=get('payment-submit');button.disabled=true;
      get('payment-error').textContent='';
      try {
        const response=await fetch('/api/application/payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transactionId:event.target.elements.transactionId.value})});
        const payload=await response.json();
        if(!response.ok) throw new Error(payload.message||'Unable to submit payment. Please try again.');
        render(payload);
      } catch(error) { get('payment-error').textContent=error.message; }
      finally {button.disabled=false;}
    });
  });
})();
