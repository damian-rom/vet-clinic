# Pawstead grading presentation

Use this walkthrough for a 15 to 20 minute demonstration of owner booking, veterinary planning, cases, stock control, reports and the technical design. The presentation runs the normal application with a separate persistent database and sample records.

## Prepare before the presentation

1. Install dependencies with Node.js 24 and the pinned pnpm version: run `pnpm install` and `pnpm run setup` from the repository root.
2. Stop any app already using ports 3000 or 3001, including Docker containers.
3. For real report email, set the SMTP values in `apps/app/.env` and add `DEMO_OWNER_EMAIL=your-real-email@example.com`. This replaces Sofia's demo login email when a fresh dataset is created. The terminal prints her actual login.
4. For live AI, set `AI_API_KEY` and `AI_MODEL` in that file. Existing sample AI plans can be reviewed without provider credentials; generating a new plan requires the configured provider.
5. Run the fresh presentation command:

```powershell
pnpm.cmd demo --fresh
```

6. Open http://localhost:3000 in two separate browser profiles, browsers, or normal/incognito windows. Ordinary tabs share the same login cookie.
7. Sign in as Ana in one window and Sofia in the other. Keep the terminal's first demonstration date handy; upcoming appointments are on the next two weekdays in the configured clinic timezone.
8. Rehearse the completion and report steps once. Before grading, stop the app and run the fresh command again.

The presentation database is `apps/app/data/presentation.sqlite`. Normal `pnpm dev` uses the configured clinic database. Re-running `pnpm demo` preserves rehearsal changes; `--fresh` backs up and resets only the presentation database and recalculates the dates. Backups remain beside it as `presentation.backup-*.sqlite`. No email or AI request is sent while loading sample records.

### Prepare with Docker instead

Use this route if you already run the app with Docker. Host Node.js dependencies are not needed. Configure the optional SMTP, `DEMO_OWNER_EMAIL` and AI settings in `apps/app/.env` first, then run:

```powershell
docker compose stop web
docker compose -f docker-compose.yml -f docker-compose.demo.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.demo.yml logs api
```

Open http://localhost:3000 and continue with the same accounts and walkthrough below. The logs print the actual owner email and first demonstration date. An exited `db` container with exit code 0 is expected: it applies migrations and finishes. Both `api` and `web` should be running. The separate `vet-clinic-demo` project keeps its own volume and leaves the normal clinic data intact.

For a normal restart, repeat the `up -d` command with both Compose files. After changing provider settings, add `--force-recreate api web` so the API receives the new environment. Existing sample accounts retain their emails; changing `DEMO_OWNER_EMAIL` requires fresh presentation data.

To reset a Docker rehearsal, save a copy of its database first, then remove only the demo project's containers and volume and start it again:

```powershell
docker compose -f docker-compose.yml -f docker-compose.demo.yml stop api
docker compose -f docker-compose.yml -f docker-compose.demo.yml cp api:/data "$env:TEMP/pawstead-presentation-backup"
docker compose -f docker-compose.yml -f docker-compose.demo.yml down -v
docker compose -f docker-compose.yml -f docker-compose.demo.yml up -d
```

The backup directory includes the database and any SQLite journal files. Keep it private and outside Git, and choose a different directory name for each rehearsal. To return to the normal clinic, stop the demo with both Compose files, then run `docker compose up -d`.

## Accounts and starting records

All four demo accounts use password **Pawstead-Demo-2026!**.

| Role         | Name          | Default email        | Pets          |
| ------------ | ------------- | -------------------- | ------------- |
| Veterinarian | Ana Hernandez | ana@pawstead.test    | Clinic access |
| Veterinarian | Mateo Ruiz    | mateo@pawstead.test  | Clinic access |
| Owner        | Sofia Perez   | sofia@pawstead.test  | Luna and Max  |
| Owner        | Daniel Torres | daniel@pawstead.test | Milo and Nala |

If you configured `DEMO_OWNER_EMAIL`, use that address for Sofia. The default `.test` addresses cannot receive mail. The sender configured by SMTP and the recipient's clinic login email are separate.

The initial dataset has four pets, thirteen visits, one care case, five products, nine stock movements, a one-off staff meeting and weekday lunch blocks. Visits include pending bookings, confirmed appointments, an owner scheduling request, sample AI drafts, cancelled history, three completed visits and a past confirmed booster ready to complete.

## Introduce the clinic workflow

Allow about one minute.

Say: “Pawstead manages the path from an owner requesting a visit to a veterinarian planning and completing it. The same records connect pet history, calendars, supplies, care cases and reports.”

In Ana's window, show the populated overview and navigation. Point out upcoming visits, planning metrics and the separation between appointments, cases, inventory and reports. The overview focuses on upcoming work; the past booster is available in Appointments.

## Show the owner experience

Allow about three minutes in Sofia's window.

1. Open **My pets** and show Luna and Max, including profile information and visit history.
2. Open **Care cases** and show **Luna skin recovery**. Explain its completed initial exam, follow-up waiting for an owner time, and lab-results checkpoint scheduled without bringing the pet.
3. Use **Choose a time** for Luna's waiting follow-up. Select the second demonstration weekday at **10:00**, then submit. Show that its state becomes **Awaiting confirmation**.
4. Open the normal booking form and inspect the first demonstration day. The initial **09:00** slot is full: Nala's confirmed consultation and Luna's pending booking consume the two vets' capacity. Lunch from **12:00 to 13:00** and the staff meeting from **16:00 to 16:30** are unavailable.
5. If time permits, request a new ordinary visit in a free afternoon slot, then cancel it and show the retained cancelled history.
6. Point out that Sofia can see her pets and care progress, while internal plans, inventory and veterinary calendars are absent.

Say: “A booking request reserves capacity, but a person at the clinic must confirm it. Availability uses complete visit durations, existing bookings and clinic blocks.”

## Confirm and plan as a veterinarian

Allow about three minutes in Ana's window.

1. Refresh the workspace and open **Appointments**.
2. Search for **Luna skin review — assign me**, open it, choose Ana, and click **Assign & confirm**.
3. Open **Edit visit plan**, choose **Consult**, set **45 minutes**, and save. A consult permits an empty materials list.
4. Explain that visit types such as Vaccination, Lab work and Operation require materials. Try saving one of those with no supplies to show the validation, then return to the valid plan.
5. Find the follow-up whose owner just selected a time and confirm it with Ana. Its Lab work plan already contains one Lab kit.
6. Refresh Sofia's window to show both confirmations.

Say: “The vet controls confirmation, visit type, duration and supplies. Longer plans must still fit the calendar.”

## Show calendar scheduling and conflicts

Allow about two minutes.

1. Open Ana's **Calendar** and use **Calendar week** to select the first demonstration date.
2. Locate **Max mobility review**, initially at **10:30** for one hour.
3. Drag it to **13:00** on the same day. Show the success notification and its one-hour height.
4. Attempt to drag it to **09:00**, where Ana now has Luna's skin review. Show the conflict message and that Max remains at the valid time.
5. Switch to Mateo's calendar and point out his **09:00** consultation and **14:00** dressing appointment.

Say: “Two vets can work at the same time, but one vet cannot hold overlapping visits. The API validates the same rules as the calendar UI.”

## Demonstrate AI review

Allow about two minutes.

1. Open **Luna blood panel — review the sample AI draft**. Explain that this is a preloaded example.
2. Show **Filled by AI**, the proposed Lab work plan and its Lab kit.
3. Open **Edit visit plan**, change the duration from 30 to **45 minutes**, and use **Review & save plan**.
4. Show the reviewed label and original AI draft comparison. The original proposal remains available.
5. If real AI is configured, open **Milo ear irritation — draft a plan with AI** and click **Draft with AI**. Show the returned proposal and that the visit still awaits human confirmation. Review the result before saving or completing it.

Provider output and timing vary. If the provider is unavailable, demonstrate the preloaded review flow and state that live generation needs the configured external service. Seeded examples do not stand in for a live provider call.

## Demonstrate stock forecasts and real deductions

Allow about three minutes.

1. Open **Inventory** and point out **Specialty dressing**: stock is **1 pack**, while Nala's upcoming plan needs **3**. Explain the shortfall warning.
2. Open Nala's dressing visit and show that the estimate was saved even though it exceeds stock. Planning has not reduced the balance.
3. Return to Inventory and show **Vaccine** at **19 doses**.
4. In Appointments, search for **Luna booster — ready to complete**. This visit is in the past and has a saved, reviewed plan.
5. Open it, click **Mark done**, confirm **1 dose** as actually used, and click **Mark visit done**.
6. Return to Inventory. Show Vaccine at **18 doses** and its new **Used** movement, with the vet, time and appointment reference.
7. Reopen the completed visit and show its recorded usage and read-only state.
8. Show the existing glove correction and its reason. If needed, record a small Received movement and explain why corrections require a reason.

Say: “The plan is a forecast. Stock changes only through audited movements, and completion records usage and closes the visit in one transaction.”

## Present reports and real email

Allow about two minutes.

1. In Ana's **Reports**, set **From** far enough back to include the previous two months and **To** to the second demonstration date.
2. Generate **Care history**, **Clinic activity** and **Inventory usage**. Explain the related records behind each report.
3. Download a PDF and open it for the grader.
4. In Sofia's window, open Reports. Show that only her care history is available.
5. If Sofia's login uses your real receiving address and SMTP is configured, click **Email to me** and show the received email and PDF attachment. Check Spam if it is not in Inbox.
6. Explain that the recipient is the signed-in account's address; users cannot type an arbitrary recipient. Appointment confirmations do not trigger emails.
7. To show older retained history, return to Ana's Appointments, choose **Done** or **All visits**, click **Load older visits**, and locate **Milo blood panel — older retained history**.

The presentation runs the real SMTP adapter. Email success is only a meaningful delivery demonstration when you also show the message in the recipient inbox.

## Finish with configuration and implementation

Allow about two minutes.

1. Open clinic configuration and show weekday lunch blocks plus the one-off staff meeting. Demonstrate adding or removing a temporary closing range if time permits.
2. Show that a used visit type can be retired and restored; its history is retained.
3. Switch English to Spanish and reduce the browser width to show the responsive owner workspace.
4. Explain the structure: Next.js frontend, NestJS controllers and services, shared validation, Prisma repositories and a relational SQLite database.
5. If asked about persistence, show the tables in a SQLite viewer. Stop the app before using an editor to change the file.
6. Explain that passwords are hashed, sessions use protected cookies, and the API checks role and ownership for protected actions.

For verification evidence, show the repository checks from a separate terminal after stopping the demo if running browser tests:

```powershell
pnpm.cmd test
pnpm.cmd lint
pnpm.cmd format:check
pnpm.cmd typecheck
pnpm.cmd build
pnpm.cmd test:e2e
```

Browser tests use isolated servers on 3100 and 3101 with deterministic providers. They do not prove that a real AI account or Gmail configuration works; use the live presentation steps for those integrations.

## If you have only five minutes

1. Introduce the two roles and show Luna's case in Sofia's window.
2. Confirm Luna's pending visit in Ana's window and show its plan.
3. Complete the past booster and show Vaccine changing from 19 to 18.
4. Download a report PDF and demonstrate real email if prepared.
5. Finish with the calendar, the stock shortfall and the relational database structure.

## Recover during rehearsal

| Situation                                                       | What to do                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| A port is already in use                                        | Stop the other local or Docker app, then rerun the demo command.                            |
| The dates are old or a visit was already completed              | Stop the demo and run `pnpm demo --fresh` to back up and recreate the presentation dataset. |
| The other role does not show a change                           | Use **Refresh workspace** or reload that browser window.                                    |
| A plan rejects an empty materials list                          | Select at least one product, or use Consult when no materials are needed.                   |
| A future visit cannot be completed                              | Use the past **Luna booster — ready to complete** visit.                                    |
| Live AI fails                                                   | Show the preloaded AI review example and check provider credentials separately.             |
| Email succeeds in the UI but is not in Inbox                    | Check the signed-in account's actual email, Spam and the API logs.                          |
| Sofia still has a sample email after configuring a real address | Restart with `--fresh`; ordinary starts preserve the existing accounts.                     |
