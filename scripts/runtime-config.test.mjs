import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveRuntime} from '../runtime-config.mjs';
test('loopback auth and redirects are pinned to staging; real accounts rejected',()=>{
 for(const host of ['127.0.0.1','localhost'])for(const app of ['admin','portal']){
 const port=app==='admin'?'4185':'4173';
 const c=resolveRuntime({href:`http://${host}:${port}/login.html?project=evil#token`},app);
 assert.equal(c.url,'https://qemjnekgcbuddayzhdtr.supabase.co');assert.ok(c.staging);
 assert.equal(c.page('/mfa-enroll.html'),`http://${host}:${port}/mfa-enroll.html`);
 assert.equal(c.emailAllowed('real@example.com'),false);assert.equal(c.emailAllowed('reaper-synthetic-admin-20261028@example.invalid'),true);
 }
});
test('production keeps existing endpoint and refuses fictional credentials',()=>{
 const c=resolveRuntime({href:'https://admin.reaperai.com/login.html?staging=1'},'admin');
 assert.equal(c.staging,false);assert.equal(c.url,'https://itswbmjvuxumfjqkkqgx.supabase.co');
 assert.equal(c.page('/mfa-challenge.html'),'https://admin.reaperai.com/mfa-challenge.html');
 assert.equal(c.emailAllowed('reaper-synthetic-client-a-20261028@example.invalid'),false);
 assert.equal(c.emailAllowed('ordinary@example.com'),true);
 assert.throws(()=>resolveRuntime({href:'file:///tmp/login.html'},'unknown'));
});
test('login and guard use the pinned resolver without changing MFA or role gates',async()=>{
 for(const file of ['auth-login.js','auth-guard.js']){
 const s=await readFile(new URL('../'+file,import.meta.url),'utf8');assert.match(s,/resolveRuntime/);assert.doesNotMatch(s,/https:\/\/itswbmjvuxumfjqkkqgx/);
 if(file==='auth-login.js'){assert.match(s,/runtime.emailAllowed\(email\)/);assert.ok(s.indexOf('runtime.emailAllowed(email)')<s.indexOf('signInWithPassword'));}
 }
});

test('unknown origins, alternate loopback addresses and URL user information fail closed',()=>{
 for(const href of ['file:///tmp/login.html','http://127.0.0.2:4173','https://admin.reaperai.com.evil.test','https://admin.reaperai.com:8443','http://admin.reaperai.com','https://evil.test','http://user:secret@localhost:4173'])assert.throws(()=>resolveRuntime({href},'admin'));
});

test('each staging application rejects wrong ports before authentication',()=>{
 for(const app of ['admin','portal'])for(const port of ['4174','4184','9999',app==='admin'?'4173':'4185'])assert.throws(()=>resolveRuntime({href:'http://127.0.0.1:'+port+'/login.html'},app));
 assert.throws(()=>resolveRuntime({href:'http://[::1]:4185/login.html'},'admin'));
});
