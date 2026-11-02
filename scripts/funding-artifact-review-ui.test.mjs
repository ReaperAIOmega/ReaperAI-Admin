import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('new review tab loads canonical state but requires local verification and owner attestation separately',async()=>{
 const nodes=new Map(),el=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',value:'',checked:false,files:[{}],listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}});return nodes.get(id);};
 let transitions=0,reads=0,hasReceipt=false;
 const metadata=()=>({state:'REVIEW_REQUESTED',revision:2,storage_current:true});
 const context=vm.createContext({window:{location:{},reaperAdmin:{supabase:{}}},document:{getElementById:el,addEventListener(){}},resolveRuntime:()=>({staging:true}),localStorage:{},
 readArtifact:async()=>{reads++;return metadata();},prepareAndVerifyArtifact:async()=>{hasReceipt=true;return metadata();},localVerificationMatches:()=>hasReceipt,clearLocalVerification:()=>{hasReceipt=false;},transitionArtifact:async()=>{transitions++;}});
 const source=readFileSync(new URL('../funding-artifact-review-ui.js',import.meta.url),'utf8').replace(/import .*?from '[^']+';/g,'');
 vm.runInContext(source,context);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(reads,2);assert.equal(transitions,0);
 for(const kind of ['pdf','xlsx']){
  const button=el(kind+'-transition');
  assert.equal(button.textContent,'Mark personally reviewed');assert.equal(button.disabled,true);
  assert.match(el(kind+'-result').textContent,/REVIEW_REQUESTED/);
  el(kind+'-notes').value='Synthetic test rationale only';el(kind+'-human').checked=true;el(kind+'-human').listeners.change();
  assert.equal(button.disabled,true,'canonical metadata alone cannot replace current local verification');
  await el(kind+'-verify').listeners.click();
  assert.match(el(kind+'-verification-status').textContent,/Exact local v5 bytes/);
  assert.equal(el(kind+'-human').checked,false);assert.equal(button.disabled,true);
  el(kind+'-human').checked=true;el(kind+'-human').listeners.change();assert.equal(button.disabled,false);
  el(kind+'-file').listeners.change();assert.equal(button.disabled,true);assert.equal(el(kind+'-human').checked,false);
 }
 assert.equal(transitions,0);
});
