"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { DatabaseSync } = require("node:sqlite");
const { createHelionServer, validateInterest } = require("../server");

function validPerson() {
  return { fullName: "Avery Student", email: "avery@example.com" };
}

test("validation requires one name and email and normalizes them", () => {
  const result = validateInterest({ fullName: "  Avery   Student ", email: " AVERY@example.com " });
  assert.deepEqual(result.errors, {});
  assert.equal(result.value.fullName, "Avery Student");
  assert.deepEqual(result.value.members, [{ name: "Avery Student", email: "avery@example.com" }]);
  assert.equal(result.value.teamSize, 1);
  assert.ok(validateInterest({ fullName: "A" }).errors.fullName);
  assert.ok(validateInterest({ ...validPerson(), email: "invalid" }).errors.email);
  assert.ok(validateInterest({ ...validPerson(), email: "" }).errors.email);
  assert.equal(validateInterest({ ...validPerson(), teamSize: 5, members: [{ name: "Extra", email: "extra@example.com" }] }).value.members.length, 1);
});

test("API persists individual signups, mirrors safely, and returns random IDs", async (context) => {
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

  const created = await fetch(`${baseUrl}/api/interests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validPerson()) });
  assert.equal(created.status, 201);
  const payload = await created.json();
  assert.equal(payload.message, "Interest recorded.");
  assert.match(payload.interestId, /^HLN-[0-9A-F]{32}$/);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].interest_id, payload.interestId);

  const database = new DatabaseSync(databasePath, { readOnly: true });
  assert.equal(database.prepare("SELECT COUNT(*) count FROM interest_teams").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM interest_members").get().count, 1);
  assert.equal(database.prepare("SELECT status FROM sheet_sync_outbox").get().status, "SYNCED");
  assert.equal(database.prepare("SELECT interest_id FROM interest_teams").get().interest_id, payload.interestId);
  database.close();

  const second = await fetch(`${baseUrl}/api/interests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: "Another Student", email: "another@example.com" }) });
  assert.equal(second.status, 201);
  const secondPayload = await second.json();
  assert.match(secondPayload.interestId, /^HLN-[0-9A-F]{32}$/);
  assert.notEqual(secondPayload.interestId, payload.interestId);

  const duplicate = await fetch(`${baseUrl}/api/interests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...validPerson(), email: "AVERY@example.com", fullName: "Avery Changed" }) });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).code, "DUPLICATE_SUBMISSION");
  assert.equal((await fetch(`${baseUrl}/data/helion.sqlite`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/interests`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://attacker.example" }, body: JSON.stringify(validPerson()) })).status, 403);
});

test("database success survives a Google Sheets failure and queues retry", async (context) => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "helion-sheet-test-"));
  const databasePath = join(temporaryDirectory, "interests.sqlite");
  const mirror = { configured: true, append: async () => { throw new Error("temporary outage"); } };
  const app = createHelionServer({ databasePath, mirror });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
  context.after(async () => { await new Promise((resolve) => app.server.close(resolve)); app.store.close(); rmSync(temporaryDirectory, { recursive: true, force: true }); });
  const response = await fetch(`${baseUrl}/api/interests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validPerson()) });
  assert.equal(response.status, 201);
  const database = new DatabaseSync(databasePath, { readOnly: true });
  const outbox = database.prepare("SELECT status,attempts,last_error FROM sheet_sync_outbox").get(); database.close();
  assert.equal(outbox.status, "PENDING"); assert.equal(outbox.attempts, 1); assert.match(outbox.last_error, /temporary outage/);
});
