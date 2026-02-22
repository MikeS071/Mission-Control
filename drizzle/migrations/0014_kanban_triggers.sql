CREATE TABLE IF NOT EXISTS "kanban_triggers" (
  "id" serial PRIMARY KEY,
  "tenant_id" integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "task_id" integer NOT NULL,
  "task_title" text NOT NULL,
  "task_description" text,
  "action" text NOT NULL,
  "triggered_at" timestamp DEFAULT now() NOT NULL
);
