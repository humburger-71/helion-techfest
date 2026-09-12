"use strict";

const http = require("node:http");
const sheetDetails = require("./sheet-details.cjs");
const { createHash, createSign } = require("node:crypto");
const { readFileSync, mkdirSync, existsSync } = require("node:fs");
const { dirname, extname, join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const payments = require("./payments");

const ROOT_DIR = __dirname;
const ENV_PATH = join(ROOT_DIR, ".env");
if (existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);
const BODY_LIMIT_BYTES = 24 * 1024;
const MAX_TEAM_SIZE = 5;
const DEFAULT_DATABASE_PATH = join(ROOT_DIR, "data", "helion.sqlite");
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 5;
const STATIC_FILES = new Map([
  ["/", "index.html"], ["/index.html", "index.html"], ["/styles.css", "styles.css"],
  ["/script.js", "script.js"], ["/smoothscroll.js", "smoothscroll.js"],
  ["/admin", "admin.html"], ["/admin.js", "admin.js"], ["/payment.js", "payment.js"],
  ["/brand/helion-icon.png", "brand/helion-icon.png"],
  ["/brand/helion-wordmark.png", "brand/helion-wordmark.png"]
]);
const MIME_TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png" };

class DuplicateInterestError extends Error {
  constructor() { super("This email is already on the HELION list."); this.name = "DuplicateInterestError"; }
}
class RateLimitError extends Error {
  constructor(retryAfter) { super("Too many submissions. Please try again later."); this.name = "RateLimitError"; this.retryAfter = retryAfter; }
}

function cleanText(value) {
  return typeof value === "string"
    ? value.normalize("NFKC").replace(/[\u0000-\u001F\u007F]/g, "").trim().replace(/\s+/g, " ")
    : "";
}
function normaliseEmail(value) { return typeof value === "string" ? value.normalize("NFKC").trim().toLowerCase() : ""; }
function validEmail(value) { return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(value); }

function validateInterest(input) {
  const errors = {};
  const fullName = cleanText(input?.fullName);
  const email = normaliseEmail(input?.email);
  if (fullName.length < 2) errors.fullName = "Enter your full name.";
  else if (fullName.length > 80) errors.fullName = "Full name must be 80 characters or fewer.";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(email)) errors.email = "Enter a valid email address.";
  const mobile = cleanText(input?.mobile).replace(/[\s()-]/g, "");
  const grade = cleanText(input?.grade);
  const age = input?.age;
  if (!/^\+?[0-9]{10,15}$/.test(mobile)) errors.mobile = "Enter a valid mobile number (10-15 digits).";
  if (!/^(?:9|1[0-2]|University)$/.test(grade)) errors.grade = "Select your grade for academic year 2027-28.";
  if (!Number.isInteger(age) || age < 1 || age > 120) errors.age = "Enter your current age in whole years.";
  return { errors, value: { fullName, mobile, grade, age, teamSize: 1, members: [{ name: fullName, email }] } };
}

class InterestStore {
  constructor(databasePath = DEFAULT_DATABASE_PATH) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS interest_teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT, interest_id TEXT UNIQUE, full_name TEXT NOT NULL,
        team_size INTEGER NOT NULL CHECK(team_size BETWEEN 1 AND ${MAX_TEAM_SIZE}),
        submitted_at TEXT NOT NULL, team_fingerprint TEXT NOT NULL UNIQUE
      );
      CREATE TABLE IF NOT EXISTS interest_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        interest_team_id INTEGER NOT NULL REFERENCES interest_teams(id) ON DELETE CASCADE,
        member_number INTEGER NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, email_normalized TEXT NOT NULL,
        UNIQUE(interest_team_id, member_number), UNIQUE(interest_team_id, email_normalized)
      );
      CREATE TABLE IF NOT EXISTS sheet_sync_outbox (
        interest_team_id INTEGER PRIMARY KEY REFERENCES interest_teams(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SYNCED')),
        attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL, last_error TEXT, synced_at TEXT
      );
      CREATE TABLE IF NOT EXISTS interest_rate_limits (requester_hash TEXT NOT NULL, attempted_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS interest_members_email_idx ON interest_members(email_normalized);
      CREATE INDEX IF NOT EXISTS interest_teams_submitted_idx ON interest_teams(submitted_at);
      CREATE INDEX IF NOT EXISTS sheet_sync_retry_idx ON sheet_sync_outbox(status,next_attempt_at);
      CREATE INDEX IF NOT EXISTS interest_rate_limit_idx ON interest_rate_limits(requester_hash,attempted_at);
    `);
    const columns = new Set(this.database.prepare("PRAGMA table_info(interest_teams)").all().map(column => column.name));
    for (const [name, type] of [["mobile", "TEXT"], ["grade", "TEXT"], ["age", "INTEGER"]]) {
      if (!columns.has(name)) this.database.exec(`ALTER TABLE interest_teams ADD COLUMN ${name} ${type}`);
    }
    payments.migrate(this.database);
    this.createTransaction = (value, payment) => {
      this.database.exec("BEGIN IMMEDIATE");
      try {
      const submittedAt = new Date().toISOString();
      const fingerprint = createHash("sha256").update(value.members.map((m) => m.email).sort().join("\n")).digest("hex");
      let result;
      try {
        result = this.database.prepare("INSERT INTO interest_teams(full_name,team_size,submitted_at,team_fingerprint,mobile,grade,age) VALUES(?,?,?,?,?,?,?)")
          .run(value.fullName, value.teamSize, submittedAt, fingerprint, value.mobile, value.grade, value.age);
      } catch (error) {
        if (String(error.message).includes("team_fingerprint")) throw new DuplicateInterestError();
        throw error;
      }
      const numericId = Number(result.lastInsertRowid);
      const interestId = null;
      if (!payment) throw new Error("Payment configuration and application session are required");
      this.database.prepare("UPDATE interest_teams SET payment_status='payment_pending',amount_paise=?,application_token_hash=?,upi_id=?,payee_name=? WHERE id=?")
        .run(payment.amountPaise, payment.tokenHash, payment.upiId, payment.payeeName, numericId);
      const insert = this.database.prepare("INSERT INTO interest_members(interest_team_id,member_number,name,email,email_normalized) VALUES(?,?,?,?,?)");
      value.members.forEach((member, index) => insert.run(numericId, index + 1, member.name, member.email, member.email));
      const created = { numericId, interestId, submittedAt, ...value };
      this.database.exec("COMMIT");
      return created;
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    };
  }
  create(value, payment) { return this.createTransaction(value, payment); }
  checkRateLimit(requester) {
    const now = Date.now(), cutoff = now - RATE_WINDOW_MS;
    const hash = createHash("sha256").update(`${process.env.RATE_LIMIT_SALT || "helion"}:${requester}`).digest("hex");
    this.database.prepare("DELETE FROM interest_rate_limits WHERE attempted_at<?").run(cutoff);
    const count = this.database.prepare("SELECT COUNT(*) count FROM interest_rate_limits WHERE requester_hash=? AND attempted_at>=?").get(hash, cutoff).count;
    if (count >= RATE_MAX) {
      const first = this.database.prepare("SELECT MIN(attempted_at) attempted_at FROM interest_rate_limits WHERE requester_hash=? AND attempted_at>=?").get(hash, cutoff).attempted_at;
      throw new RateLimitError(Math.max(1, Math.ceil((first + RATE_WINDOW_MS - now) / 1000)));
    }
    this.database.prepare("INSERT INTO interest_rate_limits VALUES(?,?)").run(hash, now);
  }
  getForSheet(id) {
    const team = this.database.prepare("SELECT id,interest_id,submitted_at,team_size,mobile,grade,age FROM interest_teams WHERE id=?").get(id);
    if (!team) return null;
    team.members = this.database.prepare("SELECT name,email FROM interest_members WHERE interest_team_id=? ORDER BY member_number").all(id);
    return team;
  }
  pendingSyncs(limit = 25) { return this.database.prepare("SELECT interest_team_id FROM sheet_sync_outbox WHERE status='PENDING' AND next_attempt_at<=? ORDER BY next_attempt_at LIMIT ?").all(new Date().toISOString(), limit); }
  markSynced(id) { this.database.prepare("UPDATE sheet_sync_outbox SET status='SYNCED',attempts=attempts+1,synced_at=?,last_error=NULL WHERE interest_team_id=?").run(new Date().toISOString(), id); }
  markSyncFailed(id, error) {
    const attempts = this.database.prepare("SELECT attempts FROM sheet_sync_outbox WHERE interest_team_id=?").get(id)?.attempts || 0;
    const delay = Math.min(86_400_000, 60_000 * 2 ** Math.min(attempts, 8));
    this.database.prepare("UPDATE sheet_sync_outbox SET attempts=attempts+1,next_attempt_at=?,last_error=? WHERE interest_team_id=?")
      .run(new Date(Date.now() + delay).toISOString(), String(error?.message || error).slice(0, 500), id);
  }
  close() { this.database.close(); }
}

function base64url(value) { return Buffer.from(value).toString("base64url"); }
class GoogleSheetsMirror {
  constructor(env = process.env) {
    this.spreadsheetId = String(env.GOOGLE_SHEETS_SPREADSHEET_ID || "").trim();
    this.sheetName = String(env.GOOGLE_SHEETS_SHEET_NAME || "Interests").trim() || "Interests";
    this.email = String(env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
    this.privateKey = String(env.GOOGLE_PRIVATE_KEY || "").trim().replace(/\\n/g, "\n");
    this.accessToken = null; this.expiresAt = 0;
  }
  get configured() { return Boolean(this.spreadsheetId && this.email && this.privateKey); }
  async token() {
    if (this.accessToken && Date.now() < this.expiresAt - 60_000) return this.accessToken;
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64url(JSON.stringify({ iss: this.email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
    const signer = createSign("RSA-SHA256"); signer.update(`${header}.${claims}`); signer.end();
    const assertion = `${header}.${claims}.${signer.sign(this.privateKey, "base64url")}`;
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`Google authorization failed (${response.status})${details ? `: ${details.slice(0, 300)}` : ""}`);
    }
    const payload = await response.json(); this.accessToken = payload.access_token; this.expiresAt = Date.now() + payload.expires_in * 1000; return this.accessToken;
  }
  async append(team) {
    if (!this.configured) return false;
    const row = sheetDetails(team);
    const range = `'${this.sheetName.replaceAll("'", "''")}'!A:G`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${await this.token()}`, "Content-Type": "application/json" }, body: JSON.stringify({ values: [row] }) });
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`Google Sheets append failed (${response.status})${details ? `: ${details.slice(0, 300)}` : ""}`);
    }
    return true;
  }
}

async function syncOne(store, mirror, id) {
  if (!mirror.configured) return false;
  if (!store.getForSheet(id)?.interest_id) return false;
  try { await mirror.append(store.getForSheet(id)); store.markSynced(id); return true; }
  catch (error) { store.markSyncFailed(id, error); console.error("Google Sheets synchronization failed:", error.message); return false; }
}
async function retryPendingSheetSyncs(store, mirror, limit = 25) {
  let synced = 0;
  for (const row of store.pendingSyncs(limit)) if (await syncOne(store, mirror, row.interest_team_id)) synced += 1;
  return synced;
}

function securityHeaders() { return { "Content-Security-Policy": "default-src 'self'; script-src 'self' https://cdn.tailwindcss.com https://unpkg.com; style-src 'self' 'unsafe-inline' https://api.fontshare.com https://fonts.googleapis.com; font-src 'self' https://cdn.fontshare.com https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Permissions-Policy": "camera=(), microphone=(), geolocation=()" }; }
function sendJson(response, status, payload, extra = {}) { const body = JSON.stringify(payload); response.writeHead(status, { ...securityHeaders(), "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store", ...extra }); response.end(body); }
function readJsonBody(request) { return new Promise((resolve, reject) => { const chunks=[]; let bytes=0, settled=false; request.on("data", chunk => { if(settled)return; bytes+=chunk.length; if(bytes>BODY_LIMIT_BYTES){settled=true;reject(Object.assign(new Error("Request body is too large"),{statusCode:413}));return;} chunks.push(chunk); }); request.on("end",()=>{if(settled)return;try{resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}"));}catch{reject(Object.assign(new Error("Request body must be valid JSON"),{statusCode:400}));}}); request.on("error",reject); }); }
function isSameOrigin(request) { const origin=request.headers.origin; if(!origin)return true; try{return new URL(origin).host===request.headers.host;}catch{return false;} }
function serveStatic(pathname, request, response) { const relative=STATIC_FILES.get(pathname); if(!relative)return false; try{const body=readFileSync(join(ROOT_DIR,relative));response.writeHead(200,{...securityHeaders(),"Content-Type":MIME_TYPES[extname(relative)]||"application/octet-stream","Content-Length":body.length,"Cache-Control":extname(relative)===".html"?"no-cache":"public, max-age=3600"});response.end(request.method==="HEAD"?undefined:body);}catch{sendJson(response,404,{message:"Not found"});}return true; }

function createHelionServer({ databasePath=DEFAULT_DATABASE_PATH, mirror=new GoogleSheetsMirror(), env=process.env, mailer=payments.createMailer(env) }={}) {
  const store = new InterestStore(databasePath);
  const paymentApi = payments.createPaymentApi({store, env, mailer, sendJson, readJsonBody, sync: id => syncOne(store,mirror,id)});
  const handler = async (request, response) => {
    let url; try{url=new URL(request.url,`http://${request.headers.host||"localhost"}`);}catch{sendJson(response,400,{message:"Invalid request URL"});return;}
    if((request.method==="GET"||request.method==="HEAD")&&serveStatic(url.pathname,request,response))return;
    if(request.method==="GET"&&url.pathname==="/api/health"){sendJson(response,200,{status:"ok",application:"HELION"});return;}
    if (url.pathname.startsWith('/api/')) {
      try { if (await paymentApi.handle(url,request,response)) return; }
      catch(error) {
        if(error instanceof RateLimitError) { sendJson(response,429,{message:error.message},{'Retry-After':String(error.retryAfter)}); return; }
        sendJson(response,error.statusCode||500,{message:error.statusCode?error.message:"The request could not be completed."}); return;
      }
    }
    if(url.pathname==="/api/interests"&&request.method==="POST"){
      if(!String(request.headers["content-type"]||"").toLowerCase().startsWith("application/json")){sendJson(response,415,{message:"Content-Type must be application/json."});return;}
      try{
        const requester=paymentApi.requester(request);
        store.checkRateLimit(requester);
        const validation=validateInterest(await readJsonBody(request));
        if(Object.keys(validation.errors).length){sendJson(response,422,{message:"Please check the highlighted fields.",errors:validation.errors});return;}
        const result = await paymentApi.create(validation.value,request,response);
        sendJson(response,201,result);
      }catch(error){
        if(error instanceof DuplicateInterestError){sendJson(response,409,{message:error.message,code:"DUPLICATE_SUBMISSION"});return;}
        if(error instanceof RateLimitError){sendJson(response,429,{message:error.message,code:"RATE_LIMITED"},{"Retry-After":String(error.retryAfter)});return;}
        if(error.statusCode){sendJson(response,error.statusCode,{message:error.message});return;}
        console.error("Interest submission failed:",error);sendJson(response,500,{message:"Interest could not be saved right now."});
      }return;
    }
    if(url.pathname==="/api/interests"){sendJson(response,405,{message:"Method not allowed"},{Allow:"POST"});return;}
    sendJson(response,404,{message:"Not found"});
  };
  return { server:http.createServer(handler), store, handler, mirror, retryEmails: paymentApi.retryEmails };
}

if(require.main===module){
  const app=createHelionServer({databasePath:process.env.HELION_DB_PATH||DEFAULT_DATABASE_PATH});
  const port=Number.parseInt(process.env.PORT||"3000",10),host=process.env.HOST||"127.0.0.1";
  app.server.listen(port,host,()=>console.log(`HELION is running at http://${host}:${port}`));
  const timer=setInterval(()=>retryPendingSheetSyncs(app.store,app.mirror).catch(error=>console.error("Sheet retry failed:",error)),60_000);timer.unref();
  const emailTimer=setInterval(()=>app.retryEmails().catch(error=>console.error("Email retry failed:",error.message)),60_000);emailTimer.unref();
  function shutdown(){clearInterval(timer);clearInterval(emailTimer);app.server.close(()=>{app.store.close();process.exit(0);});app.server.closeAllConnections?.();}
  process.on("SIGINT",shutdown);process.on("SIGTERM",shutdown);
}

module.exports={DEFAULT_DATABASE_PATH,MAX_TEAM_SIZE,DuplicateInterestError,RateLimitError,InterestStore,GoogleSheetsMirror,createHelionServer,retryPendingSheetSyncs,syncOne,validateInterest};
