-- Plans of a materials-optional visit type may list no materials; all others must list one.
ALTER TABLE "visit_types" ADD COLUMN "materials_optional" BOOLEAN NOT NULL DEFAULT false CHECK ("materials_optional" IN (0, 1));

-- Consultations, dental cleanings and follow-ups may go without materials.
UPDATE "visit_types" SET "materials_optional" = true
WHERE lower("name") IN ('consult', 'dental cleaning', 'follow-up');
