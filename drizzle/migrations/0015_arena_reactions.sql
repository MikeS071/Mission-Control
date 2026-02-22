CREATE TABLE arena_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_tenant_id bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  to_tenant_id bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reaction_type text NOT NULL CHECK (reaction_type IN ('tribute', 'respect', 'hype')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_reaction CHECK (from_tenant_id <> to_tenant_id)
);

CREATE INDEX idx_arena_reactions_to_created ON arena_reactions (to_tenant_id, created_at DESC);
CREATE INDEX idx_arena_reactions_from_created ON arena_reactions (from_tenant_id, created_at DESC);

CREATE TABLE arena_reaction_counters (
  to_tenant_id bigint PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  tribute_count int NOT NULL DEFAULT 0,
  respect_count int NOT NULL DEFAULT 0,
  hype_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
