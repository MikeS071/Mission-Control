-- Kanban PRD workflow

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "prd_path" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "prd_canonical_path" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "prd_version" integer NOT NULL DEFAULT 1;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "prd_last_updated_at" timestamp with time zone;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "prd_missing_reminded_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "task_prd_versions" (
  "id" serial PRIMARY KEY,
  "tenant_id" integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "task_id" integer NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "version_number" integer NOT NULL,
  "path" text NOT NULL,
  "source" text NOT NULL DEFAULT 'generate',
  "parent_version_id" integer REFERENCES "task_prd_versions"("id") ON DELETE SET NULL,
  "change_note" text,
  "is_current" boolean NOT NULL DEFAULT true,
  "created_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "task_prd_versions_task_version" ON "task_prd_versions"("task_id", "version_number");
CREATE INDEX IF NOT EXISTS "task_prd_versions_task" ON "task_prd_versions"("task_id");
CREATE INDEX IF NOT EXISTS "task_prd_versions_current" ON "task_prd_versions"("task_id") WHERE "is_current" = true;
