import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUTES, AUTHORITY_STATUSES, OMEGA_AUTHORITY,
  buildCraAccuracyStarter, reviewLetterDraft
} from '../omega-letter-governance.mjs';

const issue={
  description:'The report records a payment as 60 days late in February 2026.',
  evidence_notes:'The original statement and bank payment receipt show payment posted before the due date.'
};
const evidenceReference='CRA report dated 2026-10-01, line 4; February statement';
function valid(overrides={}) {
  const starter=buildCraAccuracyStarter({issue,evidenceReference});
  assert.equal(starter.ok,true);
  return {
    route:'cra_accuracy',actor:'cra',authorityStatus:'ACTIVE',
    evidenceReference,issue,
    recipientName:'Example Consumer Reporting Agency',
    recipientAddress:'100 Example Street, Example City, GA 30000',
    subject:'Dispute of a documented reporting error',
    body:starter.text,
    factsReviewed:true,authorityReviewed:true,
    recipientVerified:true,exactTextReviewed:true,...overrides
  };
}

test('Only a current, documented CRA accuracy route has a starter',()=>{
  assert.equal(OMEGA_AUTHORITY,'CRD-OMEGA-002');
  assert.equal(ROUTES.cra_accuracy.starterAllowed,true);
  for(const [route,meta] of Object.entries(ROUTES)) {
    assert(AUTHORITY_STATUSES.includes(meta.status));
    if(route!=='cra_accuracy')assert.equal(meta.starterAllowed,false);
  }
  assert.equal(buildCraAccuracyStarter({issue:{description:'undocumented'},evidenceReference}).ok,false);
});

test('Evidence-based CRA letter passes UI preflight only after all reviews',()=>{
  assert.equal(reviewLetterDraft(valid()).ok,true);
});

test('Missing evidence source and missing supporting notes fail closed',()=>{
  assert.equal(reviewLetterDraft(valid({evidenceReference:''})).ok,false);
  assert.equal(reviewLetterDraft(valid({issue:{...issue,evidence_notes:''}})).ok,false);
});

test('Recipient must be the actor assigned to the legal route',()=>{
  assert.equal(reviewLetterDraft(valid({actor:'furnisher'})).ok,false);
});

test('Nonactive legal statuses cannot be approved',()=>{
  for(const status of ['CONDITIONAL','PROPOSED','LEGACY','RETIRED','']) {
    assert.equal(reviewLetterDraft(valid({authorityStatus:status})).ok,false);
  }
});

test('Furnisher direct dispute, collector and identity-theft routes remain disabled',()=>{
  for(const [route,actor] of [
    ['furnisher_direct','furnisher'],
    ['collector_validation','collector'],
    ['identity_theft_block','cra'],
    ['cra_procedure_description','cra']
  ]) {
    assert.equal(reviewLetterDraft(valid({route,actor})).ok,false);
  }
});

test('A missing attestation blocks final approval',()=>{
  for(const flag of ['factsReviewed','authorityReviewed','recipientVerified','exactTextReviewed']) {
    assert.equal(reviewLetterDraft(valid({[flag]:false})).ok,false);
  }
});

test('Obsolete claims and unresolved nonstandard placeholders are held',()=>{
  assert.equal(reviewLetterDraft(valid({body:valid().body+'\nEstoppel by silence applies.'})).ok,false);
  assert.equal(reviewLetterDraft(valid({body:valid().body+'\n{{UNVERIFIED_PERSONAL_DATA}}'})).ok,false);
});

test('Admin UI invokes the preflight rather than only displaying a checklist',()=>{
  const html=readFileSync(new URL('../letter-desk.html',import.meta.url),'utf8');
  const js=readFileSync(new URL('../letter-desk.js',import.meta.url),'utf8');
  assert(html.includes('id="letter-evidence-reference"'));
  assert(html.includes('id="letter-current-law-reviewed"')===false);
  assert(js.includes('const review=reviewLetterDraft('));
  assert(js.includes('if (!review.ok)'));
  assert(js.includes('buildCraAccuracyStarter('));
  assert(!js.includes('Estoppel by silence'));
});
