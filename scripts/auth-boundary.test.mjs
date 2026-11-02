import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';import {resolveRuntime} from '../runtime-config.mjs';
const source=(await readFile(new URL('../auth-guard.js',import.meta.url),'utf8')).replace(/^import [^\r\n]*\r?\n/gm,'');
async function boot({email='reaper-synthetic-admin-20261028@example.invalid',status='active',role='admin',security={password_initialized:true},aal='aal1',verified=true}={}){
 const calls=[];const session={user:{id:'fixture-id',email}};const document={title:'Synthetic',documentElement:{style:{visibility:'hidden'}},dispatchEvent(){calls.push('ready');},addEventListener(){}};
 const client={auth:{getSession:async()=>({data:{session}}),signOut:async()=>{calls.push('signOut');},mfa:{listFactors:async()=>({data:{totp:verified?[{status:'verified'}]:[]}}),getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:aal}})}},from(table){calls.push(table);return{select(){return this;},eq(){return this;},single:async()=>table==='profiles'?{data:{id:'fixture-id',email,role,status}}:{data:security}};}};
 const window={location:{href:'http://127.0.0.1:4185/index.html',pathname:'/index.html',hash:'',replace(url){calls.push(url);}},history:{replaceState(){}},reaperAdmin:null};
 await vm.runInNewContext('(async()=>{'+source+'})()',{window,document,resolveRuntime,createClient:()=>client,CustomEvent:class{},console:{error(){}}});return{calls,document,window};
}
test('persisted disallowed identity stops before profile access',async()=>{const r=await boot({email:'ordinary@example.com'});assert.ok(r.calls.includes('signOut'));assert.ok(!r.calls.includes('profiles'));assert.ok(!r.calls.includes('ready'));});
test('AAL1 administrator requires real enrollment or challenge before application ready',async()=>{
 for(const verified of [true,false]){const r=await boot({verified});assert.ok(!r.calls.includes('ready'));assert.equal(r.window.reaperAdmin,null);assert.ok(r.calls.includes('http://127.0.0.1:4185/'+(verified?'mfa-challenge':'mfa-enroll')+'.html'));}
});
test('active AAL2 administrator keeps existing successful guard path',async()=>{const r=await boot({aal:'aal2'});assert.ok(r.calls.includes('ready'));assert.equal(r.document.documentElement.style.visibility,'visible');});
test('suspension, client role and missing security never publish admin context',async()=>{
 for(const input of [{status:'suspended'},{role:'client'},{security:null}]){const r=await boot(input);assert.ok(!r.calls.includes('ready'));assert.equal(r.window.reaperAdmin,null);assert.equal(r.document.documentElement.style.visibility,'hidden');}
});
