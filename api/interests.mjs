import { createSign, randomBytes } from "node:crypto";

const MAX_TEAM_SIZE = 5;
const BODY_LIMIT_BYTES = 24 * 1024;

function cleanText(value) {
  return typeof value === "string"
    ? value.normalize("NFKC").replace(/[\u0000-\u001F\u007F]/g, "").trim().replace(/\s+/g, " ")
    : "";
}

function normaliseEmail(value) {
  return typeof value === "string" ? value.normalize("NFKC").trim().toLowerCase() : "";
}

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

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

async function getGoogleToken(email, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  signer.end();
  const assertion = `${header}.${claims}.${signer.sign(privateKey, "base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new Error(`Google authorization failed (${response.status})`);
  return payload.access_token;
}

async function appendToSheet(interest) {
  const spreadsheetId = String(process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "").trim();
  const sheetName = String(process.env.GOOGLE_SHEETS_SHEET_NAME || "Interests").trim() || "Interests";
  const email = String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  const privateKey = String(process.env.GOOGLE_PRIVATE_KEY || "").trim().replace(/\\n/g, "\n");
  if (!spreadsheetId || !email || !privateKey) throw new Error("Google Sheets environment variables are incomplete");

  const row = [interest.interestId, interest.submittedAt, interest.teamSize];
  for (let index = 0; index < MAX_TEAM_SIZE; index += 1) {
    row.push(interest.members[index]?.name || "", interest.members[index]?.email || "");
  }
  row.push(interest.mobile, interest.grade, interest.age);
  const range = `'${sheetName.replaceAll("'", "''")}'!A:P`;
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getGoogleToken(email, privateKey)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values: [row] })
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Google Sheets append failed (${response.status}): ${details.slice(0, 300)}`);
  }
}

function json(payload, status, extraHeaders = {}) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", ...extraHeaders }
  });
}

export default {
  async fetch(request) {
    if (request.method !== "POST") return json({ message: "Method not allowed" }, 405, { Allow: "POST" });
    if (!String(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
      return json({ message: "Content-Type must be application/json." }, 415);
    }
    try {
      const bodyText = await request.text();
      if (Buffer.byteLength(bodyText) > BODY_LIMIT_BYTES) return json({ message: "Request body is too large" }, 413);
      let body;
      try { body = JSON.parse(bodyText || "{}"); }
      catch { return json({ message: "Request body must be valid JSON" }, 400); }

      const validation = validateInterest(body);
      if (Object.keys(validation.errors).length) {
        return json({ message: "Please check the highlighted fields.", errors: validation.errors }, 422);
      }
      const interestId = `HLN-${randomBytes(16).toString("hex").toUpperCase()}`;
      await appendToSheet({
        interestId,
        submittedAt: new Date().toISOString(),
        ...validation.value
      });
      return json({ message: "Interest recorded.", interestId }, 201);
    } catch (error) {
      console.error("Interest submission failed:", error);
      return json({ message: "Interest could not be saved right now." }, 500);
    }
  }
};
