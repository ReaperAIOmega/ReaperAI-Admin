const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const updated=fs.readFileSync(require('node:path').join(__dirname,'..','reset-password.js'),'utf8');
const valid={data:{session:{user:{id:'test-user'}}},error:null};
async function harness(source,{hash='',search='',reject=false,logoutError=false,userMismatch=false,updateError=false,mfa=false,mfaError=false,aalError=false,noFactors=false,noUpgrade=false}={}) {
 const calls=[]; const logoutScopes=[]; const elements={};
 for(const id of ['recovery-status','recovery-form','recovery-submit','recovery-password','recovery-confirm','recovery-mfa-form','recovery-factor','recovery-code','recovery-verify']) elements[id]={hidden:id==='recovery-form'||id==='recovery-mfa-form',value:'',disabled:false,textContent:'',replaceChildren(){this.value='';},appendChild(option){this.value ||= option.value;},addEventListener(_,fn){this.submit=fn;}};
 const auth={onAuthStateChange(){return{};},getSession:async()=>{calls.push('getSession');return valid;},setSession:async()=>{calls.push('setSession');return reject?{error:Error('invalid')}:valid;},verifyOtp:async()=>{calls.push('verifyOtp');return reject?{error:Error('invalid')}:valid;},getUser:async()=>{calls.push('getUser');return {data:{user:{id:userMismatch?'other-user':'test-user'}}};},updateUser:async()=>{calls.push('updateUser');return{error:updateError?Error('update failed'):null};},signOut:async(options)=>{calls.push('signOut');logoutScopes.push(options?.scope);return {error:logoutError?Error('offline'):null};}};
 let upgraded=false;
 auth.mfa={getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:upgraded?'aal2':'aal1',nextLevel:mfa?'aal2':'aal1'},error:aalError?Error('unavailable'):null}),listFactors:async()=>({data:{totp:noFactors?[]:[{id:'test-factor',status:'verified'}]}}),challengeAndVerify:async({factorId,code})=>{calls.push('verifyMfa');assert.equal(factorId,'test-factor');assert.equal(code,'123456');upgraded=!mfaError&&!noUpgrade;return {error:mfaError?{code:'mfa_verification_failed'}:null};}};
 let options;
 const context={URLSearchParams,document:{title:'Recovery',getElementById:id=>elements[id],createElement:()=>({})},window:{location:{hash,search,pathname:'/reset-password.html',replace(){calls.push('redirect');}},history:{replaceState(){calls.push('scrub');}}},createClient:(_u,_k,o)=>{options=o;return{auth};}};
 vm.runInNewContext(source.replace(/^import .*\n/,''),context);
 await new Promise(resolve=>setImmediate(resolve));
 return {calls,elements,options,logoutScopes};
}
test('hardened page rejects type-only callback despite stored session',async()=>{const h=await harness(updated,{search:'?type=recovery'});assert.equal(h.elements['recovery-form'].hidden,true);assert.ok(!h.calls.includes('getSession'));assert.equal(h.calls[0],'scrub');});
test('client never persists or automatically consumes credentials',async()=>{const h=await harness(updated);assert.equal(h.options.auth.persistSession,false);assert.equal(h.options.auth.detectSessionInUrl,false);});
test('valid implicit callback is scrubbed before Auth calls and server checked',async()=>{const h=await harness(updated,{hash:'#type=recovery&access_token=fake-test-token&refresh_token=fake-test-refresh'});assert.deepEqual(h.calls,['scrub','setSession','getUser']);assert.equal(h.elements['recovery-form'].hidden,false);});
test('valid recovery token hash uses verification API',async()=>{const h=await harness(updated,{search:'?type=recovery&token_hash=fake-test-hash'});assert.deepEqual(h.calls,['scrub','verifyOtp','getUser']);assert.equal(h.elements['recovery-form'].hidden,false);});
test('invalid link stays hidden and URL is cleared',async()=>{const h=await harness(updated,{search:'?type=recovery&token_hash=fake-test-hash',reject:true});assert.equal(h.elements['recovery-form'].hidden,true);assert.equal(h.calls[0],'scrub');});
test('code-only callback fails closed with browser guidance',async()=>{const h=await harness(updated,{search:'?code=fake-test-code'});assert.equal(h.elements['recovery-form'].hidden,true);assert.match(h.elements['recovery-status'].textContent,/browser/);assert.deepEqual(h.calls,['scrub']);});
test('mixed callback is rejected',async()=>{const h=await harness(updated,{search:'?type=recovery&token_hash=fake-test-hash',hash:'#type=recovery&access_token=fake-test-token&refresh_token=fake-test-refresh'});assert.equal(h.elements['recovery-form'].hidden,true);assert.ok(!h.calls.includes('setSession'));assert.ok(!h.calls.includes('verifyOtp'));});
test('successful reset clears fields and cannot submit twice even if logout fails',async()=>{const h=await harness(updated,{search:'?type=recovery&token_hash=fake-test-hash',logoutError:true});for(const id of ['recovery-password','recovery-confirm'])h.elements[id].value='Fake-test-only-123!';await h.elements['recovery-form'].submit({preventDefault(){}});await h.elements['recovery-form'].submit({preventDefault(){}});assert.equal(h.calls.filter(x=>x==='updateUser').length,1);assert.equal(h.elements['recovery-password'].value,'');assert.equal(h.elements['recovery-form'].hidden,true);assert.match(h.elements['recovery-status'].textContent,/Password updated/);assert.ok(!h.calls.includes('redirect'));});

test('successful recovery logs out only its own session',async()=>{const h=await harness(updated,{search:'?type=recovery&token_hash=fake-test-hash'});for(const id of ['recovery-password','recovery-confirm'])h.elements[id].value='Fake-test-only-123!';await h.elements['recovery-form'].submit({preventDefault(){}});assert.deepEqual(h.logoutScopes,['local']);assert.ok(h.calls.includes('redirect'));});
test('mismatched server user stays closed',async()=>{const h=await harness(updated,{search:'?type=recovery&token_hash=fake-test-hash',userMismatch:true});assert.equal(h.elements['recovery-form'].hidden,true);});
test('failed password update permits retry without claiming success',async()=>{const h=await harness(updated,{search:'?type=recovery&token_hash=fake-test-hash',updateError:true});for(const id of ['recovery-password','recovery-confirm'])h.elements[id].value='Fake-test-only-123!';await h.elements['recovery-form'].submit({preventDefault(){}});assert.equal(h.elements['recovery-submit'].disabled,false);assert.match(h.elements['recovery-status'].textContent,/could not be completed/);assert.ok(!h.calls.includes('redirect'));});
test('weak or mismatched passwords are never submitted',async()=>{const h=await harness(updated,{search:'?type=recovery&token_hash=fake-test-hash'});h.elements['recovery-password'].value='short';h.elements['recovery-confirm'].value='short';await h.elements['recovery-form'].submit({preventDefault(){}});h.elements['recovery-password'].value='Fake-test-only-123!';await h.elements['recovery-form'].submit({preventDefault(){}});assert.ok(!h.calls.includes('updateUser'));});
test('recovery assets are same origin and page forbids unrelated connections',()=>{const path=require('node:path');const root=path.join(__dirname,'..');const html=fs.readFileSync(path.join(root,'reset-password.html'),'utf8');assert.match(updated,/from '\.\/vendor\/supabase-2\.117\.2\.js'/);assert.match(html,/script-src 'self'/);assert.match(html,/form-action 'none'/);assert.ok(!html.includes('style='));assert.ok(!fs.readFileSync(path.join(root,'reset-password.css'),'utf8').includes('http'));});

test('MFA account cannot update password before authenticator verification',async()=>{
 const h=await harness(updated,{search:'?type=recovery&token_hash=fake-test-hash',mfa:true});
 assert.equal(h.elements['recovery-form'].hidden,true);assert.equal(h.elements['recovery-mfa-form'].hidden,false);
 for(const id of ['recovery-password','recovery-confirm'])h.elements[id].value='Fake-test-only-123!';
 await h.elements['recovery-form'].submit({preventDefault(){}});assert.ok(!h.calls.includes('updateUser'));
 h.elements['recovery-code'].value='123456';await h.elements['recovery-mfa-form'].submit({preventDefault(){}});
 assert.equal(h.elements['recovery-code'].value,'');assert.equal(h.elements['recovery-mfa-form'].hidden,true);assert.equal(h.elements['recovery-form'].hidden,false);
 await h.elements['recovery-form'].submit({preventDefault(){}});assert.ok(h.calls.includes('updateUser'));
});
test('invalid authenticator code keeps password gated and allows another code',async()=>{
 const h=await harness(updated,{search:'?type=recovery&token_hash=fake-test-hash',mfa:true,mfaError:true});
 h.elements['recovery-code'].value='123456';await h.elements['recovery-mfa-form'].submit({preventDefault(){}});
 assert.equal(h.elements['recovery-code'].value,'');assert.equal(h.elements['recovery-form'].hidden,true);assert.equal(h.elements['recovery-verify'].disabled,false);assert.ok(!h.calls.includes('updateUser'));
});
test('successful MFA API response without AAL2 still fails closed',async()=>{
 const h=await harness(updated,{search:'?type=recovery&token_hash=fake-test-hash',mfa:true,noUpgrade:true});
 h.elements['recovery-code'].value='123456';await h.elements['recovery-mfa-form'].submit({preventDefault(){}});
 assert.equal(h.elements['recovery-form'].hidden,true);
});
test('assurance lookup failure never reveals password entry',async()=>{
 const h=await harness(updated,{search:'?type=recovery&token_hash=fake-test-hash',aalError:true});assert.equal(h.elements['recovery-form'].hidden,true);
});
test('unsupported factor does not downgrade security or enable password entry',async()=>{
 const h=await harness(updated,{search:'?type=recovery&token_hash=fake-test-hash',mfa:true,noFactors:true});assert.equal(h.elements['recovery-form'].hidden,true);assert.equal(h.elements['recovery-mfa-form'].hidden,true);assert.match(h.elements['recovery-status'].textContent,/not supported/);
});
