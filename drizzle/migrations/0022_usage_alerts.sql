-- Usage alert storage for budget threshold notifications

CREATE TABLE IF NOT EXISTS "usage_alerts" (
  "id" serial PRIMARY KEY,
  "tenant_id" integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "alert_type" text NOT NULL,
  "threshold" integer NOT NULL,
  "message" text NOT NULL,
  "acknowledged" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "usage_alerts_tenant_threshold_month_uniq"
  ON "usage_alerts" ("tenant_id", "threshold", date_trunc('month', "created_at"));

CREATE INDEX IF NOT EXISTS "usage_alerts_unacknowledged_idx"
  ON "usage_alerts" ("tenant_id", "acknowledged", "created_at" DESC);
