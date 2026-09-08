"use strict";
const { existsSync } = require("node:fs");
const { resolve } = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { DEFAULT_DATABASE_PATH } = require("../server");
const sheetDetails = require("../sheet-details.cjs");
const index = process.argv.indexOf("--db");
const path = index >= 0 && process.argv[index + 1] ? resolve(process.argv[index + 1]) : DEFAULT_DATABASE_PATH;
if (!existsSync(path)) { console.error(`No HELION database found at ${path}`); process.exit(1); }
const database = new DatabaseSync(path, { readOnly: true });
const teams = database.prepare("SELECT * FROM interest_teams ORDER BY submitted_at").all();
const memberQuery = database.prepare("SELECT name,email FROM interest_members WHERE interest_team_id=? ORDER BY member_number");
const headers = ["Interest ID", "Submitted At", "Name", "Email", "Mobile Number", "Grade (2027-28)", "Age at Signup"];
const cell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
console.log(headers.map(cell).join(","));
for (const team of teams) {
  const row = sheetDetails({ ...team, members: memberQuery.all(team.id) });
  console.log(row.map(cell).join(","));
}
database.close();
