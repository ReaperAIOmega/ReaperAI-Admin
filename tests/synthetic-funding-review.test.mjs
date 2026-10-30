import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = p => readFileSync(new URL('../'+p, import.meta.url), 'utf8');
const js = read('funding-artifact-review.js');
const docs = read('documents.html');
const records = read('admin-records.js');
const review = read('funding-artifact-review.html');

test('synthetic funding review JavaScript parses and stays restricted to staging', () => {
  // parse without executing browser-dependent entrypoint
  new Function(js);
  assert.match(js, /STAGING_URL = 'https:\/\/qemjnekgcbuddayzhdtr\.supabase\.co'/);
  assert.match(js, /location\.hostname/);
  assert.match(js, /ctx\.profile\?\.role === 'admin'/);
  assert.match(js, /getAuthenticatorAssuranceLevel/);
  assert.match(js, /aal\?\.currentLevel !== 'aal2'/);
  assert.match(js, /auth\.getUser\(\)/);
  assert.match(js, /getUser\(\)/);
});
test('localhost staging login and AAL2 guard do not silently reuse production', () => {
  const guard = read('auth-guard.js');
  const login = read('auth-login.js');
  for (const src of [guard, login]) {
    assert.match(src, /window\.location\.protocol === 'http:'/);
    assert.match(src, /\['localhost', '127\.0\.0\.1'\]\.includes\(window\.location\.hostname\)/);
    assert.match(src, /window\.location\.port === '4174'/);
    assert.match(src, /STAGING_LOOPBACK\s*\? 'https:\/\/qemjnekgcbuddayzhdtr\.supabase\.co'/);
    assert.match(src, /: 'https:\/\/itswbmjvuxumfjqkkqgx\.supabase\.co'/);
    assert.match(src, /STAGING_LOOPBACK\s*\? 'sb_publishable_/);
    assert.doesNotMatch(src, /service_role|sb_secret_/);
  }
  assert.match(guard, /STAGING_LOOPBACK \? '\/login\.html'/);
  assert.match(guard, /STAGING_LOOPBACK \? '\/mfa-challenge\.html'/);
  assert.match(guard, /STAGING_LOOPBACK \? '\/mfa-enroll\.html'/);
  assert.match(login, /if \(STAGING_LOOPBACK\) return;/);
  assert.match(login, /resetButton\.disabled = true;/);
});

test('approval requires explicit inspected bytes and exact-version binding', () => {
  assert.match(js, /crypto\.subtle\.digest\('SHA-256', await selected\.arrayBuffer\(\)\)/);
  assert.match(js, /selected\.size !== data\.bytes/);
  assert.match(js, /digest !== data\.sha256/);
  assert.match(js, /I personally opened and inspected this exact file/);
  assert.match(js, /matches\.get\(target\.id\) === data\.sha256/);
  assert.match(js, /read_funding_artifact_upload/);
  assert.match(js, /transition_funding_artifact/);
  assert.match(js, /p_expected_revision: data\.revision/);
  assert.match(js, /p_expected_sha256: data\.sha256/);
  assert.match(js, /p_notes: notes\.value\.trim\(\)/);
  assert.match(js, /response\.revision !== data\.revision \+ 1/);
  assert.doesNotMatch(js, /DELIVERY_ELIGIBLE|CLIENT_ACKNOWLEDGED|createSignedUrl|\.storage\.from\(/);
});
test('generic documents view cannot approve canonical funding artifacts', () => {
  new Function(records);
  assert.match(records, /function isCanonicalFundingArtifact/);
  assert.match(records, /if \(isCanonicalFundingArtifact\(r\)\)/);
  assert.match(records, /wrap\.append\(label\);\s*return wrap;/);
  assert.doesNotMatch(records, /review_status,review_notes/);
  assert.doesNotMatch(records, /review_notes:/);
  assert.match(records, /data\?\.length !== 1/);
  assert.match(records, /reviewLink\.hidden/);
});
test('review route is linked in admin and never an unconditional release', () => {
  assert.match(docs, /id="synthetic-artifact-review-link"[^>]*hidden>/);
  assert.match(review, /Synthetic Funding Artifact Review/);
  assert.match(review, /funding-artifact-review\.js/);
  assert.match(review, /No customer release/);
});
