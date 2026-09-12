"use strict";
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync,mkdirSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {createHelionServer}=require('../server');
const {passwordHash}=require('../payments');
(async()=>{
  const dir=mkdtempSync(join(tmpdir(),'helion-browser-'));
  const artifacts=join(__dirname,'..','artifacts');mkdirSync(artifacts,{recursive:true});
  const emails=[];
  const app=createHelionServer({databasePath:join(dir,'test.sqlite'),env:{HELION_UPI_ID:'browser-test@upi',HELION_ADMIN_USERNAME:'reviewer',HELION_ADMIN_PASSWORD_HASH:passwordHash('browser-test-password')},mirror:{configured:false},mailer:{send:async row=>emails.push(row.interest_id)}});
  let browser;
  try {
    await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${app.server.address().port}`;
    browser=await chromium.launch({headless:true,...(process.env.HELION_BROWSER_CHANNEL?{channel:process.env.HELION_BROWSER_CHANNEL}:process.platform==='win32'?{channel:'msedge'}:{})});
    const errors=[];
    for(const [label,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]) {
      const context=await browser.newContext({viewport,reducedMotion:'reduce'});
      const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
      await page.goto(base,{waitUntil:'domcontentloaded'});
      await page.locator('[data-interest-open]').first().click();
      await page.locator('#interest-submit').click();
      await page.locator('[data-error-for="fullName"]').filter({hasText:'Enter your full name.'}).waitFor();
      await page.locator('[name="fullName"]').fill(`${label} Student`);
      await page.locator('[name="email"]').fill(`${label}@example.com`);
      await page.locator('[name="mobile"]').fill('9876543210');
      await page.locator('[name="grade"]').selectOption('10');
      await page.locator('[name="age"]').fill('15');
      await page.locator('#interest-submit').click();
      await page.locator('#payment-title').filter({hasText:'₹19'}).waitFor();
      assert.equal(await page.locator('#payment-upi').textContent(),'browser-test@upi');
      assert.equal(await page.locator('#interest-reference').textContent(),'');
      assert.ok(await page.locator('#payment-qr').evaluate(img=>img.complete&&img.naturalWidth===300));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:join(artifacts,`${label}-payment.png`)});
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('[data-interest-open]').first().click();
      await page.locator('#payment-form').waitFor({state:'visible'});
      await page.locator('[name="transactionId"]').fill(label==='desktop'?'123456789012':'123456789013');
      await page.locator('#payment-submit').click();
      await page.locator('#payment-status-label').filter({hasText:'Pending verification'}).waitFor();
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('[data-interest-open]').first().click();
      await page.locator('#payment-status-label').filter({hasText:'Pending verification'}).waitFor();
      await page.screenshot({path:join(artifacts,`${label}-pending.png`)});
      if(label==='desktop') {
        const adminContext=await browser.newContext({viewport:{width:1280,height:900}});
        const admin=await adminContext.newPage();admin.on('dialog',dialog=>dialog.accept());
        await admin.goto(base+'/admin');await admin.locator('[name="username"]').fill('reviewer');await admin.locator('[name="password"]').fill('browser-test-password');
        await admin.getByRole('button',{name:'Log in',exact:true}).click();
        await admin.getByRole('button',{name:'Confirm Payment',exact:true}).waitFor();
        await admin.screenshot({path:join(artifacts,'admin-payments.png')});
        await admin.getByRole('button',{name:'Confirm Payment',exact:true}).click();
        await admin.getByText('Payment status: paid',{exact:true}).waitFor();
        await page.reload({waitUntil:'domcontentloaded'});
        await page.locator('[data-interest-open]').first().click();
        await page.locator('#payment-result-title').filter({hasText:'waitlist confirmed'}).waitFor();
        assert.match(await page.locator('#interest-reference').textContent(),/^HLN-[0-9A-F]{32}$/);
        assert.equal(emails.length,1);
        await page.screenshot({path:join(artifacts,'desktop-confirmed.png')});
        await adminContext.close();
      }
      await context.close();
    }
    assert.deepEqual(errors,[]);
    console.log('Desktop/mobile payment, refresh recovery, admin confirmation and email dispatch browser checks passed. Screenshots: artifacts/.');
  } finally {
    await browser?.close();
    await new Promise(resolve=>app.server.close(resolve));app.store.close();rmSync(dir,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
