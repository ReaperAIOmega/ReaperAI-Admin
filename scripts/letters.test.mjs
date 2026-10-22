import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const read=(name)=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('Admin exact letter approval and provider-confirmed queue',()=>{
  const html=read('letter-desk.html'),js=read('letter-desk.js'),nav=read('navbar-admin.html');
  assert(nav.includes('href="letter-desk.html"'));
  assert(html.includes('letter-authorization-form')&&html.includes('letter-mail-queue'));
  assert(js.includes("from('letter_authorizations').insert(payload)"));
  assert(js.includes("status:'submitted_to_letterstream'"));
  assert(js.includes('provider_job_id:jobId'));
  assert(js.includes('provider_confirmed_at:new Date().toISOString()'));
  assert(js.includes("client_id:el('letter-client').value"));
  assert(js.includes("profile.role!=='admin'"));
  assert(!js.includes('fetch(\'https://www.letterstream.com'));
});