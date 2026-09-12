"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
test('Vercel delegates to SQLite backend and never generates IDs',async t=>{
  const proxy=(await import('../api/proxy.mjs')).default;
  const previous=process.env.HELION_BACKEND_ORIGIN,secret=process.env.HELION_PROXY_SECRET;
  t.after(()=>{if(previous===undefined)delete process.env.HELION_BACKEND_ORIGIN;else process.env.HELION_BACKEND_ORIGIN=previous;if(secret===undefined)delete process.env.HELION_PROXY_SECRET;else process.env.HELION_PROXY_SECRET=secret;});
  delete process.env.HELION_BACKEND_ORIGIN;
  assert.equal((await proxy.fetch(new Request('https://frontend.example/api/interests',{method:'POST',body:'{}'}))).status,503);
  process.env.HELION_BACKEND_ORIGIN='https://backend.example';process.env.HELION_PROXY_SECRET='test-proxy-secret';
  let calls=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    calls++;assert.equal(String(url),'https://backend.example/api/interests');assert.equal(options.headers.get('cookie'),'helion_application=test');assert.equal(options.headers.get('x-helion-proxy-secret'),'test-proxy-secret');
    assert.equal(options.body.toString(),'{}');
    return Response.json({application:{paymentStatus:'payment_pending',interestId:null}},{status:201,headers:{'Set-Cookie':'helion_application=new; HttpOnly; SameSite=Strict','Cache-Control':'no-store'}});
  });
  const response=await proxy.fetch(new Request('https://frontend.example/api/interests',{method:'POST',body:'{}',headers:{Cookie:'helion_application=test','Content-Type':'application/json'}}));
  assert.equal(response.status,201);assert.equal((await response.json()).application.interestId,null);assert.match(response.headers.get('set-cookie'),/HttpOnly/);assert.equal(calls,1);
  assert.equal((await proxy.fetch(new Request('https://frontend.example/api/interests',{method:'POST',body:'x'.repeat(25000)}))).status,413);
  assert.equal((await proxy.fetch(new Request('https://frontend.example/api/unknown'))).status,404);assert.equal(calls,1);
});
