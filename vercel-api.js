"use strict";
const {Readable}=require('node:stream');
const {createHelionServer,createTursoStore,GoogleSheetsMirror}=require('./server');
const {createMailer}=require('./payments');

function databaseErrorCode(error) {
  const codes=[error?.code,error?.cause?.code].map(value=>String(value||'').toUpperCase());
  if(codes.includes('TURSO_CONFIG_MISSING'))return 'TURSO_CONFIG_MISSING';
  if(codes.some(code=>code.includes('URL_')))return 'TURSO_URL_INVALID';
  if(codes.some(code=>/AUTH|UNAUTHORIZED|FORBIDDEN/.test(code)))return 'TURSO_AUTH_FAILED';
  if(codes.some(code=>/MODULE_NOT_FOUND|DLOPEN/.test(code)))return 'DATABASE_RUNTIME_ERROR';
  return 'TURSO_CONNECTION_FAILED';
}

// Same application handler as local development, with Turso as durable storage.
// No local database file, external backend URL, or HTTP proxy is used on Vercel.
function createVercelHandler({env=process.env,storeFactory=createTursoStore,mirror,mailer}={}) {
  let application;
  async function initialize() {
    if(!application) {
      application=(async()=>{
        const store=storeFactory(env);
        try {await store.ready;}
        catch(error){store.close();throw error;}
        return createHelionServer({store,env:{...env,NODE_ENV:'production',HELION_TRUST_PROXY:'true',HELION_PROXY_SECRET:''},mirror:mirror||new GoogleSheetsMirror(env),mailer:mailer||createMailer(env)});
      })().catch(error=>{application=undefined;throw error;});
    }
    return application;
  }
  return {
    async fetch(request) {
      let app;
      try {app=await initialize();}
      catch(error) {
        const code=databaseErrorCode(error);
        // Only log classifications and key presence, never URLs, tokens or raw errors.
        console.error('HELION database initialization failed',{
          code,
          driverCode:/^[A-Z0-9_]{1,64}$/.test(String(error?.code||''))?error.code:'UNCLASSIFIED',
          urlConfigured:Boolean(String(env.TURSO_DATABASE_URL||'').trim()),
          tokenConfigured:Boolean(String(env.TURSO_AUTH_TOKEN||'').trim())
        });
        return Response.json({message:'The database connection is unavailable. Please try again later.',code},{status:503,headers:{'Cache-Control':'no-store'}});
      }
      const url=new URL(request.url);
      if(!url.pathname.startsWith('/api/'))return Response.json({message:'Not found'},{status:404});
      const input=request.body?Readable.fromWeb(request.body):Readable.from([]);
      input.method=request.method;input.url=url.pathname+url.search;
      input.headers=Object.fromEntries(request.headers);input.headers.host=url.host;
      input.socket={remoteAddress:request.headers.get('x-forwarded-for')||'unknown'};
      const headers=new Headers();let status=200,body;
      const response={
        setHeader(name,value){headers.set(name,value);},
        writeHead(code,values){status=code;for(const [name,value] of Object.entries(values))headers.set(name,String(value));},
        end(value){body=value;}
      };
      await app.handler(input,response);
      return new Response(request.method==='HEAD'?null:body,{status,headers});
    }
  };
}
module.exports={createVercelHandler};
