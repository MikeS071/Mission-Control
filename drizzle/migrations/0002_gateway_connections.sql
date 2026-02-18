CREATE TABLE IF NOT EXISTS "gateway_connections" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL,
  "label" text DEFAULT 'My Gateway' NOT NULL,
  "url" text NOT NULL,
  "token_hash" text,
  "status" text DEFAULT 'unknown' NOT NULL,
  "last_checked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gateway_connections_tenant_id_tenants_id_fk'
  ) THEN
    ALTER TABLE "gateway_connections"
      ADD CONSTRAINT "gateway_connections_tenant_id_tenants_id_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
