# Acceptance coverage

The original overview and the local implementation plan are not part of the tracked repository. This checklist describes the implemented behavior and its automated verification.

| Requirement                                     | Implementation and verification                                                                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| BR-1: individual accounts and staff access code | Registration/login/session tests; separate staff form; passwords and session hashes                                                      |
| BR-2: owner/internal separation                 | Service and real HTTP access tests; owner response field checks; browser navigation checks                                               |
| BR-3: available booking slots                   | Opening hours, timezone, blocks, pending bookings and capacity tests; HTTP and cross-thread SQLite booking races                         |
| BR-4: manual confirmation                       | Assignment tests and vet interface; AI status-preservation tests                                                                         |
| BR-5/6: no overlaps and full durations          | Assignment, rescheduling, duration and block tests; browser calendar drag                                                                |
| BR-7: safe blocks                               | Reject pending/confirmed overlaps; availability excludes blocks; remove block restores slots                                             |
| BR-8/9: AI boundaries and provenance            | Draft, review, skip, invalid provider output and delayed human-edit tests                                                                |
| BR-10: planning is a forecast                   | Stock unchanged by over-stock estimates; warnings in plan form and inventory outlook                                                     |
| BR-11/12: truthful stock and movements          | Atomic completion rollback, nonnegative balances, required correction reasons, actor/timestamp audit and repeated-completion tests       |
| BR-13: owner cancellation                       | Before-start cancellation, terminal-state and checkpoint exception tests; cancellation browser journey                                   |
| BR-14: retained history                         | Pet/type deletion restrictions; rename/retire/restore tests; cancellation remains in history                                             |
| Cases and checkpoints                           | Ordered related appointments; owner-needed and vet-scheduled paths; same-pet attachment; owner tracking browser journey                  |
| Course reports                                  | Three reports joining multiple persisted tables; owner role filtering; date/pet filters                                                  |
| PDF and email                                   | Generated PDF responses/downloads; account-only email; local SMTP delivery with PDF attachment                                           |
| Responsive UI and richer controls               | Mobile browser checks; native date/time controls; booking slot picker; week calendar; custom modal focus, dismissal and busy-state tests |
| Internationalization                            | English/Spanish catalogs and persisted switch; localized dates and common errors; Spanish browser journey                                |
| Errors and validation                           | Shared browser/server Zod schemas; JSON/origin/access checks; missing-page and error views                                               |

Run `npm test`, `npm run test:e2e`, `npm run lint`, `npm run format:check`, `npm run typecheck`, and `npm run build`. Browser tests use an isolated in-memory clinic on ports 3100/3101; they do not modify the real clinic database or send external messages. The deterministic AI adapter is only a test fixture. Provider transport checks do not require real credentials.

The specification's future-work list remains outside this release: vet shifts, routine email/SMS appointment notifications, billing, and a full medical-record system. The course-required report emails are implemented separately from appointment prompts.
