import test from'node:test';import assert from'node:assert/strict';import vm from'node:vm';import{readFile}from'node:fs/promises';import{randomUUID}from'node:crypto';
test('pending service holds selectors/actions; changed selection cannot receive a late service result',async()=>{
 const nodes=new Map(),values=new Map(),client='b886bc64-e931-46df-8451-e8ae08de46e8',entity='5eb18004-6373-4e77-9b51-ef55f5faaf1d',intake='db603140-ec69-4c2b-86ed-2200725b6f0f';
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',disabled:true,textContent:'',listeners:{},addEventListener(k,fn){this.listeners[k]=fn;},replaceChildren(){}});return nodes.get(id);};
 let finish,linkCalls=0;const pending=new Promise(resolve=>finish=resolve);
 const funding={case_id:'e458aa3b-7cd5-4e97-a16f-c6427f54e2ad',client_id:client,business_entity_id:entity,assessment_id:'2e7216c1-c97c-40c7-80d4-b654fab56e42',case_revision:1};
 const s={auth:{getUser:async()=>({data:{user:{id:'ab89e54c-bf1f-4572-bc01-493b476687b9'}}}),mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal2'}})}},rpc:async()=>({data:[{id:intake,full_name:'Fictional'}]}),from:table=>({select:()=>table==='clients'?{eq:async()=>({data:[{id:client,full_name:'Fictional'}]})}:Promise.resolve({data:[{id:entity,client_id:client,status:'active',identity_revision:1,legal_name:'Fictional LLC'}]})})};
 const context=vm.createContext({window:{reaperAdmin:{supabase:s}},location:{},document:{getElementById:node,addEventListener(){}},resolveRuntime:()=>({staging:true,url:'https://qemjnekgcbuddayzhdtr.supabase.co'}),Option:class{},crypto:{randomUUID},localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},linkExistingIntake:async()=>{linkCalls++;return{funding_result:funding};},prepareRecoverableWrittenDraft:()=>pending,checkExistingIntakeConflicts(){},setTimeout,clearTimeout});
 const source=(await readFile(new URL('../existing-intake-ui.mjs',import.meta.url),'utf8')).replace(/^import[^\r\n]*\r?\n/gm,'');vm.runInContext(source,context);await new Promise(setImmediate);
 node('client').value=client;node('entity').value=entity;node('intake').value=intake;node('link-form').listeners.submit({preventDefault(){}});await new Promise(setImmediate);assert.equal(node('service-draft').disabled,false);
 const action=node('service-draft').listeners.click();for(const id of['intake','client','entity','submit','overlap','interrupt','conflicts'])assert.equal(node(id).disabled,true,id);
 node('link-form').listeners.submit({preventDefault(){}});assert.equal(linkCalls,1);
 // Even an out-of-band selection change must not misattribute the old result.
 node('entity').listeners.change();const cleared=node('service-result').textContent;finish({operation_id:randomUUID()});await action;assert.equal(node('service-result').textContent,cleared);assert.equal(node('service-draft').disabled,true);assert.equal(node('intake').disabled,false);
});
