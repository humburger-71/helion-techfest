# HELION 2027 — paid Early Access

The existing individual waitlist form and validation remain in place. SQLite is the sole source of truth. Google Sheets is an optional mirror; editing it cannot verify a payment or create an Interest ID.

## Run and verify

Use Node.js 22.5+ (deployment remains configured for Node 22), then:

```sh
npm ci
npm start
npm test
npm run build
npm run test:browser
```

The site runs at http://127.0.0.1:3000 and the admin interface at /admin. The build checks JavaScript syntax and creates an explicit public-asset allowlist in dist/. There is no framework bundler. Browser checks use an isolated temporary SQLite database and mocked email/Sheets delivery, never the production database. On Windows they use installed Microsoft Edge. Elsewhere install Playwright Chromium (`npx playwright install chromium`), or set HELION_BROWSER_CHANNEL to an installed supported browser channel. Screenshots go into ignored artifacts/.

The root project is canonical. The existing helion-techfest/ nested Git checkout contains matching payment implementation files so running either copy cannot bypass payment verification. Each copy must point HELION_DB_PATH to the SAME durable database if both are ever operated; preferably deploy only the root. The nested checkout is tracked as a Git link: its file changes must be committed there separately before recording an updated link in the parent repository. No commits are created automatically.

## Configuration

Copy .env.example to .env locally, or configure server environment variables on your durable backend host. Never commit populated environment files. Existing Google credentials remain unchanged.

| Variable | Purpose |
| --- | --- |
| HELION_DB_PATH | Existing SQLite database on a persistent local disk; absolute path recommended. |
| HELION_UPI_ID | Actual HELION receiving UPI ID. Required to accept new applications. No ID is hard-coded. |
| HELION_UPI_PAYEE_NAME | Payee displayed in the UPI instruction; default HELION. |
| HELION_EARLY_ACCESS_AMOUNT | INR amount, default 19. Positive, at most two decimal places. |
| HELION_ADMIN_USERNAME | Username for the single minimal admin account. |
| HELION_ADMIN_PASSWORD_HASH | Salted scrypt password hash, generated as described below. |
| EMAIL_HOST | Transactional SMTP host. |
| EMAIL_PORT | SMTP port, default 587 with required STARTTLS; 465 uses implicit TLS. |
| EMAIL_USER / EMAIL_PASSWORD | SMTP authentication credentials. |
| EMAIL_FROM | Verified sender address, for example HELION <hello@your-domain.example>. |
| HELION_PUBLIC_ORIGIN | Exact public frontend origin, e.g. https://your-site.vercel.app. Set in production for origin validation. |
| HELION_COOKIE_SECURE | true on HTTPS; also enforced automatically when NODE_ENV=production. |
| HELION_TRUST_PROXY | false by default. Set true only behind a proxy that overwrites client address headers. |
| HELION_BACKEND_ORIGIN | Vercel only: HTTPS origin of the persistent Node backend. Never point to the Vercel frontend itself. |
| HELION_PROXY_SECRET | Same long random secret on Vercel and the backend; required operationally when trusting the Vercel proxy. Backend API rejects requests without it when configured. |
| RATE_LIMIT_SALT | Existing long random server-only value for requester hashing. |
| GOOGLE_SHEETS_SPREADSHEET_ID | Existing spreadsheet ID. |
| GOOGLE_SHEETS_SHEET_NAME | Existing worksheet name, default Interests. |
| GOOGLE_SERVICE_ACCOUNT_EMAIL | Existing service-account email. |
| GOOGLE_PRIVATE_KEY | Existing private key, supporting escaped newlines. |

Set the receiving UPI ID in HELION_UPI_ID on the backend, then restart it. Amount, payee and UPI ID are snapshotted on each new application so later configuration changes cannot silently alter an outstanding payment instruction. Browser-supplied amounts, IDs and paid flags are ignored. Do not remove an old receiving account until outstanding payments to it have been reconciled.

## Admin setup and manual verification

Run `npm run admin:password` in an interactive terminal. It asks for a password without echoing it and outputs only a salted hash. Store the hash in HELION_ADMIN_PASSWORD_HASH and set HELION_ADMIN_USERNAME. There are no default admin credentials. Use HTTPS in production.

Open /admin, log in, and inspect the pending payments. The list includes names, all stored member emails, the existing team size, receiving UPI ID, amount, transaction reference, submission times and status. New applications still use team size 1; old member data is preserved.

Compare the reference, amount and receiving account with the actual UPI account transaction history. Click Confirm Payment only after verifying that transfer. Reject Payment leaves the application unconfirmed. Rejected applicants can submit a new reference on the same application; all previously submitted references remain reserved to prevent reuse. Admin actions include the reference currently displayed, so a stale page cannot approve a newly resubmitted reference without review.

Admin sessions are random HttpOnly, SameSite=Strict cookies; only token hashes are stored in SQLite. Sessions expire after eight hours and logout revokes them. Credential rotation should also revoke existing sessions (`DELETE FROM admin_sessions` using an authorized database maintenance tool), or wait for their expiry. Login and submission rate limits are stored in SQLite. Production cookies are Secure. JSON-only mutations and origin validation protect against cross-site requests. Participant endpoints use a separate unguessable session cookie, never a browser-supplied application ID for ownership.

## Final participant flow

1. Open the existing waitlist form and submit the existing fields.
2. SQLite saves payment_pending with a NULL Interest ID and the server-defined amount (default ₹19).
3. The same dialog shows the amount, configured UPI ID, Open UPI app link and a runtime-generated QR.
4. Pay using any UPI app, then enter the transaction/reference ID (8–35 letters or digits).
5. SQLite stores the reference and changes status to pending_verification. The screen says Payment Submitted and Pending verification. There is no official Interest ID yet.
6. Admin checks actual receiving-account history and confirms or rejects.
7. Confirmation atomically changes status to paid, generates one HLN- followed by 32 uppercase hexadecimal characters, records verified_at and verified_by, and sets early_access_confirmed=1.
8. Google Sheets synchronization and confirmation email are queued in that same transaction. The participant can check status in the dialog and receives the ID by email.

The QR is generated server-side by qrcode.toDataURL from `upi://pay?pa=<configured ID>&pn=<configured name>&am=19.00&cu=INR`. It is a real PNG QR, not a static image. It only instructs payment; it never verifies it. Never collect UPI PINs, OTPs or banking credentials.

Refreshes and repeated submissions in the same browser resume the existing application through a 90-day HttpOnly application cookie. Keep cookies enabled. Clearing cookies or switching devices removes that browser's access; submitting the same email then produces a duplicate message, not access to someone else's application. Contact HELION for recovery; cross-device account recovery is outside this minimal implementation.

## Database changes and migration

Back up the existing SQLite database before deployment (use a SQLite-aware backup, or stop the process before copying the database and WAL files). Startup applies additive, transactional migrations; it does not delete existing records.

The existing interest_teams table gains payment_status, amount_paise (integer), application_token_hash, upi_id, payee_name, upi_reference, payment_submitted_at, verified_at, verified_by and early_access_confirmed. The existing id, applicant fields, submitted_at, members and interest_id format remain unchanged. New records have NULL interest_id until payment confirmation. payment_status is one of payment_pending, pending_verification, paid, rejected, or legacy.

Existing records retain their original IDs and are marked legacy, with early_access_confirmed=0. No historical payment is fabricated, no legacy email is sent, and no existing ID is regenerated. Historical free signups are not silently granted the new paid Early Access status. Review them separately if you later choose a grandfathering policy.

New supporting tables (not a second waitlist):

- payment_references: globally unique normalized references, including rejected references, linked to the existing application.
- payment_audit: confirm/reject/email-retry action, admin identity, reference and timestamp.
- admin_sessions: hashed session tokens, username and expiry.
- confirmation_email_outbox: delivery status, attempt count, next attempt, started/sent timestamps and sanitized failure information.

Indexes enforce unique application token hashes and transaction references and support payment-status filtering. The existing sheet_sync_outbox remains in use. Confirmation runs under BEGIN IMMEDIATE: repeat or concurrent confirmation never creates another ID or another outbox entry. Rejection does not enqueue email or Sheets confirmation.

## Email and Google Sheets delivery

Nodemailer sends a plain-text transactional SMTP email containing payment verification, Early Access confirmation, the official ID, keep-it-safe instructions, and special perks/early updates wording. There is no fixed future discount. SMTP credentials live only on the backend. Configure a verified sender and your provider's domain authentication before launch.

SMTP setup is optional. If SMTP settings are blank, payment confirmation and Interest ID generation still succeed; email stays pending with no failed attempts. Configure SMTP and restart the backend later to send queued confirmations. Email is claimed atomically before delivery. sent emails are not re-sent by repeat confirmation. Failures are recorded and retried every five minutes by the long-running process; the admin can also choose Retry confirmation email. Payment remains paid even if delivery fails. If the process terminates during an SMTP send, the outbox stays sending: after ten minutes an admin can inspect SMTP history and explicitly acknowledge possible duplicate delivery before retrying. SMTP does not support an exactly-once delivery transaction with SQLite; an ambiguous network failure can still result in duplicate delivery. The official ID stays identical, including in retries.

Confirmed applications append to the existing seven-column Sheets layout: Interest ID | Submitted At | Name | Email | Mobile Number | Grade (2027-28) | Age at Signup. Share the worksheet with the service account as an editor. Pending applications do not enter this confirmed mirror. Sheets gets the ID already generated in SQLite and never generates or verifies one itself.

Sheets failure leaves SQLite and the sync outbox intact. The existing minute-based retry worker and `npm run sync:interests` remain available. Sheets append retries retain the existing at-least-once behavior: after an ambiguous response or overlapping retry workers, a duplicate mirror row is possible; reconcile by the same authoritative Interest ID. Run only one retry worker. Editing or deleting sheet rows cannot change payment state.

`npm run export:interests` retains the seven-column CSV format and exports records with IDs (paid and historical legacy records), excluding pending applications. Pending payment information is available in the protected admin interface.

## Vercel deployment

SQLite must not run in a Vercel Function's temporary filesystem.

1. Deploy the root Node service to a host with persistent local disk, using npm ci --omit=dev and npm start. Set HELION_DB_PATH to the existing durable database. Use one backend deployment with its background retry workers; do not start competing copies against different files.
2. Configure payment, admin, SMTP and existing Google variables on that backend. Set NODE_ENV=production, HELION_PUBLIC_ORIGIN to the public Vercel domain, HELION_TRUST_PROXY=true, and a long random HELION_PROXY_SECRET. Ensure the hosting proxy preserves the trusted client address sent by Vercel, or applies an equivalent trusted-client-IP configuration. Restrict direct backend access where possible.
3. On Vercel, use the root project, npm run build, and output directory dist (already configured). Set HELION_BACKEND_ORIGIN and the SAME HELION_PROXY_SECRET. Do not put SMTP or Google credentials on the frontend. .vercelignore excludes environment files, databases and the nested distribution copy from upload.
4. api/interests.mjs and api/[...path].mjs proxy the existing submission route and the new application/admin routes to that backend. Cookies and responses are forwarded, and the old direct-to-Sheets/instant-ID implementation is removed. /admin serves the new admin page.
5. Redeploy Vercel and restart the backend together. Check the public origin, Secure cookies, login and a real receiving-account transfer before accepting participants. An unconfigured backend/UPI ID returns an unavailable message and does not create an application.

No live payments, external emails or deployment are performed by automated tests. Verify your actual UPI account, SMTP acceptance/delivery and Vercel-to-backend connectivity after configuring them.
