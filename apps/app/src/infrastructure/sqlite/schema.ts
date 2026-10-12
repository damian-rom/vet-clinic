/** Version 1 replaces the original document tables with a relational schema. */
export const SCHEMA_VERSION = 1;

export const RELATIONAL_SCHEMA = `
  CREATE TABLE users (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    role TEXT NOT NULL CHECK(role IN ('owner', 'vet')),
    password_hash TEXT NOT NULL
  ) STRICT;

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
    expires_at INTEGER NOT NULL CHECK(expires_at > 0)
  ) STRICT;

  CREATE TABLE pets (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
    name TEXT NOT NULL,
    species TEXT NOT NULL CHECK(species IN ('Dog', 'Cat', 'Rabbit', 'Bird', 'Other')),
    sex TEXT NOT NULL CHECK(sex IN ('Male', 'Female')),
    date_of_birth TEXT,
    approximate_age TEXT,
    breed TEXT,
    weight REAL CHECK(weight > 0 AND weight <= 2000),
    notes TEXT,
    UNIQUE(id, owner_id),
    CHECK(date_of_birth IS NOT NULL OR approximate_age IS NOT NULL)
  ) STRICT;

  CREATE TABLE cases (
    id TEXT PRIMARY KEY NOT NULL,
    pet_id TEXT NOT NULL REFERENCES pets(id) DEFERRABLE INITIALLY DEFERRED,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(id, pet_id)
  ) STRICT;

  CREATE TABLE appointments (
    id TEXT PRIMARY KEY NOT NULL,
    pet_id TEXT NOT NULL,
    owner_id TEXT NOT NULL REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
    vet_id TEXT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
    scheduled_at TEXT,
    symptoms TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('AwaitingConfirmation', 'Confirmed', 'NeedsTime', 'Done', 'Cancelled')),
    case_id TEXT,
    checkpoint_order INTEGER CHECK(checkpoint_order > 0),
    pet_needed INTEGER CHECK(pet_needed IN (0, 1)),
    created_at TEXT NOT NULL,
    completed_at TEXT,
    revision INTEGER NOT NULL CHECK(revision >= 0),
    actual_actives_recorded INTEGER NOT NULL DEFAULT 0 CHECK(actual_actives_recorded IN (0, 1)),
    FOREIGN KEY(pet_id, owner_id) REFERENCES pets(id, owner_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(case_id, pet_id) REFERENCES cases(id, pet_id) DEFERRABLE INITIALLY DEFERRED,
    UNIQUE(case_id, checkpoint_order),
    CHECK(
      (case_id IS NULL AND checkpoint_order IS NULL AND pet_needed IS NULL)
      OR (case_id IS NOT NULL AND checkpoint_order IS NOT NULL AND pet_needed IS NOT NULL)
    )
  ) STRICT;

  CREATE TABLE products (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    stock REAL NOT NULL CHECK(stock >= 0)
  ) STRICT;

  CREATE TABLE movements (
    id TEXT PRIMARY KEY NOT NULL,
    product_id TEXT NOT NULL REFERENCES products(id) DEFERRABLE INITIALLY DEFERRED,
    type TEXT NOT NULL CHECK(type IN ('Received', 'Correction', 'Used')),
    quantity REAL NOT NULL CHECK(quantity != 0),
    reason TEXT,
    performed_by TEXT NOT NULL REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
    performed_at TEXT NOT NULL,
    appointment_id TEXT REFERENCES appointments(id) DEFERRABLE INITIALLY DEFERRED,
    CHECK(type != 'Received' OR quantity > 0),
    CHECK(type != 'Used' OR (quantity < 0 AND appointment_id IS NOT NULL)),
    CHECK(type != 'Correction' OR (reason IS NOT NULL AND length(trim(reason)) > 0))
  ) STRICT;

  CREATE TABLE visit_types (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    retired INTEGER NOT NULL CHECK(retired IN (0, 1))
  ) STRICT;

  CREATE TABLE time_blocks (
    id TEXT PRIMARY KEY NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    reason TEXT,
    CHECK(julianday(starts_at) IS NOT NULL AND julianday(ends_at) IS NOT NULL AND julianday(ends_at) > julianday(starts_at))
  ) STRICT;

  CREATE TABLE appointment_plans (
    appointment_id TEXT PRIMARY KEY NOT NULL REFERENCES appointments(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    visit_type_id TEXT NOT NULL REFERENCES visit_types(id) DEFERRABLE INITIALLY DEFERRED,
    duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 1 AND 540),
    source TEXT NOT NULL CHECK(source IN ('human', 'ai-draft', 'ai-reviewed')),
    reviewed_by TEXT REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
    saved_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE appointment_ai_drafts (
    appointment_id TEXT PRIMARY KEY NOT NULL REFERENCES appointment_plans(appointment_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    visit_type_id TEXT NOT NULL REFERENCES visit_types(id) DEFERRABLE INITIALLY DEFERRED,
    duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 1 AND 540)
  ) STRICT;

  CREATE TABLE appointment_estimated_actives (
    appointment_id TEXT NOT NULL REFERENCES appointment_plans(appointment_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    position INTEGER NOT NULL CHECK(position >= 0),
    product_id TEXT NOT NULL REFERENCES products(id) DEFERRABLE INITIALLY DEFERRED,
    quantity REAL NOT NULL CHECK(quantity > 0),
    PRIMARY KEY(appointment_id, product_id),
    UNIQUE(appointment_id, position)
  ) STRICT;

  CREATE TABLE appointment_draft_actives (
    appointment_id TEXT NOT NULL REFERENCES appointment_ai_drafts(appointment_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    position INTEGER NOT NULL CHECK(position >= 0),
    product_id TEXT NOT NULL REFERENCES products(id) DEFERRABLE INITIALLY DEFERRED,
    quantity REAL NOT NULL CHECK(quantity > 0),
    PRIMARY KEY(appointment_id, product_id),
    UNIQUE(appointment_id, position)
  ) STRICT;

  CREATE TABLE appointment_actual_actives (
    appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    position INTEGER NOT NULL CHECK(position >= 0),
    product_id TEXT NOT NULL REFERENCES products(id) DEFERRABLE INITIALLY DEFERRED,
    quantity REAL NOT NULL CHECK(quantity > 0),
    PRIMARY KEY(appointment_id, product_id),
    UNIQUE(appointment_id, position)
  ) STRICT;

  CREATE INDEX sessions_user_idx ON sessions(user_id);
  CREATE INDEX sessions_expiration_idx ON sessions(expires_at);
  CREATE INDEX pets_owner_idx ON pets(owner_id);
  CREATE INDEX cases_pet_idx ON cases(pet_id);
  CREATE INDEX appointments_pet_idx ON appointments(pet_id, owner_id);
  CREATE INDEX appointments_owner_idx ON appointments(owner_id);
  CREATE INDEX appointments_vet_time_idx ON appointments(vet_id, scheduled_at);
  CREATE INDEX appointments_status_time_idx ON appointments(status, scheduled_at);
  CREATE INDEX appointments_case_pet_idx ON appointments(case_id, pet_id);
  CREATE INDEX movements_product_time_idx ON movements(product_id, performed_at);
  CREATE INDEX movements_performer_idx ON movements(performed_by);
  CREATE INDEX movements_appointment_idx ON movements(appointment_id);
  CREATE INDEX plans_visit_type_idx ON appointment_plans(visit_type_id);
  CREATE INDEX plans_reviewer_idx ON appointment_plans(reviewed_by);
  CREATE INDEX drafts_visit_type_idx ON appointment_ai_drafts(visit_type_id);
  CREATE INDEX estimated_actives_product_idx ON appointment_estimated_actives(product_id);
  CREATE INDEX draft_actives_product_idx ON appointment_draft_actives(product_id);
  CREATE INDEX actual_actives_product_idx ON appointment_actual_actives(product_id);
  CREATE INDEX time_blocks_interval_idx ON time_blocks(starts_at, ends_at);
`;
