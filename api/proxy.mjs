// Vercel is a frontend proxy only. The durable Node/SQLite backend owns every ID.
const ALLOWED = /^\/api\/(interests|health|application(?:\/payment)?|admin\/(?:login|logout|payments(?:\/\d+\/(?:confirm|reject|retry-email))?))$/;
export default {
  async fetch(request) {
    const path=new URL(request.url).pathname;
    if(!ALLOWED.test(path)) return Response.json({message:'Not found'},{status:404});
    const origin=process.env.HELION_BACKEND_ORIGIN;
    if(!origin) return Response.json({message:'The waitlist service is not connected yet. Please try again later.'},{status:503});
    let target;
    try {
      target=new URL(origin);
      if(target.protocol!=='https:' || target.username || target.password || target.origin===new URL(request.url).origin) throw new Error('Invalid backend origin');
    } catch { return Response.json({message:'Backend configuration is unavailable.'},{status:503}); }
    target.pathname=path;target.search='';target.hash='';
    if(!['GET','POST','HEAD'].includes(request.method)) return Response.json({message:'Method not allowed'},{status:405});
    let body;
    if(request.method==='POST') {
      const reader=request.body?.getReader();const chunks=[];let bytes=0;
      if(reader) while(true) {
        const next=await reader.read();if(next.done)break;
        bytes+=next.value.length;
        if(bytes>24*1024){await reader.cancel();return Response.json({message:'Request body is too large'},{status:413});}
        chunks.push(next.value);
      }
      body=Buffer.concat(chunks);
    }
    const headers=new Headers();
    for(const key of ['content-type','cookie','origin','sec-fetch-site']) if(request.headers.has(key))headers.set(key,request.headers.get(key));
    headers.set('x-forwarded-for',request.headers.get('x-forwarded-for')||'unknown');
    if(process.env.HELION_PROXY_SECRET)headers.set('x-helion-proxy-secret',process.env.HELION_PROXY_SECRET);
    try {
      const response=await fetch(target,{method:request.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(25000)});
      const outgoing=new Headers(response.headers);outgoing.set('Cache-Control','no-store');
      outgoing.delete('content-encoding');outgoing.delete('content-length');
      return new Response(response.body,{status:response.status,headers:outgoing});
    }catch{return Response.json({message:'The payment service is temporarily unavailable. Your saved application is safe; please retry.'},{status:503});}
  }
};
