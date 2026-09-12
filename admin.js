(function(){
  'use strict';
  const get=id=>document.getElementById(id);
  async function api(path,body) {
    const response=await fetch('/api/admin/'+path,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const payload=await response.json();
    if(response.status===401){get('admin-login').hidden=false;get('admin-payments').hidden=true;get('admin-list').replaceChildren();}
    if(!response.ok)throw new Error(payload.message||'Request failed.');
    return payload;
  }
  function line(parent,label,value){const p=document.createElement('p');p.textContent=`${label}: ${value??'—'}`;parent.append(p);}
  async function load(){
    const payload=await api('payments');
    get('admin-login').hidden=true;get('admin-payments').hidden=false;
    get('admin-list').replaceChildren();
    get('admin-message').textContent=`Logged in as ${payload.identity}`;
    if(!payload.payments.length)line(get('admin-list'),'Payments','No applications yet.');
    for(const row of payload.payments){
      const card=document.createElement('article');card.className='admin-payment';
      const title=document.createElement('h3');title.textContent=row.full_name;card.append(title);
      line(card,'Application',row.id);line(card,'Team size',row.team_size);
      line(card,'Members',row.members.map(m=>`${m.name} <${m.email}>`).join(', '));
      line(card,'Amount',`₹${(row.amount_paise/100).toFixed(2)}`);line(card,'UPI reference',row.upi_reference);
      line(card,'Receiving UPI ID',row.upi_id);
      line(card,'Application created',row.submitted_at);line(card,'Payment submitted',row.payment_submitted_at);line(card,'Payment status',row.payment_status);
      if(row.interest_id){line(card,'Interest ID',row.interest_id);line(card,'Verified',`${row.verified_at} by ${row.verified_by}`);line(card,'Confirmation email',row.email_status);line(card,'Sheets mirror',row.sheet_status);}
      if(row.email_error)line(card,'Email issue',row.email_error);
      if(row.sheet_error)line(card,'Sheets issue',row.sheet_error);
      const actions=document.createElement('div');actions.className='admin-actions';card.append(actions);
      function action(label,name){
        const button=document.createElement('button');button.className='button button-quiet';button.textContent=label;
        button.addEventListener('click',async()=>{
          const uncertain=name==='retry-email'&&row.email_status==='sending';
          const prompt=uncertain?'Check SMTP delivery history first. Retrying an interrupted delivery may send a duplicate. Continue?':`${label} for ${row.full_name}, reference ${row.upi_reference}, amount ₹${(row.amount_paise/100).toFixed(2)}?`;
          if(!window.confirm(prompt))return;
          actions.querySelectorAll('button').forEach(b=>b.disabled=true);
          try{await api(`payments/${row.id}/${name}`,{transactionId:row.upi_reference,acknowledgePossibleDuplicate:uncertain});await load();}
          catch(error){get('admin-message').textContent=error.message;actions.querySelectorAll('button').forEach(b=>b.disabled=false);}
        });actions.append(button);
      }
      if(row.payment_status==='pending_verification'){action('Confirm Payment','confirm');action('Reject Payment','reject');}
      if(['failed','pending','sending'].includes(row.email_status))action('Retry confirmation email','retry-email');
      get('admin-list').append(card);
    }
  }
  get('admin-login').addEventListener('submit',async event=>{
    event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;
    try{await api('login',{username:event.target.elements.username.value,password:event.target.elements.password.value});event.target.reset();await load();}
    catch(error){get('admin-message').textContent=error.message;}finally{button.disabled=false;}
  });
  get('admin-refresh').addEventListener('click',()=>load().catch(error=>get('admin-message').textContent=error.message));
  get('admin-logout').addEventListener('click',async()=>{
    try{await api('logout',{});get('admin-login').hidden=false;get('admin-payments').hidden=true;get('admin-list').replaceChildren();get('admin-message').textContent='Logged out.';}
    catch(error){get('admin-message').textContent=error.message;}
  });
  load().catch(()=>{});
})();
