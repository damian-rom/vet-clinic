# Pawstead · Vet Clinic Platform

A full-stack veterinary clinic workspace for owner booking, clinical visit planning, personal calendars, multi-visit cases, inventory, and reviewed AI drafts. Course requirements add joined-data reports, PDF downloads, account-address email delivery, and English/Spanish UI.

## Run locally

Use **Node.js 24 LTS** and npm. From the repository root:

```bash
npm ci
npm run setup
npm run dev
```

Open **http://localhost:3000**. On Windows PowerShell with script execution disabled, use `npm.cmd` instead of `npm`.

Setup creates ignored environment files without overwriting existing settings. Read `CLINIC_ACCESS_CODE` in `apps/app/.env`, then use **Veterinarian registration** to create the clinic's first personal vet account. Owners register through **Create an owner account**. At least one vet is needed before appointment times become available. There are no shared or automatically created production accounts.

The API listens on port 3001. Next.js forwards same-origin `/api` requests to it. Data persists in `apps/app/data/clinic.sqlite`; restarting the app preserves accounts, appointments and stock. Keep this database private and back it up while the API is stopped, or use SQLite's backup facilities. Database files, credentials and local planning inputs must never be committed.

The schema lives in `packages/db` as a Prisma model with SQL migrations. `npm run dev` and `npm start` apply pending migrations before the API starts; run `npm run db:migrate` to apply them yourself. The API refuses to open a database with unapplied migrations. Plans, original AI drafts and product-usage lists have their own related tables. You can inspect the SQLite file with a SQLite database viewer; see [the data model](docs/architecture.md#data-and-transaction-model) for the table relationships.

This release starts from a fresh Prisma baseline. Databases created by earlier versions, including the original `id`/`document` tables, are not converted; start with a new database file.

## Provider settings

Edit `apps/app/.env` to enable external features:

| Setting                                     | Purpose                                                               |
| ------------------------------------------- | --------------------------------------------------------------------- |
| `CLINIC_ACCESS_CODE`                        | Private code used only for veterinarian registration                  |
| `CLINIC_TIMEZONE`                           | Defaults to `America/Havana`; all scheduling uses clinic time         |
| `DATABASE_PATH`                             | Persistent SQLite file, relative to `apps/app` when using npm scripts |
| `AI_API_KEY`, `AI_MODEL`                    | Enable real AI planning drafts                                        |
| `AI_BASE_URL`                               | OpenAI-compatible API base, default `https://api.openai.com/v1`       |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`       | Enable sending PDF reports to the signed-in account                   |
| `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` | Optional SMTP authentication and direct TLS                           |
| `APP_ORIGIN`                                | Allowed browser origin; default `http://localhost:3000`               |
| `COOKIE_SECURE`                             | Set to `true` behind HTTPS                                            |

AI and email are explicitly unavailable until configured. The rest of the clinic works without those providers. AI proposes logistics for human review; it never assigns veterinarians or confirms appointments. Batch drafting preserves human plans. Email is used for requested reports; appointment updates remain in-app.

## Workflows

- **Owners:** register/edit pets, book open slots, cancel eligible visits, choose requested new times, follow case checkpoints, and view pet visit history with the attending vet.
- **Veterinarians:** review the clinic-wide appointment list, assign visits, plan duration and estimated supplies, draft/review with AI, drag confirmed visits in personal/colleague calendars, and complete visits with actual supply usage.
- **Cases:** link related visits and add ordered checkpoints. Pet-needed steps prompt owners; pet-not-needed steps are scheduled and confirmed by vets.
- **Inventory:** create products, record Received/Correction movements, see upcoming demand and shortfalls, and audit automatic Used movements. Stock never changes through planning and cannot become negative.
- **Configuration:** add/rename/retire visit types and create/remove closing ranges or whole-day blocks. Used types and pets with history cannot be deleted.
- **Reports:** care history, clinic activity and inventory usage. Each joins multiple tables and supports filters, PDF download, and account-only email delivery.

## Structure and technology

```text
apps/web/              Next.js 16 + React 19, custom React components, next-intl
apps/app/              NestJS 12 API, domain ports and provider adapters
packages/db/           Prisma schema, SQL migrations and the SQLite client
packages/types/        Shared TypeScript domain and response contracts
packages/validation/   Shared Zod request schemas for browser and server
packages/config/       Fixed clinic hours, slots and default visit types
```

See [architecture](docs/architecture.md) for data, transaction, security and code-navigation details, and [acceptance coverage](docs/acceptance.md) for the specification-to-test mapping.

## Manual testing

Use separate browser profiles or different browsers for two owners and two veterinarians. Refresh the other workspace after a change. Book future weekdays inside the clinic's fixed 09:00–18:00 hours, in the displayed clinic timezone.

| Area                       | Check                                                                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts                   | Owner signup; staff signup with wrong/correct clinic code; wrong password; login/logout; eye button on all three forms; owner data isolation                                                    |
| Pets                       | Required fields; DOB or approximate age; multiple pets; editing; visit history with the attending vet; refusing deletion when history exists                                                    |
| Booking                    | Pending status; two simultaneous reservations exhaust a slot with two vets; closed/blocked/full times absent; eligible cancellation releases capacity and retains history                       |
| Confirmation and calendars | Human assignment to self/colleague; personal calendars; colleague switch; duration-proportional visits; valid drag/reschedule; refusal of overlaps and blocked moves                            |
| Plans                      | Visit type, duration and estimated products; a stock warning still allows saving; forecasts leave stock unchanged; duration changes cannot cause collisions                                     |
| New times                  | Asking an owner releases the reservation; the owner chooses again; status returns to Awaiting confirmation and needs human assignment                                                           |
| Cases                      | Link the same pet's visits in order; pet-needed checkpoint prompts the owner; pet-not-needed checkpoint is scheduled/confirmed by a vet; owners cannot cancel checkpoints or see their plans    |
| AI                         | Single and batch drafts; no automatic assignment/status changes; AI badge; review badge and original comparison; batches preserve human/reviewed plans                                          |
| Inventory and completion   | Received deliveries; Correction with mandatory reason; actual usage prefilled/editable; Done deducts once through Used movements; insufficient stock refuses completion without partial changes |
| Configuration              | Create/remove ranges and whole-day blocks; refuse blocking an existing visit; add/rename/retire/restore types; refuse deleting used types                                                       |
| Reports                    | All three report kinds for vets; owner-only care history; date/pet filters; PDF download; account-address email with SMTP configured                                                            |
| General                    | English/Spanish; mobile layout; keyboard navigation; errors; saved records survive a normal app restart; dashboard planning/AI metrics                                                          |

Real AI needs `AI_API_KEY` and `AI_MODEL`; actual report delivery needs the SMTP settings. Restart the API after changing its environment. Visits cannot be completed before their start time.

For a quick isolated walkthrough with a past visit ready to complete and deterministic AI, use two PowerShell terminals from the repository root instead of the normal app:

```powershell
# Terminal 1: isolated API
npm.cmd run build
$env:APP_ORIGIN = 'http://localhost:3100'
node node_modules/tsx/dist/cli.mjs --tsconfig apps/app/tsconfig.json apps/app/test/e2e-server.ts
```

```powershell
# Terminal 2: frontend connected to the isolated API
$env:API_URL = 'http://127.0.0.1:3101'
node node_modules/next/dist/bin/next dev apps/web --port 3100
```

Open http://localhost:3100. Sign in as `owner@example.com`, `vet0@example.com`, or `vet1@example.com`; all use `correct-horse-battery`. The fixture staff code is `test-clinic-access-code`. Luna has an "Annual vaccination" visit ready to complete and 10 vaccine doses in stock.

Fixture data resets when its API stops. AI and email use test adapters, so this mode does not check real provider responses, actual email delivery, or persistent storage. Close these terminals when finished; use fresh terminals for normal startup so the demo environment settings do not carry over. Stop the isolated servers before running browser tests, which start their own servers on the same ports.

## Verify

```bash
npm test
npm run lint
npm run format:check
npm run typecheck
npm run build
```

Install a browser once before running browser tests:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.playwright'
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

On macOS/Linux use `PLAYWRIGHT_BROWSERS_PATH=.playwright npx playwright install chromium`, then `npm run test:e2e`. The test configuration starts an isolated clinic on ports 3100/3101 with deterministic AI and email fixtures. Tests never use the real database or contact external recipients. CI runs the same verification and installs browser dependencies.

For production, run `npm run build`, then `npm run start --workspace=@vet-clinic/app` and `npm run start --workspace=@vet-clinic/web` in separate processes, behind an HTTPS reverse proxy. Configure `APP_ORIGIN`, `COOKIE_SECURE`, provider settings and a persistent private database path before use.
