"use strict";

// Both adapters expose the same asynchronous SQL surface. Transactions own their
// connection; a request can never accidentally join another request's transaction.
function localDatabase(raw) {
  let tail=Promise.resolve();
  function exclusive(work) {
    const result=tail.then(work);
    tail=result.catch(()=>{});
    return result;
  }
  const direct={prepare:sql=>raw.prepare(sql),exec:sql=>raw.exec(sql)};
  return {
    prepare(sql) {
      return Object.fromEntries(['get','all','run'].map(method=>[method,(...args)=>exclusive(()=>raw.prepare(sql)[method](...args))]));
    },
    exec:sql=>exclusive(()=>raw.exec(sql)),
    transaction:work=>exclusive(async()=>{
      raw.exec('BEGIN IMMEDIATE');
      try {const result=await work(direct);raw.exec('COMMIT');return result;}
      catch(error){raw.exec('ROLLBACK');throw error;}
    })
  };
}

function remoteDatabase(client) {
  let transactionTail=Promise.resolve();
  function exclusive(work) {
    const result=transactionTail.then(work);
    transactionTail=result.catch(()=>{});
    return result;
  }
  const statements=(connection,schedule=work=>work())=>({
    prepare(sql) {
      const execute=args=>schedule(()=>connection.execute({sql,args:args.map(value=>value===undefined?null:value)}));
      return {
        get:async(...args)=>(await execute(args)).rows[0],
        all:async(...args)=>(await execute(args)).rows,
        run:async(...args)=>{const result=await execute(args);return {changes:result.rowsAffected,lastInsertRowid:result.lastInsertRowid};}
      };
    },
    exec:sql=>schedule(()=>connection.executeMultiple(sql))
  });
  return {
    ...statements(client,exclusive),
    transaction(work) {
      return exclusive(async()=>{
        const tx=await client.transaction('write');
        try {const result=await work(statements(tx));await tx.commit();return result;}
        catch(error){if(!tx.closed)await tx.rollback().catch(()=>{});throw error;}
        finally {tx.close();}
      });
    },
    close:()=>client.close()
  };
}

async function initializeRemote(database,template,additions) {
  const marker=await database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='helion_schema'").get();
  if(marker)return;
  const definitions=template.prepare("SELECT type,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type DESC,name").all();
  await database.transaction(async tx=>{
    const tables=definitions.filter(row=>row.type==='table').map(row=>row.sql.replace(/^CREATE TABLE /i,'CREATE TABLE IF NOT EXISTS '));
    await tx.exec(tables.join(';\n')+';');
    const columns=new Set((await tx.prepare('PRAGMA table_info(interest_teams)').all()).map(row=>row.name));
    const changes=Object.entries(additions).filter(([name])=>!columns.has(name)).map(([name,type])=>`ALTER TABLE interest_teams ADD COLUMN ${name} ${type};`);
    const indexes=definitions.filter(row=>row.type==='index').map(row=>row.sql.replace(/^CREATE (UNIQUE )?INDEX /i,(_match,unique)=>`CREATE ${unique||''}INDEX IF NOT EXISTS `)+';');
    await tx.exec([...changes,...indexes,"CREATE TABLE IF NOT EXISTS helion_schema(version INTEGER PRIMARY KEY); INSERT OR IGNORE INTO helion_schema VALUES(1);"].join('\n'));
  });
}

module.exports={localDatabase,remoteDatabase,initializeRemote};
