"use strict";

const { randomBytes, createHash, scryptSync, timingSafeEqual } = require("node:crypto");
const QRCode = require("qrcode");
const nodemailer = require("nodemailer");
const hash = value => createHash("sha256").update(value).digest("hex");
const fail = (statusCode, message) => { throw Object.assign(new Error(message), {statusCode}); };
const now = () => new Date().toISOString();

function migrate(db) {
  // Preserve historical IDs without falsely claiming their payments were verified.
  db.exec("BEGIN IMMEDIATE");
  try {
    const columns = new Set(db.prepare("PRAGMA table_info(interest_teams)").all().map(c => c.name));
    const additions = {
      payment_status: "TEXT NOT NULL DEFAULT 'legacy' CHECK(payment_status IN ('legacy','payment_pending','pending_verification','paid','rejected'))",
      amount_paise: "INTEGER", application_token_hash: "TEXT", upi_id: "TEXT", payee_name: "TEXT",
      upi_reference: "TEXT", payment_submitted_at: "TEXT", verified_at: "TEXT", verified_by: "TEXT",
      early_access_confirmed: "INTEGER NOT NULL DEFAULT 0 CHECK(early_access_confirmed IN (0,1))"
    };
    for (const [name,type] of Object.entries(additions)) if (!columns.has(name)) db.exec(`ALTER TABLE interest_teams ADD COLUMN ${name} ${type}`);
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS application_token_idx ON interest_teams(application_token_hash);
      CREATE INDEX IF NOT EXISTS payment_status_idx ON interest_teams(payment_status);
      CREATE TABLE IF NOT EXISTS payment_references (
        reference TEXT PRIMARY KEY, interest_team_id INTEGER NOT NULL REFERENCES interest_teams(id), submitted_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS payment_audit (
        id INTEGER PRIMARY KEY, interest_team_id INTEGER NOT NULL REFERENCES interest_teams(id),
        action TEXT NOT NULL, admin_identity TEXT NOT NULL, reference TEXT, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS admin_sessions (
        token_hash TEXT PRIMARY KEY, identity TEXT NOT NULL, expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS confirmation_email_outbox (
        interest_team_id INTEGER PRIMARY KEY REFERENCES interest_teams(id),
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed')),
        attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL, last_error TEXT,
        started_at TEXT, sent_at TEXT
      );
    `);
    db.exec("COMMIT");
  } catch(error) { db.exec("ROLLBACK"); throw error; }
}

function paymentConfig(env) {
  const amount = String(env.HELION_EARLY_ACCESS_AMOUNT || "19");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) fail(503,"waitlist payment configuration is unavailable.");
  const upiId = String(env.HELION_UPI_ID || "").trim();
  const payeeName = String(env.HELION_UPI_PAYEE_NAME || "HELION").trim();
  if (!/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9.-]{2,64}$/.test(upiId) || !payeeName || payeeName.length > 100) fail(503,"waitlist payments are not available yet. Please try again later.");
  return {amountPaise: Math.round(Number(amount)*100), upiId, payeeName};
}
function paymentUri(row) {
  return `upi://pay?${new URLSearchParams({pa:row.upi_id,pn:row.payee_name,am:(row.amount_paise/100).toFixed(2),cu:"INR"})}`;
}
function passwordHash(password, salt=randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(password,salt,64).toString("hex")}`;
}
function validPassword(password, encoded) {
  if (typeof password !== "string" || password.length > 256 || !/^[0-9a-f]{32}:[0-9a-f]{128}$/.test(encoded || "")) return false;
  const [salt,key] = encoded.split(":");
  return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(key,"hex"));
}
function confirmationMessage(row, email, from) {
  return {
    from, to:email, subject:"Your HELION waitlist spot is confirmed",
    messageId:`<helion-${row.interest_id}@${String(from).split("@").pop().replace(/[^a-zA-Z0-9.-]/g,"")}>`,
    text:`Your ₹${(row.amount_paise/100).toFixed(2)} payment has been verified. Your HELION waitlist spot is confirmed.\n\nOfficial HELION Interest ID: ${row.interest_id}\n\nKeep this ID safe.\n\nAs a waitlist member, you'll receive special perks and early updates before registration opens.\n\nTeam HELION`
  };
}
function createMailer(env) {
  let transport;
  return {
    get configured() { return Boolean(env.EMAIL_HOST && env.EMAIL_FROM && env.EMAIL_USER && env.EMAIL_PASSWORD); },
    async send(row,email) {
    if (!env.EMAIL_HOST || !env.EMAIL_FROM || !env.EMAIL_USER || !env.EMAIL_PASSWORD) throw new Error("Email is not configured");
    transport ||= nodemailer.createTransport({host:env.EMAIL_HOST,port:Number(env.EMAIL_PORT||587),secure:Number(env.EMAIL_PORT||587)===465,
      requireTLS:true, auth:{user:env.EMAIL_USER,pass:env.EMAIL_PASSWORD}, connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000});
    const result = await transport.sendMail(confirmationMessage(row,email,env.EMAIL_FROM));
    if (!result.accepted?.length) throw new Error("Email was not accepted by SMTP server");
  }};
}

function createPaymentApi({store,env,mailer,sendJson,readJsonBody,sync}) {
  const db = store.database;
  const secure = env.NODE_ENV === "production" || env.HELION_COOKIE_SECURE === "true";
  function cookie(req,name) { return String(req.headers.cookie||"").split(";").map(s=>s.trim()).find(s=>s.startsWith(`${name}=`))?.slice(name.length+1)||""; }
  function setCookie(res,name,value,seconds) { res.setHeader("Set-Cookie",`${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secure?"; Secure":""}`); }
  function applicationToken(req,res) {
    let token=cookie(req,"helion_application");
    if (!/^[a-f0-9]{64}$/.test(token)) { token=randomBytes(32).toString("hex"); setCookie(res,"helion_application",token,60*60*24*90); }
    return hash(token);
  }
  function application(req) {
    const token=cookie(req,"helion_application");
    return /^[a-f0-9]{64}$/.test(token) ? db.prepare("SELECT * FROM interest_teams WHERE application_token_hash=?").get(hash(token)) : null;
  }
  function requester(req) {
    // Forwarded addresses are trusted only behind an explicitly configured reverse proxy.
    return env.HELION_TRUST_PROXY === "true" ? String(req.headers["x-forwarded-for"]||req.socket?.remoteAddress||"unknown").split(",")[0].trim() : req.socket?.remoteAddress||"unknown";
  }
  function requireMutation(req) {
    if (!String(req.headers["content-type"]||"").toLowerCase().startsWith("application/json")) fail(415,"Content-Type must be application/json.");
    const origin=req.headers.origin;
    if (origin) {
      let allowed=false;
      try { allowed=env.HELION_PUBLIC_ORIGIN ? new URL(origin).origin===new URL(env.HELION_PUBLIC_ORIGIN).origin : new URL(origin).host===req.headers.host; } catch {}
      if (!allowed) fail(403,"Cross-origin submissions are not accepted.");
    }
    if (req.headers["sec-fetch-site"] === "cross-site") fail(403,"Cross-site submissions are not accepted.");
  }
  function admin(req) {
    db.prepare("DELETE FROM admin_sessions WHERE expires_at<?").run(Date.now());
    const session=db.prepare("SELECT identity FROM admin_sessions WHERE token_hash=? AND expires_at>?").get(hash(cookie(req,"helion_admin")),Date.now());
    if (!session || session.identity!==env.HELION_ADMIN_USERNAME) fail(401,"Please log in as an administrator.");
    return session.identity;
  }
  async function publicState(row) {
    if (!row) return {application:null};
    const result={application:{id:row.id,paymentStatus:row.payment_status,amount:(row.amount_paise/100).toFixed(2),interestId:row.payment_status==="paid"?row.interest_id:null,earlyAccessConfirmed:Boolean(row.early_access_confirmed)}};
    if(row.payment_status==='paid') result.application.emailStatus=db.prepare('SELECT status FROM confirmation_email_outbox WHERE interest_team_id=?').get(row.id)?.status;
    if (["payment_pending","rejected"].includes(row.payment_status)) {
      const uri=paymentUri(row);
      Object.assign(result.application,{upiId:row.upi_id,payeeName:row.payee_name,upiUri:uri,qr:await QRCode.toDataURL(uri,{errorCorrectionLevel:"M",margin:4,width:300})});
    }
    return result;
  }
  async function create(value,req,res) {
    const config=paymentConfig(env), tokenHash=applicationToken(req,res);
    const existing=db.prepare("SELECT * FROM interest_teams WHERE application_token_hash=?").get(tokenHash);
    if (existing) {
      const fingerprint=hash(value.members.map(m=>m.email).sort().join("\n"));
      if (existing.team_fingerprint!==fingerprint) fail(409,"This browser already has an application. Resume its payment step.");
      return publicState(existing);
    }
    const created=store.create(value,{...config,tokenHash});
    return publicState(db.prepare("SELECT * FROM interest_teams WHERE id=?").get(created.numericId));
  }
  function submitReference(row,body) {
    const reference=typeof body?.transactionId === "string" ? body.transactionId.trim().toUpperCase() : "";
    if (!/^[A-Z0-9]{8,35}$/.test(reference)) fail(422,"Enter a valid UPI transaction/reference ID (8–35 letters or digits).");
    db.exec("BEGIN IMMEDIATE");
    try {
      row=db.prepare("SELECT * FROM interest_teams WHERE id=?").get(row.id);
      if (row.payment_status==="pending_verification" && row.upi_reference===reference) { db.exec("COMMIT"); return; }
      if (!["payment_pending","rejected"].includes(row.payment_status)) fail(409,"This application is not awaiting a payment reference.");
      // Keep rejected references reserved too; resubmission must use a new reference.
      if (db.prepare("SELECT 1 FROM payment_references WHERE reference=?").get(reference)) fail(409,"This transaction ID has already been submitted. Check the ID or contact HELION.");
      const date=now();
      db.prepare("INSERT INTO payment_references VALUES(?,?,?)").run(reference,row.id,date);
      db.prepare("UPDATE interest_teams SET upi_reference=?,payment_submitted_at=?,payment_status='pending_verification' WHERE id=?").run(reference,date,row.id);
      db.exec("COMMIT");
    } catch(error) { db.exec("ROLLBACK"); throw error; }
  }
  function verify(id,action,identity,expectedReference) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const row=db.prepare("SELECT * FROM interest_teams WHERE id=?").get(id);
      if (!row) fail(404,"Application not found.");
      if (row.upi_reference!==expectedReference) fail(409,"Payment reference changed. Refresh and check the new payment.");
      if ((action==="confirm"&&row.payment_status==="paid") || (action==="reject"&&row.payment_status==="rejected")) { db.exec("COMMIT"); return false; }
      if (row.payment_status!=="pending_verification") fail(409,"Payment is not pending verification.");
      const date=now();
      if (action==="confirm") {
        const interestId=`HLN-${randomBytes(16).toString("hex").toUpperCase()}`;
        db.prepare("UPDATE interest_teams SET payment_status='paid',interest_id=?,early_access_confirmed=1,verified_at=?,verified_by=? WHERE id=?").run(interestId,date,identity,id);
        db.prepare("INSERT INTO sheet_sync_outbox(interest_team_id,next_attempt_at) VALUES(?,?)").run(id,date);
        db.prepare("INSERT INTO confirmation_email_outbox(interest_team_id,next_attempt_at) VALUES(?,?)").run(id,date);
      } else db.prepare("UPDATE interest_teams SET payment_status='rejected' WHERE id=?").run(id);
      db.prepare("INSERT INTO payment_audit(interest_team_id,action,admin_identity,reference,created_at) VALUES(?,?,?,?,?)").run(id,action,identity,row.upi_reference,date);
      db.exec("COMMIT"); return true;
    } catch(error) { db.exec("ROLLBACK"); throw error; }
  }
  async function sendEmail(id) {
    // SMTP setup is optional. Keep the durable queue untouched until configured.
    if (mailer.configured === false) return;
    const claimed=db.prepare("UPDATE confirmation_email_outbox SET status='sending',attempts=attempts+1,started_at=? WHERE interest_team_id=? AND status IN ('pending','failed')").run(now(),id);
    if (!claimed.changes) return;
    try {
      const row=db.prepare("SELECT * FROM interest_teams WHERE id=? AND payment_status='paid'").get(id);
      const member=db.prepare("SELECT email FROM interest_members WHERE interest_team_id=? ORDER BY member_number LIMIT 1").get(id);
      await mailer.send(row,member.email);
      db.prepare("UPDATE confirmation_email_outbox SET status='sent',sent_at=?,last_error=NULL WHERE interest_team_id=?").run(now(),id);
    } catch(error) {
      // Do not store SMTP responses: they can contain credentials or participant data.
      db.prepare("UPDATE confirmation_email_outbox SET status='failed',last_error='Email delivery failed; check SMTP configuration or retry',next_attempt_at=? WHERE interest_team_id=?")
        .run(new Date(Date.now()+300000).toISOString(),id);
    }
  }
  async function retryEmails() {
    for (const row of db.prepare("SELECT interest_team_id FROM confirmation_email_outbox WHERE status IN ('pending','failed') AND next_attempt_at<=? LIMIT 25").all(now())) await sendEmail(row.interest_team_id);
  }
  async function handle(url,req,res) {
    const path=url.pathname;
    if (env.HELION_PROXY_SECRET) {
      const supplied=String(req.headers['x-helion-proxy-secret']||'');
      if(!timingSafeEqual(Buffer.from(hash(supplied)),Buffer.from(hash(env.HELION_PROXY_SECRET)))) fail(403,'Requests must use the configured HELION frontend.');
    }
    if(req.method==="POST") requireMutation(req);
    if(path==="/api/application" && req.method==="GET") {
      applicationToken(req,res); sendJson(res,200,await publicState(application(req))); return true;
    }
    if(path==="/api/application/payment" && req.method==="POST") {
      const row=application(req); if(!row) fail(401,"Your application session is missing. Please contact HELION if you already applied.");
      store.checkRateLimit(`payment:${requester(req)}:${row.id}`);
      submitReference(row,await readJsonBody(req)); sendJson(res,200,await publicState(application(req))); return true;
    }
    if(path==="/api/admin/login" && req.method==="POST") {
      store.checkRateLimit(`login:${requester(req)}`);
      const body=await readJsonBody(req);
      if(!env.HELION_ADMIN_USERNAME || !validPassword(body?.password,env.HELION_ADMIN_PASSWORD_HASH) || body.username!==env.HELION_ADMIN_USERNAME) fail(401,"Invalid administrator credentials.");
      db.prepare("DELETE FROM admin_sessions WHERE expires_at<? OR token_hash=?").run(Date.now(),hash(cookie(req,"helion_admin")));
      const token=randomBytes(32).toString("hex");
      db.prepare("INSERT INTO admin_sessions VALUES(?,?,?)").run(hash(token),env.HELION_ADMIN_USERNAME,Date.now()+8*3600000);
      setCookie(res,"helion_admin",token,8*3600); sendJson(res,200,{authenticated:true}); return true;
    }
    if(path.startsWith("/api/admin/")) {
      const identity=admin(req);
      if(path==="/api/admin/logout" && req.method==="POST") {
        db.prepare("DELETE FROM admin_sessions WHERE token_hash=?").run(hash(cookie(req,"helion_admin")));
        setCookie(res,"helion_admin","",0); sendJson(res,200,{authenticated:false}); return true;
      }
      if(path==="/api/admin/payments" && req.method==="GET") {
        const rows=db.prepare(`SELECT t.id,t.full_name,t.team_size,t.submitted_at,t.payment_status,t.amount_paise,t.upi_id,t.upi_reference,t.payment_submitted_at,t.verified_at,t.verified_by,t.interest_id,
          e.status email_status,e.last_error email_error,e.started_at email_started_at,s.status sheet_status,s.last_error sheet_error
          FROM interest_teams t LEFT JOIN confirmation_email_outbox e ON e.interest_team_id=t.id LEFT JOIN sheet_sync_outbox s ON s.interest_team_id=t.id
          WHERE t.payment_status!='legacy' ORDER BY CASE WHEN t.payment_status='pending_verification' THEN 0 ELSE 1 END,t.submitted_at DESC LIMIT 200`).all();
        for(const row of rows) row.members=db.prepare("SELECT name,email FROM interest_members WHERE interest_team_id=? ORDER BY member_number").all(row.id);
        sendJson(res,200,{identity,payments:rows}); return true;
      }
      const match=path.match(/^\/api\/admin\/payments\/(\d+)\/(confirm|reject|retry-email)$/);
      if(match && req.method==="POST") {
        const id=Number(match[1]), action=match[2], body=await readJsonBody(req);
        if(action==="retry-email") {
          const email=db.prepare("SELECT * FROM confirmation_email_outbox WHERE interest_team_id=?").get(id);
          if(!email) fail(404,"No confirmation email is queued.");
          if(email.status==="sending") {
            if(Date.now()-Date.parse(email.started_at)<600000 || body.acknowledgePossibleDuplicate!==true) fail(409,"Delivery may be in progress. After 10 minutes, check your SMTP history before retrying.");
            db.prepare("UPDATE confirmation_email_outbox SET status='failed' WHERE interest_team_id=? AND status='sending'").run(id);
          }
          db.prepare("INSERT INTO payment_audit(interest_team_id,action,admin_identity,created_at) VALUES(?,?,?,?)").run(id,"retry-email",identity,now());
          await sendEmail(id);
        } else if(verify(id,action,identity,body?.transactionId) && action==="confirm") {
          await Promise.allSettled([sync(id),sendEmail(id)]);
        }
        sendJson(res,200,{message:"Saved. Refresh the payment list for delivery status."}); return true;
      }
      fail(404,"Not found");
    }
    return false;
  }
  return {handle,create,requester,retryEmails};
}
module.exports={migrate,paymentConfig,paymentUri,passwordHash,validPassword,confirmationMessage,createMailer,createPaymentApi};
