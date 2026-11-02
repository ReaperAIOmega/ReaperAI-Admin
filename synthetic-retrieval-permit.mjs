// Test permit only: separate owner authorization, existing signed AAL2, already-human-approved v5.
import {blueprintArtifacts,readArtifact,transitionArtifact} from './funding-artifact-review.mjs';
export const syntheticRetrievalPermitEnabled=false;
export async function permitApprovedV5Retrieval(s,runtime,storage,{ownerAuthorized=false}={}){
 if(ownerAuthorized!==true||!runtime.staging||runtime.url!=='https://qemjnekgcbuddayzhdtr.supabase.co')throw Error('Separate owner-authorized isolated test required');
 const who=await s.auth.getUser(),aal=await s.auth.mfa.getAuthenticatorAssuranceLevel();
 if(who.error||who.data?.user?.id!=='ab89e54c-bf1f-4572-bc01-493b476687b9'||aal.error||aal.data?.currentLevel!=='aal2')throw Error('Designated signed AAL2 administrator required');
 const snapshots=await Promise.all(Object.keys(blueprintArtifacts).map(kind=>readArtifact(s,runtime,storage,kind)));
 for(const a of snapshots)if(!['APPROVED','DELIVERY_ELIGIBLE'].includes(a.state)||!/^[a-f0-9]{64}$/.test(a.approval_sha256??'')||a.synthetic_retrieval_allowed!==true)throw Error('Both exact human approvals and the server synthetic permit are required');
 const results=[];
 for(const a of snapshots){
  if(a.state==='APPROVED')await transitionArtifact(s,runtime,a,'DELIVERY_ELIGIBLE','Owner separately authorized bounded synthetic retrieval tests. Technical test permit only; no financing or commercial delivery.',{humanConfirmed:ownerAuthorized});
  const current=await readArtifact(s,runtime,storage,a.kind);
  if(current.state!=='DELIVERY_ELIGIBLE'||current.approval_sha256!==a.approval_sha256||current.storage_current!==true)throw Object.assign(Error('Synthetic permit outcome unverified; reread existing version'),{outcome:'UNKNOWN'});
  results.push({artifact_id:current.artifact_id,state:current.state,revision:current.revision,sha256:current.sha256});
 }
 return {signed_http:true,observed_at:new Date().toISOString(),results,human_approval_created:false,delivery_claimed:false};
}
