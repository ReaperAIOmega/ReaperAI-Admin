/*
 * REAPER OMEGA — bounded letter preflight (draft)
 * Registry authority: CRD-OMEGA-002, v2.0.0 (2026-10-02 registry audit).
 *
 * The canonical prompt bytes/hash have NOT been imported into this repository.
 * This module implements a narrow evidence-first preflight; it is not the
 * complete letter corpus, legal advice, or a replacement for server checks.
 *
 * Do not use this as sole authorization enforcement. The production RPC,
 * RLS and immutable approved letter snapshot remain the security boundary.
 * No automatic send, payment, mailing, or legal-threat generation.
 */

export const OMEGA_GOVERNANCE_VERSION = '0.1.0-review';
export const OMEGA_AUTHORITY = 'CRD-OMEGA-002';

export const AUTHORITY_STATUSES = Object.freeze([
  'ACTIVE', 'CONDITIONAL', 'PROPOSED', 'LEGACY', 'RETIRED'
]);

export const ROUTES = Object.freeze({
  cra_accuracy: Object.freeze({
    label: 'CRA — documented accuracy dispute',
    actor: 'cra',
    status: 'ACTIVE',
    starterAllowed: true,
    statutoryReference: '15 U.S.C. § 1681i(a)',
    purpose: 'Consumer disputes a specific inaccurate or incomplete report item'
  }),
  cra_procedure_description: Object.freeze({
    label: 'CRA — procedure description (manual review)',
    actor: 'cra',
    status: 'CONDITIONAL',
    starterAllowed: false,
    statutoryReference: '15 U.S.C. § 1681i(a)(7)',
    purpose: 'Requires proof of prior reinvestigation and an eligible request'
  }),
  furnisher_direct: Object.freeze({
    label: 'Furnisher — direct dispute (manual review)',
    actor: 'furnisher',
    status: 'CONDITIONAL',
    starterAllowed: false,
    statutoryReference: '15 U.S.C. § 1681s-2(a)(8); 12 C.F.R. § 1022.43',
    purpose: 'Requires applicability and CRO exclusion screening'
  }),
  collector_validation: Object.freeze({
    label: 'Debt collector — validation (manual review)',
    actor: 'collector',
    status: 'CONDITIONAL',
    starterAllowed: false,
    statutoryReference: '15 U.S.C. § 1692g',
    purpose: 'Requires collector status, notice and timing evidence'
  }),
  identity_theft_block: Object.freeze({
    label: 'CRA — identity-theft block (manual review)',
    actor: 'cra',
    status: 'CONDITIONAL',
    starterAllowed: false,
    statutoryReference: '15 U.S.C. § 1681c-2',
    purpose: 'Requires actual identity-theft evidence and reporting eligibility'
  })
});

const clean = (value) => String(value ?? '').trim();
const HOLD_FOR_REVIEW = [
  /estoppel\s+by\s+silence/i,
  /silence\s+(?:is|constitutes|means)\s+(?:an?\s+)?admission/i,
  /(?:no|without)\s+(?:signed\s+)?contract\s*(?:means|requires|=|proves)\s*(?:automatic\s+)?deletion/i,
  /guaranteed\s+deletion/i,
  /(?:delete|remove)\s+(?:this|the)\s+item\s+(?:within\s+\d+\s+days\s+)?or\s+(?:i|we)\s+will\s+sue/i
];
const ALLOWED_PLACEHOLDERS = new Set([
  'CLIENT_NAME', 'CLIENT_ADDRESS', 'RECIPIENT_NAME', 'RECIPIENT_ADDRESS', 'DATE'
]);

export function buildCraAccuracyStarter({issue, evidenceReference} = {}) {
  const facts = clean(issue?.description);
  const evidence = clean(issue?.evidence_notes);
  const source = clean(evidenceReference);
  if (facts.length < 15 || evidence.length < 12 || source.length < 8) {
    return {ok:false, error:'A specific disputed fact, supporting evidence notes and source reference are required.'};
  }
  const text = [
    '{{CLIENT_NAME}}',
    '{{CLIENT_ADDRESS}}',
    '',
    '{{DATE}}',
    '',
    '{{RECIPIENT_NAME}}',
    '{{RECIPIENT_ADDRESS}}',
    '',
    'Re: Request for reinvestigation of specifically disputed report information',
    '',
    'To whom it may concern:',
    '',
    'I dispute the accuracy or completeness of the following information appearing in my consumer report:',
    facts,
    '',
    'The supporting information I have identified is:',
    evidence,
    'Document or report reference: '+source,
    '',
    'Please conduct a reasonable reinvestigation of the specific disputed information, provide me with the results, and make any correction required by applicable law.',
    '',
    'Sincerely,',
    '{{CLIENT_NAME}}'
  ].join('\n');
  return {ok:true,text,route:'cra_accuracy',authority:OMEGA_AUTHORITY};
}

/**
 * Review of an administrator-authored exact snapshot only.
 * Server-side authorization must separately enforce identity/ownership.
 */
export function reviewLetterDraft(input = {}) {
  const errors = [];
  const route = ROUTES[clean(input.route)];
  const actor = clean(input.actor);
  const authorityStatus = clean(input.authorityStatus);
  const fact = clean(input.issue?.description);
  const notes = clean(input.issue?.evidence_notes);
  const evidenceReference = clean(input.evidenceReference);
  const body = clean(input.body);
  const recipientName = clean(input.recipientName);
  const recipientAddress = clean(input.recipientAddress);
  const subject = clean(input.subject);

  if (!route) errors.push('Select a governed correspondence route.');
  else {
    if (!route.starterAllowed) errors.push('This route requires separate documented legal review; template authorization is not enabled.');
    if (route.actor !== actor) errors.push('Recipient actor must match the correspondence route.');
  }
  if (authorityStatus !== 'ACTIVE' || (route && route.status !== 'ACTIVE')) {
    errors.push('Only a route with currently ACTIVE, verified authority can pass this release gate.');
  }
  if (fact.length < 15 || fact.length > 2000) errors.push('Specify the exact disputed reporting fact (15–2000 characters).');
  if (notes.length < 12 || notes.length > 2500) errors.push('Record the supporting evidence and contradiction (12–2500 characters).');
  if (evidenceReference.length < 8 || evidenceReference.length > 400) errors.push('Provide a traceable evidence/report source reference.');
  if (recipientName.length < 2 || recipientAddress.length < 10) errors.push('Verify the recipient name and full postal address.');
  if (subject.length < 3 || subject.length > 240) errors.push('Provide a valid subject.');
  if (body.length < 50 || body.length > 12000) errors.push('Review a complete letter within the permitted length.');
  if (!input.factsReviewed || !input.authorityReviewed || !input.recipientVerified || !input.exactTextReviewed) {
    errors.push('Complete every independent evidence, authority, recipient and exact-text review attestation.');
  }

  // The database RPC resolves only these approved fields. Catch unknown
  // placeholders before granting a client permission to generate a snapshot.
  for (const match of body.matchAll(/\{\{([^}]+)\}\}/g)) {
    if (!ALLOWED_PLACEHOLDERS.has(match[1])) {
      errors.push('Unknown document placeholder: '+match[1]);
    }
  }
  if (HOLD_FOR_REVIEW.some(pattern => pattern.test(body))) {
    errors.push('The letter contains an unsupported automatic-deletion or coercive-threat assertion.');
  }
  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze([...new Set(errors)]),
    route: route ? clean(input.route) : null,
    governanceVersion: OMEGA_GOVERNANCE_VERSION,
    authority: OMEGA_AUTHORITY
  });
}
