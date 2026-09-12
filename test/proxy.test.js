"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const {createClient}=require('@libsql/client');
const {createTursoStore}=require('../server');
const {createVercelHandler}=require('../vercel-api');
const {passwordHash}=require('../payments');
const person={fullName:'Hosted Student',email:'hosted@example.com',mobile:'9876543210',grade:'10',age:15};
const env={HELION_UPI_ID:'helion-test@upi',HELION_ADMIN_USERNAME:'admin',HELION_ADMIN_PASSWORD_HASH:passwordHash('hosted-test-password'),HELION_PUBLIC_ORIGIN:'https://heliontech.in'};

async function setup(t,options={}) {
  // Keep an independent database alive across handler instances, like Turso.
  // In-memory libSQL avoids native Windows file handles delaying test cleanup.
  const client=createClient({url:'file::memory:',intMode:'number'});
  const stores=[];
  const factory=()=>{const store=createTursoStore({},client);stores.push(store);return store;};
  const emails=[],sheets=[];
  const makeHandler=()=>createVercelHandler({env,storeFactory:factory,mailer:{send:async(row,email)=>emails.push({id:row.interest_id,email})},mirror:{configured:true,append:async row=>sheets.push(row)},...options});
  const handler=makeHandler();
  const request=(path,body,cookie='',headers={})=>handler.fetch(new Request('https://heliontech.in'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:cookie,...headers},body:body===undefined?undefined:JSON.stringify(body)}));
  t.after(()=>client.close());
  const session=async()=>{const r=await request('/api/application');assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
  const login=async()=>{const r=await request('/api/admin/login',{username:'admin',password:'hosted-test-password'});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
  return {request,session,login,stores,emails,sheets,makeHandler};
}

test('Vercel uses Turso adapter directly: schema, payment, isolation, admin confirmation and cold starts',async t=>{
  const {request,session,login,stores,emails,sheets,makeHandler}=await setup(t);
  const cookie=await session();
  const created=await request('/api/interests',{...person,amount:1,status:'paid'},cookie);
  assert.equal(created.status,201);
  const row=(await created.json()).application;
  assert.equal(row.amount,'19.00');assert.equal(row.paymentStatus,'payment_pending');assert.equal(row.interestId,null);
  assert.equal((await request('/api/admin/payments')).status,401);
  assert.equal((await request('/api/application/payment',{applicationId:row.id,transactionId:'HOSTED123456'})).status,401);
  assert.equal((await request('/api/application/payment',{transactionId:'HOSTED123456'},cookie,{Origin:'https://evil.example'})).status,403);
  assert.equal((await request('/api/application/payment',{transactionId:'HOSTED123456'},cookie)).status,200);
  assert.equal((await (await request('/api/application',undefined,cookie)).json()).application.interestId,null);
  const admin=await login();
  const concurrent=await Promise.all([1,2].map(()=>request('/api/admin/payments/'+row.id+'/confirm',{transactionId:'HOSTED123456'},admin)));
  assert.deepEqual(concurrent.map(r=>r.status),[200,200]);
  const paid=(await (await request('/api/application',undefined,cookie)).json()).application;
  assert.equal(paid.paymentStatus,'paid');assert.match(paid.interestId,/^HLN-[0-9A-F]{32}$/);
  assert.equal(emails.length,1);assert.equal(sheets.length,1);assert.equal(emails[0].id,paid.interestId);assert.equal(sheets[0].interest_id,paid.interestId);
  const cold=makeHandler();
  const resumed=await cold.fetch(new Request('https://heliontech.in/api/application',{headers:{Cookie:cookie}}));
  assert.equal((await resumed.json()).application.interestId,paid.interestId);
  assert.equal((await stores[0].sql.prepare('SELECT COUNT(*) n FROM interest_teams').get()).n,1);
  assert.equal((await request('/api/admin/retry-delivery',{},admin)).status,200);assert.equal(emails.length,1);
  assert.equal((await request('/api/application/confirm',{paid:true},cookie)).status,404);
  assert.equal((await request('/api/interests',{data:'x'.repeat(25000)},cookie)).status,413);
  assert.equal((await request('/api/health')).status,200);
});

test('Turso preserves rejection, reserves transaction IDs and supports resubmission',async t=>{
  const {request,session,login}=await setup(t);const cookie=await session(),second=await session(),admin=await login();
  const row=(await (await request('/api/interests',person,cookie)).json()).application;
  await request('/api/interests',{...person,email:'second@example.com'},second);
  await request('/api/application/payment',{transactionId:'SHARED123456'},cookie);
  assert.equal((await request('/api/application/payment',{transactionId:'SHARED123456'},second)).status,409);
  await request('/api/admin/payments/'+row.id+'/reject',{transactionId:'SHARED123456'},admin);
  const rejected=(await (await request('/api/application',undefined,cookie)).json()).application;
  assert.equal(rejected.paymentStatus,'rejected');assert.equal(rejected.interestId,null);
  assert.equal((await request('/api/application/payment',{transactionId:'SHARED123457'},cookie)).status,200);
  assert.equal((await request('/api/admin/payments/'+row.id+'/confirm',{transactionId:'SHARED123456'},admin)).status,409);
});

test('Turso rollback keeps application pending if confirmation outbox write fails',async t=>{
  const {request,session,login,stores,emails,sheets}=await setup(t);const cookie=await session(),admin=await login();
  const row=(await (await request('/api/interests',person,cookie)).json()).application;
  await request('/api/application/payment',{transactionId:'ROLLBACK123456'},cookie);
  await stores[0].sql.exec("CREATE TRIGGER reject_email BEFORE INSERT ON confirmation_email_outbox BEGIN SELECT RAISE(ABORT,'simulated database failure'); END;");
  assert.equal((await request('/api/admin/payments/'+row.id+'/confirm',{transactionId:'ROLLBACK123456'},admin)).status,500);
  const saved=(await (await request('/api/application',undefined,cookie)).json()).application;
  assert.equal(saved.paymentStatus,'pending_verification');assert.equal(saved.interestId,null);assert.equal(emails.length,0);assert.equal(sheets.length,0);
});

test('missing Turso configuration fails closed and retries initialization after a connection failure',async()=>{
  let calls=0;
  const handler=createVercelHandler({env:{},storeFactory:()=>{calls++;throw new Error('private credentials must not leak');}});
  for(let i=0;i<2;i++){
    const response=await handler.fetch(new Request('https://heliontech.in/api/health'));
    assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private credentials/);
  }
  assert.equal(calls,2);
});

test('Vercel reports safe configuration error codes without exposing credentials',async t=>{
  const logs=[];
  t.mock.method(console,'error',(...args)=>logs.push(args));
  for(const [config,expected] of [
    [{},'TURSO_CONFIG_MISSING'],
    [{TURSO_DATABASE_URL:'""',TURSO_AUTH_TOKEN:'private-token'},'TURSO_CONFIG_MISSING'],
    [{TURSO_DATABASE_URL:'not-a-url',TURSO_AUTH_TOKEN:'private-token'},'TURSO_URL_INVALID'],
    [{TURSO_DATABASE_URL:'file:database.sqlite',TURSO_AUTH_TOKEN:'private-token'},'TURSO_URL_INVALID']
  ]) {
    const response=await createVercelHandler({env:config}).fetch(new Request('https://heliontech.in/api/health'));
    assert.equal(response.status,503);
    const body=await response.json();assert.equal(body.code,expected);
    assert.doesNotMatch(JSON.stringify(body),/private-token/);
  }
  assert.doesNotMatch(JSON.stringify(logs),/private-token|not-a-url|file:database/);
});
