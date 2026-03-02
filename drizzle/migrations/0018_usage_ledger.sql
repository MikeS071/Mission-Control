CREATE TABLE IF NOT EXISTS "usage_ledger" (
  "id" serial PRIMARY KEY,
  "tenant_id" integer NOT NULL REFERENCES "tenants"("id"),
  "model" text NOT NULL,
  "provider" text NOT NULL,
  "tokens_in" integer NOT NULL,
  "tokens_out" integer NOT NULL,
  "cost_usd" numeric(12, 6) NOT NULL,
  "hypothetical_cost_usd" numeric(12, 6),
  "saved_usd" numeric(12, 6),
  "cache_hit" boolean NOT NULL DEFAULT false,
  "request_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "usage_summary" (
  "id" serial PRIMARY KEY,
  "tenant_id" integer NOT NULL REFERENCES "tenants"("id"),
  "period" text NOT NULL,
  "period_start" timestamp with time zone NOT NULL,
  "total_tokens_in" bigint NOT NULL DEFAULT 0,
  "total_tokens_out" bigint NOT NULL DEFAULT 0,
  "total_cost_usd" numeric(12, 6) NOT NULL DEFAULT '0',
  "total_saved_usd" numeric(12, 6) NOT NULL DEFAULT '0',
  "request_count" integer NOT NULL DEFAULT 0,
  "cache_hits" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "usage_ledger_tenant_created_at_idx"
  ON "usage_ledger" ("tenant_id", "created_at");

CREATE INDEX IF NOT EXISTS "usage_summary_tenant_period_start_idx"
  ON "usage_summary" ("tenant_id", "period", "period_start");
