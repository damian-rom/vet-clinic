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

SQLite stores separate `users`, `sessions`, `pets`, `appointments`, `cases`, `products`, `movements`, `visitTypes` and `timeBlocks` tables. Each table has a primary ID and a validated JSON document, preserving the shared TypeScript entity shape. Reports explicitly join these tables by entity IDs. Services validate relationships inside transactions before saving.

`BEGIN IMMEDIATE` obtains SQLite's write reservation before reading the current data. A booking, assignment, plan change, movement, or completion performs its checks and writes inside the same synchronous transaction. Rejected operations roll back all changes. WAL mode allows readers while serializing writers; a busy timeout handles brief competing writes across processes. This design fits a single clinic with modest data volume. Larger installations should replace the repository with indexed relational queries, preserving service behavior and tests.

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
