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
apps/app/              NestJS 12 API, domain ports and provider adapters, SQLite
packages/types/        Shared TypeScript domain and response contracts
packages/validation/   Shared Zod request schemas for browser and server
packages/config/       Fixed clinic hours, slots and default visit types
```

See [architecture](docs/architecture.md) for data, transaction, security and code-navigation details, and [acceptance coverage](docs/acceptance.md) for the specification-to-test mapping.

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
