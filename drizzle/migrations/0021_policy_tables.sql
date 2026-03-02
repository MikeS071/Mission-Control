-- Policy storage and audit trail

CREATE TABLE IF NOT EXISTS "policies" (
  "id" serial PRIMARY KEY,
  "tenant_id" integer UNIQUE REFERENCES "tenants"("id"),
  "tier" text NOT NULL DEFAULT 'free',
  "rules" jsonb NOT NULL,
  "custom_overrides" jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "policy_audit_log" (
  "id" serial PRIMARY KEY,
  "tenant_id" integer REFERENCES "tenants"("id"),
  "changed_by" integer REFERENCES "users"("id"),
  "old_rules" jsonb,
  "new_rules" jsonb,
  "change_reason" text,
  "created_at" timestamp with time zone DEFAULT now()
);
