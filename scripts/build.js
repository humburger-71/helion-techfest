"use strict";
// This vanilla site has no bundling step. Validate its executable sources.
const {spawnSync}=require('node:child_process');
const {readFileSync,mkdirSync,copyFileSync}=require('node:fs');
const {join}=require('node:path');
const root=join(__dirname,'..');
for(const file of ['server.js','payments.js','script.js','payment.js','admin.js','smoothscroll.js','api/interests.mjs','api/[...path].mjs','api/proxy.mjs','scripts/admin-password.js']) {
  const result=spawnSync(process.execPath,['--check',join(root,file)],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
}
JSON.parse(readFileSync(join(root,'vercel.json'),'utf8'));
// Publish an explicit allowlist so database, source and configuration cannot be served.
const output=join(root,'dist');
mkdirSync(join(output,'brand'),{recursive:true});
for(const file of ['index.html','styles.css','script.js','payment.js','admin.html','admin.js','smoothscroll.js','brand/helion-icon.png','brand/helion-wordmark.png'])copyFileSync(join(root,file),join(output,file));
console.log('HELION syntax checks passed; public assets built in dist/.');
