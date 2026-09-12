"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync,readFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {createHelionServer,InterestStore,retryPendingSheetSyncs}=require('../server');
const {passwordHash,paymentConfig,paymentUri,confirmationMessage}=require('../payments');
const env={HELION_UPI_ID:'configured-payee@upi',HELION_UPI_PAYEE_NAME:'HELION Test',HELION_EARLY_ACCESS_AMOUNT:'19',HELION_ADMIN_USERNAME:'reviewer',HELION_ADMIN_PASSWORD_HASH:passwordHash('correct-password-123')};
const person={fullName:'Test Student',email:'test@example.com',mobile:'9876543210',grade:'10',age:15};
async function setup(t,options={}) {
  const dir=mkdtempSync(join(tmpdir(),'helion-payment-'));
  const emails=[],sheets=[];
  const app=createHelionServer({databasePath:join(dir,'test.sqlite'),env,mailer:{send:async(row,email)=>emails.push(confirmationMessage(row,email,'hello@example.com'))},mirror:{configured:true,append:async row=>sheets.push(row)},...options});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));app.store.close();rmSync(dir,{recursive:true,force:true});});
  const request=(path,body,cookie='',extra={})=>fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:cookie,...extra},body:body===undefined?undefined:JSON.stringify(body)});
  const session=async()=> (await request('/api/application')).headers.get('set-cookie').split(';')[0];
  const login=async()=>{const r=await request('/api/admin/login',{username:'reviewer',password:'correct-password-123'});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
  return {app,request,session,login,emails,sheets,dir};
}

test('payment lifecycle, refresh, isolation, fake success, admin auth and concurrent confirmation',async t=>{
  const {app,request,session,login,emails,sheets}=await setup(t);
  const cookie=await session();
  assert.match(cookie,/helion_application=/);
  const created=await request('/api/interests',{...person,amount:1,paymentStatus:'paid',interestId:'FORGED'},cookie);
  assert.equal(created.status,201);
  const row=(await created.json()).application;
  assert.equal(row.paymentStatus,'payment_pending');assert.equal(row.interestId,null);assert.equal(row.amount,'19.00');assert.equal(row.earlyAccessConfirmed,false);
  assert.match(row.qr,/^data:image\/png;base64,/);
  const png=require('pngjs').PNG.sync.read(Buffer.from(row.qr.split(',')[1],'base64'));
  const decoded=require('jsqr')(new Uint8ClampedArray(png.data),png.width,png.height);
  assert.equal(decoded.data,row.upiUri);
  const uri=new URL(row.upiUri);
  assert.equal(uri.searchParams.get('pa'),env.HELION_UPI_ID);assert.equal(uri.searchParams.get('pn'),env.HELION_UPI_PAYEE_NAME);assert.equal(uri.searchParams.get('am'),'19.00');assert.equal(uri.searchParams.get('cu'),'INR');
  assert.equal(app.store.database.prepare('SELECT interest_id FROM interest_teams').get().interest_id,null);
  assert.equal(emails.length,0);assert.equal(sheets.length,0);
  assert.equal((await (await request('/api/interests',person,cookie)).json()).application.id,row.id);
  assert.equal(app.store.database.prepare('SELECT count(*) n FROM interest_teams').get().n,1);
  assert.equal((await (await request('/api/application',undefined,cookie)).json()).application.paymentStatus,'payment_pending');
  assert.equal((await (await request('/api/application')).json()).application,null);
  assert.equal((await request('/api/application/payment',{applicationId:row.id,transactionId:'123456789012'})).status,401);
  assert.equal((await request('/api/application/payment',{transactionId:'<script>alert(1)</script>'},cookie)).status,422);
  assert.equal((await request('/api/application/payment',{transactionId:'123456789012',status:'paid'},cookie)).status,200);
  assert.equal((await request('/api/application/payment',{transactionId:'123456789012'},cookie)).status,200);
  assert.equal((await (await request('/api/application',undefined,cookie)).json()).application.paymentStatus,'pending_verification');
  assert.equal(emails.length,0);assert.equal(sheets.length,0);
  assert.equal((await request('/api/application/confirm',{paymentStatus:'paid'},cookie)).status,404);
  assert.equal((await request(`/api/admin/payments/${row.id}/confirm`,{transactionId:'123456789012'},cookie)).status,401);
  assert.equal((await request('/api/admin/payments')).status,401);
  assert.equal((await request('/api/admin/login',{username:'reviewer',password:'bad'})).status,401);
  const admin=await login();
  const listed=(await (await request('/api/admin/payments',undefined,admin)).json()).payments[0];
  assert.equal(listed.members[0].email,person.email);assert.equal(listed.team_size,1);assert.equal(listed.payment_status,'pending_verification');
  assert.equal((await request(`/api/admin/payments/${row.id}/confirm`,{transactionId:'123456789012'},admin,{Origin:'https://evil.example'})).status,403);
  const confirmations=await Promise.all([1,2].map(()=>request(`/api/admin/payments/${row.id}/confirm`,{transactionId:'123456789012'},admin)));
  assert.deepEqual(confirmations.map(r=>r.status),[200,200]);
  const paid=(await (await request('/api/application',undefined,cookie)).json()).application;
  assert.equal(paid.paymentStatus,'paid');assert.equal(paid.earlyAccessConfirmed,true);assert.match(paid.interestId,/^HLN-[0-9A-F]{32}$/);
  assert.equal(emails.length,1);assert.equal(sheets.length,1);assert.match(emails[0].text,new RegExp(paid.interestId));assert.match(emails[0].text,/special perks and early updates/);assert.doesNotMatch(emails[0].text,/150|850|discount/i);
  assert.equal(sheets[0].interest_id,paid.interestId);
  const verified=app.store.database.prepare('SELECT verified_by,verified_at FROM interest_teams').get();assert.equal(verified.verified_by,'reviewer');assert.ok(verified.verified_at);
  await request(`/api/admin/payments/${row.id}/retry-email`,{},admin);assert.equal(emails.length,1);
  assert.equal((await request(`/api/admin/payments/${row.id}/reject`,{transactionId:'123456789012'},admin)).status,409);
  await request('/api/admin/logout',{},admin);assert.equal((await request('/api/admin/payments',undefined,admin)).status,401);
  for(const path of ['/','/payment.js','/admin','/admin.js'])assert.equal((await request(path)).status,200);
});

test('rejection, duplicate references, stale admin actions and retry without duplicate applications',async t=>{
  const {app,request,session,login,emails}=await setup(t);const first=await session(),second=await session(),admin=await login();
  const a=(await (await request('/api/interests',person,first)).json()).application;
  const b=(await (await request('/api/interests',{...person,email:'second@example.com'},second)).json()).application;
  await request('/api/application/payment',{transactionId:'ABC123456789'},first);
  assert.equal((await request('/api/application/payment',{transactionId:'abc123456789'},second)).status,409);
  assert.equal((await request(`/api/admin/payments/${a.id}/reject`,{transactionId:'ABC123456789'},admin)).status,200);
  let state=(await (await request('/api/application',undefined,first)).json()).application;
  assert.equal(state.paymentStatus,'rejected');assert.equal(state.interestId,null);assert.equal(emails.length,0);
  assert.equal((await request('/api/application/payment',{transactionId:'ABC123456789'},second)).status,409);
  assert.equal((await request('/api/application/payment',{transactionId:'ABC123456790'},first)).status,200);
  assert.equal((await request(`/api/admin/payments/${a.id}/confirm`,{transactionId:'ABC123456789'},admin)).status,409);
  assert.equal((await request(`/api/admin/payments/${a.id}/confirm`,{transactionId:'ABC123456790'},admin)).status,200);
  assert.equal((await request('/api/application/payment',{applicationId:a.id,transactionId:'ABC123456791'},second)).status,200);
  assert.equal(app.store.database.prepare('SELECT upi_reference FROM interest_teams WHERE id=?').get(b.id).upi_reference,'ABC123456791');
  assert.equal(app.store.database.prepare('SELECT count(*) n FROM interest_teams').get().n,2);
});

test('email and Sheets failure preserve paid record and retry independently',async t=>{
  let failEmail=true,failSheet=true,emailCount=0,sheetCount=0;
  const mailer={send:async()=>{if(failEmail)throw new Error('SMTP outage');emailCount++;}};
  const mirror={configured:true,append:async()=>{if(failSheet)throw new Error('Sheets outage');sheetCount++;}};
  const {app,request,session,login}=await setup(t,{mailer,mirror});const cookie=await session(),admin=await login();
  const row=(await (await request('/api/interests',person,cookie)).json()).application;
  await request('/api/application/payment',{transactionId:'123456789012'},cookie);
  await request(`/api/admin/payments/${row.id}/confirm`,{transactionId:'123456789012'},admin);
  const db=app.store.database;
  const paid=db.prepare('SELECT * FROM interest_teams').get();assert.equal(paid.payment_status,'paid');assert.ok(paid.interest_id);
  assert.equal(db.prepare('SELECT status FROM confirmation_email_outbox').get().status,'failed');assert.equal(db.prepare('SELECT status FROM sheet_sync_outbox').get().status,'PENDING');
  failEmail=false;failSheet=false;
  db.prepare("UPDATE confirmation_email_outbox SET next_attempt_at='2000-01-01'").run();db.prepare("UPDATE sheet_sync_outbox SET next_attempt_at='2000-01-01'").run();
  await app.retryEmails();await retryPendingSheetSyncs(app.store,mirror);
  await app.retryEmails();await retryPendingSheetSyncs(app.store,mirror);
  assert.equal(emailCount,1);assert.equal(sheetCount,1);assert.equal(db.prepare('SELECT interest_id FROM interest_teams').get().interest_id,paid.interest_id);
});

test('configuration validates amount, preserves old IDs and generates no phantom payment',async t=>{
  assert.equal(paymentConfig({...env,HELION_EARLY_ACCESS_AMOUNT:undefined}).amountPaise,1900);
  assert.throws(()=>paymentConfig({...env,HELION_UPI_ID:''}));assert.throws(()=>paymentConfig({...env,HELION_EARLY_ACCESS_AMOUNT:'0'}));assert.throws(()=>paymentConfig({...env,HELION_EARLY_ACCESS_AMOUNT:'20.001'}));
  const dir=mkdtempSync(join(tmpdir(),'helion-migration-')),path=join(dir,'old.sqlite');
  const db=new DatabaseSync(path);
  db.exec("CREATE TABLE interest_teams(id INTEGER PRIMARY KEY,interest_id TEXT UNIQUE,full_name TEXT NOT NULL,team_size INTEGER NOT NULL,submitted_at TEXT NOT NULL,team_fingerprint TEXT UNIQUE); INSERT INTO interest_teams VALUES(1,'HLN-OLD','Old Student',1,'2020-01-01','old');");db.close();
  const store=new InterestStore(path);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  const legacy=store.database.prepare('SELECT * FROM interest_teams').get();assert.equal(legacy.interest_id,'HLN-OLD');assert.equal(legacy.payment_status,'legacy');assert.equal(legacy.early_access_confirmed,0);
  assert.equal(store.database.prepare('SELECT count(*) n FROM confirmation_email_outbox').get().n,0);
  assert.match(paymentUri({upi_id:'test@upi',payee_name:'HELION & team',amount_paise:1900}),/am=19.00/);
});

test('missing payment config saves nothing and authentication cookies are protected',async t=>{
  const {app,request}=await setup(t,{env:{...env,HELION_UPI_ID:'',NODE_ENV:'production'}});
  const response=await request('/api/interests',person);assert.equal(response.status,503);assert.equal(app.store.database.prepare('SELECT count(*) n FROM interest_teams').get().n,0);
  const cookie=(await request('/api/application')).headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/Secure/);
  const html=await (await request('/')).text();assert.match(html,/id="payment-qr"/);assert.match(html,/id="payment-form"/);
});
