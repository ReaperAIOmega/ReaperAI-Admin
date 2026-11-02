import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function setup(){
 const alerts=[],calls=[];
 const document={addEventListener(){},getElementById(){return null;}};
 const window={alert:s=>alerts.push(s)};
 const context=vm.createContext({window,document,console,location:{hostname:'127.0.0.1'}});
 vm.runInContext(readFileSync(new URL('../admin-records.js',import.meta.url),'utf8')+'\nglobalThis.api={reviewDocument,isCanonicalFundingArtifact};',context);
 const s={from:()=>{calls.push('update');return {update:()=>({eq:()=>({select:async()=>({data:[],error:null})})})};}};
 return {api:context.api,s,alerts,calls};
}
test('canonical categories and paths never reach generic document mutation',async()=>{
 for(const row of [{category:'funding-document',storage_path:'other'},{category:'other',storage_path:'funding-artifacts/x.pdf'}]){
  const x=setup();await x.api.reviewDocument(x.s,{id:'admin'},row,'approved',{disabled:false});
  assert.equal(x.calls.length,0);assert.equal(x.alerts.length,1);
 }
});
test('a denied zero-row generic update cannot report successful review',async()=>{
 const x=setup(),button={disabled:false};await x.api.reviewDocument(x.s,{id:'admin'},{category:'identity',storage_path:'client/x'},'approved',button);
 assert.equal(x.calls.length,1);assert.equal(x.alerts.length,1);assert.equal(button.disabled,false);
});
test('Documents uses existing schema and keeps canonical review separate',()=>{
 const src=readFileSync(new URL('../admin-records.js',import.meta.url),'utf8');
 assert.doesNotMatch(src,/review_status,review_notes|review_notes:/);
 assert.match(src,/wrap.append\(label\);\s*return wrap;/);
 assert.match(readFileSync(new URL('../documents.html',import.meta.url),'utf8'),/synthetic-artifact-review-link/);
});
