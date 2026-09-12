"use strict";
const {passwordHash}=require('../payments');
const {createInterface}=require('node:readline');
const {Writable}=require('node:stream');
if(!process.stdin.isTTY) { console.error('Run this command in an interactive terminal.'); process.exit(1); }
const output=new Writable({write(_chunk,_encoding,callback){callback();}});
const input=createInterface({input:process.stdin,output,terminal:true});
process.stdout.write('New admin password (at least 16 characters; input hidden): ');
input.question('',password=>{
  input.close();process.stdout.write('\n');
  if(password.length<16 || password.length>256){console.error('Use 16–256 characters.');process.exitCode=1;return;}
  console.log('Store this in HELION_ADMIN_PASSWORD_HASH:\n'+passwordHash(password));
});
