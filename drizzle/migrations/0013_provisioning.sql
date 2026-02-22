CREATE TYPE provision_status AS ENUM ('pending', 'creating', 'configuring', 'ready', 'failed');

CREATE TABLE IF NOT EXISTS "provisioned_instances" (
  "id" serial PRIMARY KEY,
  "tenant_id" integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "droplet_id" bigint,
  "droplet_ip" text,
  "status" provision_status NOT NULL DEFAULT 'pending',
  "error_message" text,
  "plan" text NOT NULL,
  "is_trial" boolean DEFAULT false,
  "ttl_expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
