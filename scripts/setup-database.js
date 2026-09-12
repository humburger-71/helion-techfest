"use strict";
const {createTursoStore}=require('../server');
(async()=>{
  const store=createTursoStore();
  try {
    await store.ready;
    const result=await store.sql.prepare('SELECT COUNT(*) count FROM interest_teams').get();
    console.log('Turso connected and HELION schema ready. Existing applications: '+result.count);
  } finally {store.close();}
})().catch(error=>{
  console.error('Turso setup failed. Check TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, token permissions, and network access. Error code: '+(error.code||'CONNECTION_ERROR'));
  process.exitCode=1;
});
