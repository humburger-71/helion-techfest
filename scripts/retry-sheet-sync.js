"use strict";

const { InterestStore, createTursoStore, GoogleSheetsMirror, DEFAULT_DATABASE_PATH, retryPendingSheetSyncs } = require("../server");

async function main() {
  const store = process.env.TURSO_DATABASE_URL ? createTursoStore() : new InterestStore(process.env.HELION_DB_PATH || DEFAULT_DATABASE_PATH);
  try {
    await store.ready;
    const mirror = new GoogleSheetsMirror();
    if (!mirror.configured) throw new Error("Google Sheets environment variables are not configured.");
    const synced = await retryPendingSheetSyncs(store, mirror, 100);
    console.log(`Synchronized ${synced} pending HELION submission${synced === 1 ? "" : "s"}.`);
  } finally { store.close(); }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
