# Acceptance coverage

Presentation data is loaded with `pnpm demo` into its own persistent SQLite file. The seed tests verify all demo logins, existing-record preservation, repeat and concurrent runs, rollback on account conflicts, schedule validity, stock-ledger balances, completion, checkpoint confirmation, AI review, PDF email through a test adapter and clinic-local dates across clock changes. See [the grading walkthrough](presentation.md) for the live demonstration sequence.

The original overview and the local implementation plan are not part of the tracked repository. This checklist describes the implemented behavior and its automated verification.

| Requirement                                     | Implementation and verification                                                                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| BR-1: individual accounts and staff access code | Registration/login/session tests; separate staff form; passwords and session hashes; keyboard-accessible password visibility in every auth form |
| BR-2: owner/internal separation                 | Service and real HTTP access tests; owner response field checks; browser navigation checks                                                      |
| BR-3: available booking slots                   | Opening hours, timezone, blocks, pending bookings and capacity tests; HTTP and cross-thread SQLite booking races                                |
| BR-4: manual confirmation                       | Assignment tests and vet interface; AI status-preservation tests                                                                                |
| BR-5/6: no overlaps and full durations          | Assignment, rescheduling, duration and block tests; browser calendar drag                                                                       |
| BR-7: safe blocks                               | Reject pending/confirmed overlaps; availability excludes blocks; remove block restores slots                                                    |
| BR-8/9: AI boundaries and provenance            | Draft, review, skip, invalid provider output and delayed human-edit tests                                                                       |
| BR-10: planning is a forecast                   | Stock unchanged by over-stock estimates; warnings in plan form and inventory outlook                                                            |
| BR-11/12: truthful stock and movements          | Atomic completion rollback, nonnegative balances, required correction reasons, actor/timestamp audit and repeated-completion tests              |
| BR-13: owner cancellation                       | Before-start cancellation, terminal-state and checkpoint exception tests; cancellation browser journey                                          |
| BR-14: retained history                         | Pet/type deletion restrictions; rename/retire/restore tests; cancellation remains in history                                                    |
| Cases and checkpoints                           | Ordered related appointments; owner-needed and vet-scheduled paths; same-pet attachment; owner tracking browser journey                         |
| Course reports                                  | Three reports joining multiple persisted tables; owner role filtering; date/pet filters                                                         |
| PDF and email                                   | Generated PDF responses/downloads; account-only email; local SMTP delivery with PDF attachment                                                  |
| Responsive UI and richer controls               | Mobile browser checks; native date/time controls; booking slot picker; week calendar; custom modal focus, dismissal and busy-state tests        |
| Internationalization                            | English/Spanish catalogs and persisted switch; localized dates and common errors; Spanish browser journey                                       |
| Errors and validation                           | Shared browser/server Zod schemas; JSON/origin/access checks; missing-page and error views                                                      |
| Relational persistence                          | Typed columns for entity fields and related tables for nested plans/product lists; database constraints and atomic rollback tests               |
| Prisma schema and migrations                    | Committed migrations match the Prisma schema; unmigrated databases are refused; data and sessions survive reopening                             |

Run `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, and `pnpm build`. Browser tests use an isolated in-memory clinic on ports 3100/3101; they do not modify the real clinic database or send external messages. The deterministic AI adapter is only a test fixture. Provider transport checks do not require real credentials.

The specification's future-work list remains outside this release: vet shifts, routine email/SMS appointment notifications, billing, and a full medical-record system. The course-required report emails are implemented separately from appointment prompts.
