// Public configuration only. Loopback acceptance always targets the approved staging project.
const stagingUrl='https://qemjnekgcbuddayzhdtr.supabase.co';
const stagingKey='sb_publishable_x_XtO1UU9SwfqhyPNyArDA_N5f_eQyK';
const productionUrl='https://itswbmjvuxumfjqkkqgx.supabase.co';
const productionKey='sb_publishable_lgBKt5K8CQCPSC-MaC7s6g_M2iTdWEN';
const syntheticEmails=new Set(['reaper-synthetic-admin-20261028@example.invalid','reaper-synthetic-client-a-20261028@example.invalid','reaper-synthetic-client-b-20261028@example.invalid']);
export function resolveRuntime(location,application){
 if(!['admin','portal'].includes(application))throw Error('Unknown application');
 const u=new URL(location.href);
 if(u.username||u.password)throw Error('User information is not permitted in an application URL');
 const staging=['127.0.0.1','localhost'].includes(u.hostname);
 if(!staging&&u.origin!==`https://${application}.reaperai.com`)throw Error('Unapproved application origin');
 if(staging&&(u.protocol!=='http:'||u.port!==(application==='admin'?'4185':'4173')))throw Error('Use the dedicated isolated loopback application port');
 return Object.freeze({staging,url:staging?stagingUrl:productionUrl,key:staging?stagingKey:productionKey,
  page:path=>new URL(path,staging?u.origin:`https://${application}.reaperai.com`).href,
  emailAllowed:email=>staging?syntheticEmails.has(String(email).trim().toLowerCase()):!String(email).trim().toLowerCase().endsWith('@example.invalid')});
}
