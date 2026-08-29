# HELION 2027

HELION's public interest form collects only a submitter's full name, team size, and each member's name and email. The Node API validates and stores each team in SQLite before attempting the optional Google Sheets mirror.

## Run and verify

Requires Node.js 22.5 or newer.

```sh
npm start
npm test
```

The site is served at `http://127.0.0.1:3000`. Do not open `index.html` directly—the form requires `POST /api/interests`.

## Production configuration

Copy `.env.example` to `.env` for local development, or add the same values to your deployment's server-side environment settings. The server loads a local `.env` automatically. Never add a populated environment file or service-account JSON to source control.

- `HELION_DB_PATH`: path to the persistent SQLite database. The path must be on durable storage shared by every application instance.
- `RATE_LIMIT_SALT`: long random server-only value used when hashing requester addresses.
- `GOOGLE_SHEETS_SPREADSHEET_ID`: spreadsheet ID, not its full URL.
- `GOOGLE_SHEETS_SHEET_NAME`: worksheet/tab name; defaults to `Interests`.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: service-account email.
- `GOOGLE_PRIVATE_KEY`: service-account private key, with escaped `\n` characters when required by the hosting environment.

Share the spreadsheet with the service-account email as an editor. Create these 13 columns for the fixed maximum team size of five:

`Interest ID | Submitted At | Team Size | Member 1 Name | Member 1 Email | ... | Member 5 Name | Member 5 Email`

The database is always committed first. If Sheets is unavailable, the API still returns success and leaves an outbox row pending. The long-running server retries due rows every minute with exponential backoff. A scheduled job can also run:

```sh
npm run sync:interests
```

For a Vercel frontend, keep this Express service and its SQLite file on a durable backend host, then route `/api/*` to it. Do not place the source-of-truth SQLite file in a Vercel Function's temporary filesystem; that storage is not durable. The browser uses only the same-origin `/api/interests` path, so the frontend remains compatible with such a rewrite/proxy.

## Data and exports

The normalized `interest_teams` and `interest_members` tables support team totals, participant totals, average team size, and submission counts without parsing spreadsheet cells. Event demand is intentionally absent until an event-selection feature is introduced later.

Export a consistent admin CSV:

```sh
npm run export:interests > helion-interests.csv
```
