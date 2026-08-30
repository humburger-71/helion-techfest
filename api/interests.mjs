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
  const teamSize = Number(input?.teamSize);
  const rawMembers = Array.isArray(input?.members) ? input.members : [];

  if (fullName.length < 2) errors.fullName = "Enter your full name.";
  else if (fullName.length > 80) errors.fullName = "Full name must be 80 characters or fewer.";
  if (!Number.isInteger(teamSize) || teamSize < 1 || teamSize > MAX_TEAM_SIZE) {
    errors.teamSize = `Team size must be between 1 and ${MAX_TEAM_SIZE}.`;
  }
  if (Number.isInteger(teamSize) && rawMembers.length !== teamSize) {
    errors.members = `Enter exactly ${teamSize} team member${teamSize === 1 ? "" : "s"}.`;
  }

  const members = rawMembers.slice(0, MAX_TEAM_SIZE + 1).map((member) => ({
    name: cleanText(member?.name),
    email: normaliseEmail(member?.email)
  }));
  const seen = new Set();
  members.forEach((member, index) => {
    const key = `members.${index}`;
    if (member.name.length < 2) errors[`${key}.name`] = `Enter member ${index + 1}'s full name.`;
    else if (member.name.length > 80) errors[`${key}.name`] = "Name must be 80 characters or fewer.";
    if (member.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(member.email)) {
      errors[`${key}.email`] = `Enter a valid email for member ${index + 1}.`;
    } else if (seen.has(member.email)) {
      errors[`${key}.email`] = "Each team member must use a different email.";
    }
    seen.add(member.email);
  });
  if (members[0]?.name && fullName && members[0].name.localeCompare(fullName, undefined, { sensitivity: "base" }) !== 0) {
    errors["members.0.name"] = "Member 1 must be the participant submitting this form.";
  }
  return { errors, value: { fullName, teamSize, members } };
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
  const range = `'${sheetName.replaceAll("'", "''")}'!A:M`;
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
      const interestId = `HLN-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
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
