"use strict";
const {existsSync}=require('node:fs');
const {resolve}=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {DEFAULT_DATABASE_PATH,createTursoStore}=require('../server');
const {localDatabase}=require('../database');
const sheetDetails=require('../sheet-details.cjs');
(async()=>{
  const index=process.argv.indexOf('--db');
  let database,close;
  if(index<0 && process.env.TURSO_DATABASE_URL) {
    const store=createTursoStore();
    try {await store.ready;}catch(error){store.close();throw error;}
    database=store.sql;close=()=>store.close();
  } else {
    const path=resolve(index>=0&&process.argv[index+1]?process.argv[index+1]:process.env.HELION_DB_PATH||DEFAULT_DATABASE_PATH);
    if(!existsSync(path))throw new Error('No HELION database found at the configured path.');
    const raw=new DatabaseSync(path,{readOnly:true});database=localDatabase(raw);close=()=>raw.close();
  }
  try {
    const teams=await database.prepare('SELECT * FROM interest_teams WHERE interest_id IS NOT NULL ORDER BY submitted_at').all();
    const headers=['Interest ID','Submitted At','Name','Email','Mobile Number','Grade (2027-28)','Age at Signup'];
    const cell=value=>'"'+String(value??'').replaceAll('"','""')+'"';
    console.log(headers.map(cell).join(','));
    for(const team of teams) {
      const members=await database.prepare('SELECT name,email FROM interest_members WHERE interest_team_id=? ORDER BY member_number').all(team.id);
      console.log(sheetDetails({...team,members}).map(cell).join(','));
    }
  } finally {close();}
})().catch(()=>{console.error('Export failed. Check database configuration and connectivity.');process.exitCode=1;});
