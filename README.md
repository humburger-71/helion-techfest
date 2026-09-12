# HELION 2027 waitlist

The existing form, individual signup validation, INR 19 UPI payment, manual verification and Interest ID format are preserved. The Vercel API now connects directly to Turso, a hosted SQLite-compatible database. No separate backend host is required.

## Deploy on Vercel

1. Push this code to the repository and branch used by the helion-techfest Vercel project.
2. Add the following environment variables to Vercel **Production**:

```dotenv
TURSO_DATABASE_URL=your-database-url
TURSO_AUTH_TOKEN=your-database-token
HELION_UPI_ID=your-real-receiving-upi-id
HELION_UPI_PAYEE_NAME=HELION
HELION_EARLY_ACCESS_AMOUNT=19
HELION_ADMIN_USERNAME=your-admin-username
HELION_ADMIN_PASSWORD_HASH=your-salted-password-hash
HELION_PUBLIC_ORIGIN=https://heliontech.in
RATE_LIMIT_SALT=your-long-random-secret
```

3. Remove obsolete HELION_BACKEND_ORIGIN and HELION_PROXY_SECRET variables. Direct Vercel requests do not use a backend proxy. You do not need HELION_DB_PATH on Vercel.
4. Redeploy. Keep the existing build command `npm run build` and output directory `dist`.
5. Visit `https://heliontech.in/api/health`. A working database returns `{"status":"ok","application":"HELION"}`.
6. Test the form, submit a UPI reference, and log in at `https://heliontech.in/admin` to verify the receiving-account transfer.

Vercel sets Secure cookies automatically in this runtime. Its trusted client-address header is used for rate limiting. HELION_PUBLIC_ORIGIN must match the exact public site origin; use corresponding environment settings for a separate preview domain.

SQLite files are never written into Vercel's temporary filesystem. Turso holds all authoritative participant records, payment references, admin sessions, confirmation IDs, audit entries and delivery queues. Google Sheets remains an optional mirror of confirmed participants, not a payment-verification mechanism.

## Local setup

Use Node.js 22.5 or newer, install with `npm ci`, and keep secrets in ignored `.env`.

```sh
npm start
npm run db:setup
npm test
npm run build
npm run test:browser
```

When TURSO_DATABASE_URL is configured locally, `npm start` uses that Turso database too. Without it, local development continues to use HELION_DB_PATH (default data/helion.sqlite). Both modes use the same handlers and schema. Local SQLite data is not automatically uploaded to Turso.

`npm run db:setup` checks the configured Turso connection and creates/migrates the schema without adding participants or sending messages. The API also initializes the schema on its first request. Existing records and IDs are preserved; an empty database gets the required tables automatically. The helion_schema marker avoids repeating migrations on every cold start.

The root project is canonical. Matching implementation files are maintained in the existing helion-techfest/ nested Git checkout. It is tracked as a Git link, so changes there must be committed separately before updating the parent link. Prefer deploying the root. No commits or deployments are performed automatically.

## Admin and optional email

Run `npm run admin:password` in an interactive terminal. Enter a password of at least 16 characters; input is hidden. Store the generated salted scrypt hash as HELION_ADMIN_PASSWORD_HASH, and set HELION_ADMIN_USERNAME. There are no default credentials.

At /admin, compare each submitted reference, amount and receiving UPI ID with the actual receiving-account history, then confirm or reject. Merely entering a reference never proves payment. Confirmation runs inside a write transaction, creates one authoritative HLN- ID followed by 32 uppercase hexadecimal characters, activates the waitlist status and queues confirmation delivery. Repeated or concurrent confirmation cannot create another ID or another delivery-queue entry. Stale admin actions cannot confirm a newly resubmitted reference without reviewing it.

Admin sessions expire after eight hours. Logout revokes them. After changing credentials, revoke existing sessions through authorized database maintenance or let them expire.

SMTP setup is optional. Leave these blank until ready:

```dotenv
EMAIL_HOST=
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASSWORD=
EMAIL_FROM=
```

Port 587 requires STARTTLS; 465 uses implicit TLS. Configure a verified sender. When SMTP is absent, confirmation succeeds and email stays pending without failed attempts. Emails contain payment verification, the official Interest ID, keep-it-safe instructions, special perks and early updates. No fixed future discount is offered.

## Google Sheets and retrying delivery

Keep the existing GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SHEETS_SHEET_NAME, GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY variables in Vercel to continue the Sheets mirror. Share the worksheet with the service account as an editor. Missing Google configuration does not prevent saving or confirming an application.

Only confirmed applications are appended to the existing seven-column layout: Interest ID | Submitted At | Name | Email | Mobile Number | Grade (2027-28) | Age at Signup. Sheets always receives the ID already generated in the database. Editing a sheet cannot mark anyone paid.

Initial email and Sheets delivery are attempted during admin confirmation. A failure does not undo payment or remove the ID. In Vercel, use **Retry queued deliveries** in /admin to attempt due emails and Sheets syncs, up to five of each per click. Individual failed/pending emails also have a retry action. The local long-running server retains its minute-based retry workers; those timers do not run in Vercel Functions. There is no automatic scheduled Vercel retry job configured.

Email claims are atomic. Successfully sent emails are not re-sent by another confirmation. If a function terminates mid-send, the email remains sending. After ten minutes, an admin can check SMTP history and explicitly acknowledge possible duplicate delivery before retrying. SMTP has no exactly-once transaction with the database; ambiguous delivery failures can still result in a repeated message with the same ID.

Sheets retries retain the previous at-least-once behavior. An ambiguous append response or overlapping retry workers can produce duplicate mirror rows; reconcile by Interest ID and avoid running competing retry jobs. Payment state and IDs remain authoritative in Turso.

`npm run sync:interests` retries due Sheets entries in Turso when configured, or in the local database otherwise. `npm run export:interests` exports paid and legacy records using the existing seven-column CSV format. `--db path/to/file.sqlite` explicitly exports a local file instead. Pending applications remain visible in admin.

## Payment state and security

The participant flow is: existing form -> payment_pending -> INR 19 dynamic QR -> transaction reference -> pending_verification -> admin confirms -> paid -> Interest ID and email. Rejection leaves the application unconfirmed and allows a new reference on the same application.

The amount, receiving UPI ID and payee are snapshotted when an application is created. Changing configuration affects new applications, not outstanding instructions. The runtime QR is generated by qrcode.toDataURL from a standard UPI URI containing pa, pn, am and cu=INR. It does not report whether payment succeeded.

Participant ownership uses a separate random 90-day HttpOnly session cookie; the database stores only its hash. Refreshing or reopening the dialog restores the saved state. Clearing cookies or switching devices loses that session; duplicate email checks do not grant access to someone else's application. There is no self-service cross-device recovery in this minimal flow.

The existing interest_teams and interest_members tables remain authoritative. Added payment fields track status, amount in paise, receiving account, reference, submission/verification timestamps, verifier identity and confirmation status. payment_references globally reserves normalized references, including rejected ones. payment_audit records admin decisions. admin_sessions stores hashed tokens. confirmation_email_outbox and the existing sheet_sync_outbox track delivery.

Historical records retain their IDs as legacy entries. They are not falsely marked paid or sent new confirmation emails. Imported older databases receive additive schema changes. No new application receives an Interest ID before verified payment.

All writes use parameter binding. Mutations require JSON and valid request origins; admin routes require server-validated sessions. Remote write transactions retain exclusive ownership of their database connection and roll back on failure. Browser-supplied paid flags, amounts and application IDs cannot override authority. No UPI PIN, OTP or bank credentials are collected.

## Verification

Automated tests use temporary local databases, including the Turso client's SQL adapter, and mocked email/Sheets delivery. They cover validation, dynamic QR decoding, session recovery, unauthorized requests, reference uniqueness, rejection, concurrent confirmation, rollback, cold starts, missing SMTP and connection failures. Browser tests cover desktop/mobile form and payment flows; screenshots are written to ignored artifacts/.

On Windows browser tests use installed Edge. Elsewhere install Playwright Chromium or set HELION_BROWSER_CHANNEL. `npm run build` checks executable sources and copies only explicitly allowed public assets into dist/. Environment files and databases are excluded from deployment upload.
