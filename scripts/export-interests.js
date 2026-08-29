"use strict";
const { existsSync } = require("node:fs");
const { resolve } = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { DEFAULT_DATABASE_PATH, MAX_TEAM_SIZE } = require("../server");
const index = process.argv.indexOf("--db");
const path = index >= 0 && process.argv[index + 1] ? resolve(process.argv[index + 1]) : DEFAULT_DATABASE_PATH;
if (!existsSync(path)) { console.error(`No HELION database found at ${path}`); process.exit(1); }
const database = new DatabaseSync(path, { readOnly: true });
const teams = database.prepare("SELECT id,interest_id,submitted_at,team_size FROM interest_teams ORDER BY submitted_at").all();
const memberQuery = database.prepare("SELECT name,email FROM interest_members WHERE interest_team_id=? ORDER BY member_number");
const headers = ["Interest ID", "Submitted At", "Team Size"];
for (let i = 1; i <= MAX_TEAM_SIZE; i += 1) headers.push(`Member ${i} Name`, `Member ${i} Email`);
const cell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
console.log(headers.map(cell).join(","));
for (const team of teams) {
  const row = [team.interest_id, team.submitted_at, team.team_size], members = memberQuery.all(team.id);
  for (let i = 0; i < MAX_TEAM_SIZE; i += 1) row.push(members[i]?.name || "", members[i]?.email || "");
  console.log(row.map(cell).join(","));
}
database.close();
