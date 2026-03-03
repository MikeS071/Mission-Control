CREATE TABLE IF NOT EXISTS "content_social_posts" (
  "id" serial PRIMARY KEY,
  "content_item_id" integer NOT NULL REFERENCES "insights"("id") ON DELETE CASCADE,
  "platform" text NOT NULL,
  "text" text NOT NULL,
  "scheduled_at" timestamp with time zone NOT NULL,
  "status" text NOT NULL,
  "posted_at" timestamp with time zone,
  "error" text
);

CREATE INDEX IF NOT EXISTS "content_social_posts_content_item_scheduled_idx"
  ON "content_social_posts" ("content_item_id", "scheduled_at");
