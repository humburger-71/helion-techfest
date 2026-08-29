"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { DatabaseSync } = require("node:sqlite");
const { createHelionServer, validateInterest } = require("../server");

function validTeam() {
  return { fullName: "Avery Student", teamSize: 2, members: [
    { name: "Avery Student", email: "avery@example.com" },
    { name: "Jordan Student", email: "jordan@example.com" }
  ] };
}

test("server validation sanitizes teams and rejects malformed or duplicate members", () => {
  const result = validateInterest({ fullName: "  Avery   Student ", teamSize: 2, members: [
    { name: "Avery Student", email: "AVERY@example.com" }, { name: "Jordan", email: "avery@example.com" }
  ] });
  assert.equal(result.value.fullName, "Avery Student");
  assert.equal(result.value.members[0].email, "avery@example.com");
  assert.ok(result.errors["members.1.email"]);
  assert.ok(validateInterest({ ...validTeam(), teamSize: 99 }).errors.teamSize);
  assert.ok(validateInterest({ ...validTeam(), members: [validTeam().members[0]] }).errors.members);
});

test("API persists normalized teams, mirrors safely, and returns sequential IDs", async (context) => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "helion-interest-test-"));
  const databasePath = join(temporaryDirectory, "interests.sqlite");
  const appended = [];
  const mirror = { configured: true, append: async (team) => appended.push(team) };
  const app = createHelionServer({ databasePath, mirror });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
  context.after(async () => { await new Promise((resolve) => app.server.close(resolve)); app.store.close(); rmSync(temporaryDirectory, { recursive: true, force: true }); });

  const invalid = await fetch(`${baseUrl}/api/interests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: "A", teamSize: 2, members: [] }) });
  assert.equal(invalid.status, 422);
  assert.ok((await invalid.json()).errors.fullName);

  const created = await fetch(`${baseUrl}/api/interests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validTeam()) });
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), { message: "Interest recorded.", interestId: "HLN-00001" });
  assert.equal(appended.length, 1);

  const database = new DatabaseSync(databasePath, { readOnly: true });
  assert.equal(database.prepare("SELECT COUNT(*) count FROM interest_teams").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM interest_members").get().count, 2);
  assert.equal(database.prepare("SELECT status FROM sheet_sync_outbox").get().status, "SYNCED");
  database.close();

  const duplicate = await fetch(`${baseUrl}/api/interests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...validTeam(), members: [...validTeam().members].reverse(), fullName: "Jordan Student" }) });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).code, "DUPLICATE_SUBMISSION");
  assert.equal((await fetch(`${baseUrl}/data/helion.sqlite`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/interests`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://attacker.example" }, body: JSON.stringify(validTeam()) })).status, 403);
});

test("database success survives a Google Sheets failure and queues retry", async (context) => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "helion-sheet-test-"));
  const databasePath = join(temporaryDirectory, "interests.sqlite");
  const mirror = { configured: true, append: async () => { throw new Error("temporary outage"); } };
  const app = createHelionServer({ databasePath, mirror });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
  context.after(async () => { await new Promise((resolve) => app.server.close(resolve)); app.store.close(); rmSync(temporaryDirectory, { recursive: true, force: true }); });
  const response = await fetch(`${baseUrl}/api/interests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validTeam()) });
  assert.equal(response.status, 201);
  const database = new DatabaseSync(databasePath, { readOnly: true });
  const outbox = database.prepare("SELECT status,attempts,last_error FROM sheet_sync_outbox").get(); database.close();
  assert.equal(outbox.status, "PENDING"); assert.equal(outbox.attempts, 1); assert.match(outbox.last_error, /temporary outage/);
});
