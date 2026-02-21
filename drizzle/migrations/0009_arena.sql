ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_cost_usd NUMERIC(12,6);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS arena_seasons (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  season_code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Australia/Melbourne',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, season_code),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS arena_challenges (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  season_id INTEGER REFERENCES arena_seasons(id) ON DELETE SET NULL,
  challenge_key TEXT NOT NULL,
  challenge_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  operator TEXT NOT NULL DEFAULT 'gte',
  target_value NUMERIC(14,4) NOT NULL,
  min_sample_size INTEGER DEFAULT 0,
  reward_xp INTEGER NOT NULL,
  difficulty TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  reset_rule TEXT NOT NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, challenge_key, season_id)
);

CREATE TABLE IF NOT EXISTS arena_user_progress (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  challenge_id INTEGER NOT NULL REFERENCES arena_challenges(id) ON DELETE CASCADE,
  season_id INTEGER REFERENCES arena_seasons(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL DEFAULT 'system',
  agent_name TEXT,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  current_value NUMERIC(14,4) NOT NULL DEFAULT 0,
  target_value NUMERIC(14,4) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  completed_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  reward_xp_awarded INTEGER,
  streak_multiplier NUMERIC(6,3) DEFAULT 1.000,
  source_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end > period_start),
  UNIQUE (tenant_id, challenge_id, user_email, agent_name, period_start)
);

CREATE TABLE IF NOT EXISTS arena_streaks (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  current_streak_days INTEGER NOT NULL DEFAULT 0 CHECK (current_streak_days >= 0),
  longest_streak_days INTEGER NOT NULL DEFAULT 0 CHECK (longest_streak_days >= 0),
  last_qualified_on DATE,
  last_broken_on DATE,
  freeze_charges INTEGER NOT NULL DEFAULT 0 CHECK (freeze_charges >= 0 AND freeze_charges <= 2),
  auto_freeze_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  freeze_progress_days INTEGER NOT NULL DEFAULT 0 CHECK (freeze_progress_days >= 0 AND freeze_progress_days <= 6),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, agent_name)
);

CREATE TABLE IF NOT EXISTS arena_streak_history (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  local_day DATE NOT NULL,
  qualified BOOLEAN NOT NULL DEFAULT FALSE,
  tasks_completed_count INTEGER NOT NULL DEFAULT 0 CHECK (tasks_completed_count >= 0),
  freeze_used BOOLEAN NOT NULL DEFAULT FALSE,
  break_occurred BOOLEAN NOT NULL DEFAULT FALSE,
  streak_after_day INTEGER NOT NULL DEFAULT 0 CHECK (streak_after_day >= 0),
  multiplier_after_day NUMERIC(4,2) NOT NULL DEFAULT 1.00,
  source TEXT NOT NULL DEFAULT 'event+finalizer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, agent_name, local_day)
);

CREATE INDEX IF NOT EXISTS idx_arena_challenges_tenant_type_active ON arena_challenges (tenant_id, challenge_type, active);
CREATE INDEX IF NOT EXISTS idx_arena_progress_tenant_status_period ON arena_user_progress (tenant_id, status, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_arena_progress_challenge ON arena_user_progress (challenge_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_arena_streaks_tenant ON arena_streaks (tenant_id);
CREATE INDEX IF NOT EXISTS idx_arena_streaks_tenant_current ON arena_streaks (tenant_id, current_streak_days DESC);
CREATE INDEX IF NOT EXISTS idx_arena_streak_history_tenant_agent_day ON arena_streak_history (tenant_id, agent_name, local_day DESC);
