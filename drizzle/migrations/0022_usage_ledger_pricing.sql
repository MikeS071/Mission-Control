CREATE TABLE IF NOT EXISTS "usage_ledger" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  "request_id" text,
  "model" text DEFAULT 'unknown' NOT NULL,
  "provider" text DEFAULT 'unknown' NOT NULL,
  "tokens_in" integer DEFAULT 0 NOT NULL,
  "tokens_out" integer DEFAULT 0 NOT NULL,
  "cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
  "tenant_cost_usd" numeric(12, 6),
  "hypothetical_cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
  "saved_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
  "cache_hit" boolean DEFAULT false NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "usage_ledger" ADD COLUMN IF NOT EXISTS "tenant_cost_usd" numeric(12, 6);

CREATE TABLE IF NOT EXISTS "usage_summary" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  "period" text NOT NULL,
  "period_start" date NOT NULL,
  "requests" integer DEFAULT 0 NOT NULL,
  "tokens_in" integer DEFAULT 0 NOT NULL,
  "tokens_out" integer DEFAULT 0 NOT NULL,
  "cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
  "tenant_cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
  "saved_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "usage_summary_tenant_period_start_uidx"
  ON "usage_summary" ("tenant_id", "period", "period_start");
