# Synthetic Funding Review — Windows acceptance runbook

**Status:** Review-only development guidance. No production deployment, payments, lender contact or customer delivery authorized. All identities, funding figures and files below are fictional fixtures.

## Preflight

1. Keep the existing Core PR #32, Admin PR #7 and Portal PR #3 unmerged. Record the exact commit SHA and ensure a clean working tree before syncing the PR candidates into a **separate staging checkout**. Never overwrite local uncommitted HP work.
2. The loopback staging server uses `127.0.0.1:4185` for Admin and `127.0.0.1:4173` for Portal. Run only from a local trusted HP account; do not expose the bind address or relax the host/CSP restrictions.
3. Have the core and Admin checkout directories as siblings. From the Core checkout use `python scripts/staging_app_server.py Admin` only after verifying that the sibling Admin folder contains the new PR files and a nonsecret staging configuration prerequisite (`runtime-config.mjs`). This server requires the local file to exist; do not put any `service_role`, `sb_secret_` or other server secrets in that file.
4. The PR #7 `auth-guard.js` and `auth-login.js` use staging Supabase **only** when protocol is `http:`, hostname is `localhost` or `127.0.0.1`, and port is exactly `4185`. All other origins continue to use production and are **not** valid for synthetic review. Do not copy staging behavior to production.

## Browser acceptance

1. Open `http://127.0.0.1:4185/login.html`; verify developer tools show all Auth/PostgREST requests going only to `qemjnekgcbuddayzhdtr.supabase.co` (staging). **STOP** if any browser requests to production `itswbmjvuxumfjqkkqgx.supabase.co` are observed.
2. Sign in with the existing fictional staging administrator account; do not reveal credentials, tokens, MFA seeds or cookies in screenshots or logs.
3. Verify account role `admin`, active status and MFA **AAL2**. AAL1 must not enable review. Test logout and session expiry; changes after expiry must fail closed.
4. Open `/documents.html`. It should display six existing synthetic document metadata rows rather than `Unavailable`. On a canonical `funding-document` row, generic **Open**, **Approve**, and **Request changes** are unavailable; direct browser Storage signed URLs must remain blocked.
5. Follow the link `Open synthetic funding exact-version review` to `/funding-artifact-review.html`. The two named artifacts must appear with state `REVIEW_REQUESTED`, revision 2 and the exact canonical SHA-256.

## Independent file inspection

- PDF: `7abc1508-9508-452f-995f-f5870fd32a06.pdf` SHA-256 `b5495f0042f6054c8c004b201a94301cebfb9bd306e23c8e1f5a8920340b6b3f`.
- XLSX: `82b109c6-1fb2-49a9-a179-e9aea8ab8807.xlsx` SHA-256 `f69642a2d2d9dc95f4ac431b22928da23fb1c316872213015aade4d83c9c4175`.

Use the authorized Supabase dashboard's restricted staging download facility; generic app signed URLs are intentionally prohibited for canonical funding artifacts.

On Windows, for the **original downloaded file**:
```powershell
Get-FileHash -LiteralPath "C:\path\to\your\downloaded-file.xlsx" -Algorithm SHA256
```
Verify the full 64-character hash exactly, not only the prefix. Inspect the PDF page disclosures.

Open the XLSX in **desktop Microsoft Excel** and force full recalc (Ctrl+Alt+Shift+F9). Check `Funding model!B22:B23` = 41 and 16, `F29:F34` = 43/19/0/0/0/0, `H29:H34` = 68/44/20/8/8/20, all scenarios, PMT amounts, and every tab for `#VALUE!` or other formula errors. Use a **separate copy** for Excel recalc/save; saving may change the workbook bytes and invalidate its canonical hash. If results are wrong, stop and regenerate a new immutable artifact rather than approving the original.

## Owner's authenticated approval

After personally opening and inspecting the **original exact files**, choose each in the new browser review page and verify local SHA-256. A changed file selection must clear the prior match and personal-review checkbox.

Enter explicit notes and check the acknowledgement for each file. The page must require two separate transitions, under AAL2 and a fresh revision/hash match:

1. `REVIEW_REQUESTED → REVIEWED`
2. `REVIEWED → APPROVED`

No customer delivery eligibility is granted by either transition. Do **not** use generic `public.documents.review_status` to stand in for canonical approval.

## Postconditions and negatives

Use a **read-only** staging Supabase SQL check; do not issue manual UPDATEs to approval fields:

```sql
SELECT id, kind, state, revision, reviewed_by, reviewed_at, approved_by, approved_at,
       expected_sha256, approval_sha256
FROM private.funding_artifact_versions
WHERE id IN ('7abc1508-9508-452f-995f-f5870fd32a06',
             '82b109c6-1fb2-49a9-a179-e9aea8ab8807')
ORDER BY kind;
```

Require both records to be `APPROVED` with nonnull signed reviewer/approver identity and approval digest. Ensure `private.funding_synthetic_delivery_controls.enabled = false` until a **separately authorized** synthetic retrieval test. Test AAL1, unrelated client, wrong hash, stale revision, stale source and direct private Storage access all fail closed.

**STOP / NO-GO:** project mismatch, missing native Excel validation, document hash mismatch, approval mismatch, unauthorized read, leakage of credentials, or any production effect.
