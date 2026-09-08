"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { GoogleSheetsMirror } = require("../server");
const sheetDetails = require("../sheet-details.cjs");
test("Sheets mirror appends one participant per row with separate columns and reports write failures", async (t) => {
  const mirror = new GoogleSheetsMirror({ GOOGLE_SHEETS_SPREADSHEET_ID: "test", GOOGLE_SERVICE_ACCOUNT_EMAIL: "test", GOOGLE_PRIVATE_KEY: "test" });
  mirror.token = async () => "test-token";
  const interest = { interest_id: "HLN-RANDOM", submitted_at: "2026-09-08", mobile: "+919876543210", grade: "University", age: 19, members: [{ name: "Test Student", email: "test@example.com" }] };
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.ok(decodeURIComponent(url).includes("'Interests'!A:G:append"));
    const rows = JSON.parse(options.body).values;
    assert.deepEqual(rows, [["HLN-RANDOM", "2026-09-08", "Test Student", "test@example.com", "+919876543210", "University", 19]]);
    return new Response("{}", { status: 200 });
  });
  assert.equal(await mirror.append(interest), true);
  globalThis.fetch.mock.mockImplementation(async () => new Response("Permission denied", { status: 403 }));
  await assert.rejects(mirror.append(interest), /Google Sheets append failed \(403\)/);
});
