# Architecture

The top-level folders follow the project specification. The frontend uses feature modules, shared schemas, `next-intl`, and consistent formatting, following the conventions of the reference project. The API implements the veterinary domain with NestJS controllers and focused application services.

```text
apps/
  app/src/
    modules/              Nest feature modules and shared dependency registration
    auth/                 Session guard and authenticated actor decorator
    controllers/          HTTP transport
    services/             Accounts, pets, appointments, planning, cases,
                          inventory, configuration, workspace views, reports
    domain/
      ports/              Provider-independent AI and email contracts
      rules.ts            Authorization and shared business rules
    infrastructure/
      sqlite/             Persistent repository and transaction boundaries
      ai/                 OpenAI-compatible provider adapter
      email/              SMTP adapter
    app.module.ts         Nest module registration
    clinic.ts             Composition root, including test adapter injection
    server.ts             HTTP middleware and server construction
    main.ts               Environment loading and startup
  web/src/
    app/                  Next.js entry, layout, error and missing-page views
    modules/              Feature forms, lists and details
    components/           Shared presentation, custom buttons and native modal
    lib/                  API client and date helpers
    i18n/                 English/Spanish messages and locale provider
packages/
  types/                  Shared domain and public response contracts
  validation/             Shared Zod request schemas
  config/                 Fixed opening hours and default visit types
```

## Data and transaction model

SQLite stores entity fields in typed relational columns. The main tables are `users`, `sessions`, `pets`, `appointments`, `cases`, `products`, `movements`, `visit_types` and `time_blocks`. Plans use `appointment_plans`; original AI plans use `appointment_ai_drafts`. Estimated products, original draft products and actual usage each have a related table with `appointment_id`, `position`, `product_id` and `quantity`. No entity is persisted as a JSON document, including the original AI plan.

`schema.ts` defines the tables, indexes, unique keys and checks. Foreign keys are enabled on every repository connection. Composite references enforce that an appointment belongs to its pet's owner and that a case checkpoint belongs to the case's pet. Email addresses are unique without regard to case; stock cannot be negative; booleans, enums, durations and quantities have database checks. Foreign keys are deferred until commit so a transaction can create related records together. Cascading deletion only removes dependent plan and usage rows; referenced care history is protected.

`TableRepository` maps scalar columns to the shared entity properties; `StateRepository` reconstructs nested domain objects and writes changed rows. Case `checkpointIds` are derived from appointment `case_id` and `checkpoint_order`, which is unique within a case. Product lists preserve their order through `position`. A presence column distinguishes an empty recorded actual-usage list from usage that has not been recorded. Reports join and filter relational columns directly, without extracting or parsing JSON.

`migrations.ts` tracks schema versions with SQLite's `user_version`. On startup, version 0 document tables are converted to version 1 inside one transaction. The migration checks every reconstructed entity against its original record and verifies foreign keys before removing the old tables. A malformed record, unknown entity field, invalid relationship or unsupported version stops startup and rolls back the schema and data conversion. Migrated databases cannot be opened by the previous document-based app; use a pre-migration backup when reverting the application version.

`BEGIN IMMEDIATE` obtains SQLite's write reservation before reading the current data. A booking, assignment, plan change, movement, or completion performs its checks and writes inside the same synchronous transaction. Rejected operations, including deferred foreign-key failures at commit, roll back all changes. Read transactions provide a consistent snapshot across related tables. WAL mode allows readers while serializing writers; a busy timeout handles brief competing writes across processes. Domain services still work on a clinic-wide state snapshot, which fits a single clinic with modest data volume. Larger installations should move those services to targeted repository queries while preserving their behavior and tests.

Calendar intervals are half-open: a visit ending at 10:00 can be followed by one starting at 10:00. Pending bookings reserve 30 minutes unless a saved plan specifies another duration. Capacity checks consider all overlapping intervals, including longer visits. Cancelled, completed and unscheduled visits do not reserve future capacity. All scheduling operations use the clinic timezone and opening hours.

Planning forecasts never change stock. Completion validates every actual quantity, then records all Used movements and marks the visit Done in one transaction. A repeat completion cannot deduct stock twice. Corrections record a signed adjustment and require a reason. History is retained.

## Security and provider boundaries

Shared buttons and button links render native HTML with the existing CSS classes. The custom modal uses the browser's native `dialog` element and a React portal, with labelled content, background isolation, scroll locking, focus restoration, and dismissal protection while a request is running. These components live beside the other shared presentation components.

Passwords use salted scrypt hashes. Random opaque sessions are stored as SHA-256 hashes with expiration; cookies use HttpOnly, SameSite=Lax, and optional Secure. Registration, login and role validation happen on the API. Every protected controller authenticates the session, and every mutation enforces its role and entity ownership in the service. Owner responses exclude planning, AI drafts, inventory and calendar data.

The Next.js proxy keeps API requests on the browser's own origin. JSON-only mutations, an origin allowlist, bounded request bodies and authentication throttling protect the HTTP boundary. Set `COOKIE_SECURE=true` and an exact `APP_ORIGIN` when running behind HTTPS.

AI uses a domain port. The provider adapter receives pet information, symptoms, active visit types and known inventory products. Output is validated before persistence. A delayed draft must still match the appointment revision; batches skip human plans and reviewed drafts. Original AI output survives review. No provider credentials means drafting is explicitly unavailable.

PDF reports are role filtered before rendering or email delivery. A report can only be emailed to the signed-in user's account address. SMTP and AI credentials stay in the API environment. Tests inject deterministic ports and separately verify real HTTP and SMTP transports with local test servers.

## Reading the code

Start with `main.ts` and `app.module.ts` for startup and feature module registration. A session guard authenticates protected routes; controllers receive the actor through a parameter decorator and delegate to a service. Each service parses a named shared schema, checks role and ownership, and runs its use case in a repository transaction. The shared composition root wires services and replaceable providers so both Nest modules and domain tests use the same rules. Shared interfaces describe persisted entities and role-specific responses. Frontend feature forms use those same schemas before making asynchronous API requests.
