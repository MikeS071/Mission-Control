-- ContentAI content items catalog

CREATE TABLE IF NOT EXISTS "content_items" (
  "id" serial PRIMARY KEY,
  "tenant_id" integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "summary" text,
  "content_md" text NOT NULL DEFAULT '',
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "content_items_tenant_slug_uniq"
  ON "content_items" ("tenant_id", "slug");

CREATE INDEX IF NOT EXISTS "content_items_tenant_status_updated_idx"
  ON "content_items" ("tenant_id", "status", "updated_at" DESC);
