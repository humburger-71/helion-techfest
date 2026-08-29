"use strict";

const http = require("node:http");
const { createHash, createSign } = require("node:crypto");
const { readFileSync, mkdirSync, existsSync } = require("node:fs");
const { dirname, extname, join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");

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
  ["/brand/helion-icon.png", "brand/helion-icon.png"],
  ["/brand/helion-wordmark.png", "brand/helion-wordmark.png"]
]);
const MIME_TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png" };

class DuplicateInterestError extends Error {
  constructor() { super("This team is already on the HELION list."); this.name = "DuplicateInterestError"; }
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
  const teamSize = Number(input?.teamSize);
  const rawMembers = Array.isArray(input?.members) ? input.members : [];
  if (fullName.length < 2) errors.fullName = "Enter your full name.";
  else if (fullName.length > 80) errors.fullName = "Full name must be 80 characters or fewer.";
  if (!Number.isInteger(teamSize) || teamSize < 1 || teamSize > MAX_TEAM_SIZE) errors.teamSize = `Team size must be between 1 and ${MAX_TEAM_SIZE}.`;
  if (Number.isInteger(teamSize) && rawMembers.length !== teamSize) errors.members = `Enter exactly ${teamSize} team member${teamSize === 1 ? "" : "s"}.`;
  const members = rawMembers.slice(0, MAX_TEAM_SIZE + 1).map((member) => ({ name: cleanText(member?.name), email: normaliseEmail(member?.email) }));
  const seen = new Set();
  members.forEach((member, index) => {
    const key = `members.${index}`;
    if (member.name.length < 2) errors[`${key}.name`] = `Enter member ${index + 1}'s full name.`;
    else if (member.name.length > 80) errors[`${key}.name`] = "Name must be 80 characters or fewer.";
    if (!validEmail(member.email)) errors[`${key}.email`] = `Enter a valid email for member ${index + 1}.`;
    else if (seen.has(member.email)) errors[`${key}.email`] = "Each team member must use a different email.";
    seen.add(member.email);
  });
  if (members[0]?.name && fullName && members[0].name.localeCompare(fullName, undefined, { sensitivity: "base" }) !== 0) {
    errors["members.0.name"] = "Member 1 must be the participant submitting this form.";
  }
  return { errors, value: { fullName, teamSize, members } };
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
    this.createTransaction = (value) => {
      this.database.exec("BEGIN IMMEDIATE");
      try {
      const submittedAt = new Date().toISOString();
      const fingerprint = createHash("sha256").update(value.members.map((m) => m.email).sort().join("\n")).digest("hex");
      let result;
      try {
        result = this.database.prepare("INSERT INTO interest_teams(full_name,team_size,submitted_at,team_fingerprint) VALUES(?,?,?,?)")
          .run(value.fullName, value.teamSize, submittedAt, fingerprint);
      } catch (error) {
        if (String(error.message).includes("team_fingerprint")) throw new DuplicateInterestError();
        throw error;
      }
      const numericId = Number(result.lastInsertRowid);
      const interestId = `HLN-${String(numericId).padStart(5, "0")}`;
      this.database.prepare("UPDATE interest_teams SET interest_id=? WHERE id=?").run(interestId, numericId);
      const insert = this.database.prepare("INSERT INTO interest_members(interest_team_id,member_number,name,email,email_normalized) VALUES(?,?,?,?,?)");
      value.members.forEach((member, index) => insert.run(numericId, index + 1, member.name, member.email, member.email));
      this.database.prepare("INSERT INTO sheet_sync_outbox(interest_team_id,next_attempt_at) VALUES(?,?)").run(numericId, submittedAt);
      const created = { numericId, interestId, submittedAt, ...value };
      this.database.exec("COMMIT");
      return created;
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    };
  }
  create(value) { return this.createTransaction(value); }
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
    const team = this.database.prepare("SELECT id,interest_id,submitted_at,team_size FROM interest_teams WHERE id=?").get(id);
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
    const row = [team.interest_id, team.submitted_at, team.team_size];
    for (let i = 0; i < MAX_TEAM_SIZE; i += 1) row.push(team.members[i]?.name || "", team.members[i]?.email || "");
    const range = `'${this.sheetName.replaceAll("'", "''")}'!A:M`;
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

function createHelionServer({ databasePath=DEFAULT_DATABASE_PATH, mirror=new GoogleSheetsMirror() }={}) {
  const store = new InterestStore(databasePath);
  const handler = async (request, response) => {
    let url; try{url=new URL(request.url,`http://${request.headers.host||"localhost"}`);}catch{sendJson(response,400,{message:"Invalid request URL"});return;}
    if((request.method==="GET"||request.method==="HEAD")&&serveStatic(url.pathname,request,response))return;
    if(request.method==="GET"&&url.pathname==="/api/health"){sendJson(response,200,{status:"ok",application:"HELION"});return;}
    if(url.pathname==="/api/interests"&&request.method==="POST"){
      if(!isSameOrigin(request)){sendJson(response,403,{message:"Cross-origin submissions are not accepted."});return;}
      if(!String(request.headers["content-type"]||"").toLowerCase().startsWith("application/json")){sendJson(response,415,{message:"Content-Type must be application/json."});return;}
      try{
        const requester=String(request.headers["x-forwarded-for"]||request.socket?.remoteAddress||"unknown").split(",")[0].trim();
        store.checkRateLimit(requester);
        const validation=validateInterest(await readJsonBody(request));
        if(Object.keys(validation.errors).length){sendJson(response,422,{message:"Please check the highlighted fields.",errors:validation.errors});return;}
        const interest=store.create(validation.value); await syncOne(store,mirror,interest.numericId);
        sendJson(response,201,{message:"Interest recorded.",interestId:interest.interestId});
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
  return { server:http.createServer(handler), store, handler, mirror };
}

if(require.main===module){
  const app=createHelionServer({databasePath:process.env.HELION_DB_PATH||DEFAULT_DATABASE_PATH});
  const port=Number.parseInt(process.env.PORT||"3000",10),host=process.env.HOST||"127.0.0.1";
  app.server.listen(port,host,()=>console.log(`HELION is running at http://${host}:${port}`));
  const timer=setInterval(()=>retryPendingSheetSyncs(app.store,app.mirror).catch(error=>console.error("Sheet retry failed:",error)),60_000);timer.unref();
  function shutdown(){clearInterval(timer);app.server.close(()=>{app.store.close();process.exit(0);});app.server.closeAllConnections?.();}
  process.on("SIGINT",shutdown);process.on("SIGTERM",shutdown);
}

module.exports={DEFAULT_DATABASE_PATH,MAX_TEAM_SIZE,DuplicateInterestError,RateLimitError,InterestStore,GoogleSheetsMirror,createHelionServer,retryPendingSheetSyncs,syncOne,validateInterest};
