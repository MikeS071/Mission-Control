import { bigint, boolean, date, integer, jsonb, numeric, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenants = pgTable('tenants', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  plan: text('plan').notNull().default('free'), // free|pro|team
  ownerUserId: integer('owner_user_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});

export const memberships = pgTable('memberships', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  userEmail: text('user_email').notNull(),
  role: text('role').notNull().default('member'), // owner|admin|member
  createdAt: timestamp('created_at').defaultNow(),
});

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').default(''),
  status: text('status').notNull().default('todo'), // todo|in_progress|done
  priority: text('priority').default('Medium'), // Low|Medium|High|Critical
  goal: text('goal').default('Goal 1'),
  goalId: text('goal_id'),
  assignedAgent: text('assigned_agent'),
  tags: text('tags').default(''),
  checklist: text('checklist').default('[]'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  estimatedCostUsd: numeric('estimated_cost_usd', { precision: 12, scale: 6 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  taskId: integer('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
  agentName: text('agent_name'),
  eventType: text('event_type').notNull(),
  payload: text('payload').default(''),
  createdAt: timestamp('created_at').defaultNow(),
});

export const heartbeats = pgTable('heartbeats', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  source: text('source').notNull(), // 'gateway' | 'agent:<name>'
  status: text('status').notNull(), // 'ok' | 'error' | 'unknown'
  payload: text('payload').default(''), // JSON string
  checkedAt: timestamp('checked_at').defaultNow(),
});

export const agentStats = pgTable('agent_stats', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  agentName: text('agent_name').notNull(),
  tokens: integer('tokens').default(0),
  costUsd: text('cost_usd').default('0.00'),
  recordedAt: timestamp('recorded_at').defaultNow(),
});

export const gatewayConnections = pgTable('gateway_connections', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  label: text('label').notNull().default('My Gateway'),
  url: text('url').notNull(),
  tokenHash: text('token_hash'),
  status: text('status').notNull().default('unknown'),
  lastCheckedAt: timestamp('last_checked_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const waitlist = pgTable('waitlist', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  source: text('source').default('landing'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const featureRequests = pgTable('feature_requests', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  description: text('description').notNull(),
  status: text('status').default('pending'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .notNull()
    .unique()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  plan: text('plan').notNull().default('free'),
  seats: integer('seats').default(1),
  status: text('status').notNull().default('active'),
  currentPeriodEnd: timestamp('current_period_end'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const tenantSettings = pgTable('tenant_settings', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .notNull()
    .unique()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  settings: jsonb('settings').notNull().default({}),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const xpLedger = pgTable('xp_ledger', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  userEmail: text('user_email').notNull().default('system'),
  points: integer('points').notNull(),
  reason: text('reason').notNull(),
  refId: text('ref_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const streaks = pgTable('streaks', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  userEmail: text('user_email').notNull().default('system'),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  lastActivityDate: text('last_activity_date'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const newsletterIssues = pgTable('newsletter_issues', {
  id:          serial('id').primaryKey(),
  issueNumber: integer('issue_number').notNull(),
  subject:     text('subject').notNull(),
  html:        text('html').notNull(),
  sentAt:      timestamp('sent_at', { withTimezone: true }).defaultNow(),
});

export const challenges = pgTable('challenges', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').default(''),
  xpReward: integer('xp_reward').notNull().default(50),
  status: text('status').notNull().default('active'),
  dueDate: text('due_date'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insights = pgTable('insights', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  contentMd: text('content_md').notNull(),
  sourceUrl: text('source_url'),
  imageUrl: text('image_url'),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const arenaSeasons = pgTable('arena_seasons', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  seasonCode: text('season_code').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull().default('upcoming'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  timezone: text('timezone').notNull().default('Australia/Melbourne'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const arenaChallenges = pgTable('arena_challenges', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  seasonId: integer('season_id').references(() => arenaSeasons.id, { onDelete: 'set null' }),
  challengeKey: text('challenge_key').notNull(),
  challengeType: text('challenge_type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  metricKey: text('metric_key').notNull(),
  operator: text('operator').notNull().default('gte'),
  targetValue: numeric('target_value', { precision: 14, scale: 4 }).notNull(),
  minSampleSize: integer('min_sample_size').default(0),
  rewardXp: integer('reward_xp').notNull(),
  difficulty: text('difficulty').notNull(),
  active: boolean('active').notNull().default(true),
  resetRule: text('reset_rule').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const arenaUserProgress = pgTable('arena_user_progress', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  challengeId: integer('challenge_id').notNull().references(() => arenaChallenges.id, { onDelete: 'cascade' }),
  seasonId: integer('season_id').references(() => arenaSeasons.id, { onDelete: 'set null' }),
  userEmail: text('user_email').notNull().default('system'),
  agentName: text('agent_name'),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  currentValue: numeric('current_value', { precision: 14, scale: 4 }).notNull().default('0'),
  targetValue: numeric('target_value', { precision: 14, scale: 4 }).notNull(),
  status: text('status').notNull().default('active'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  rewardXpAwarded: integer('reward_xp_awarded'),
  streakMultiplier: numeric('streak_multiplier', { precision: 6, scale: 3 }).default('1.000'),
  sourceSnapshot: jsonb('source_snapshot').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const arenaStreaks = pgTable('arena_streaks', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  tenantId: integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  agentName: text('agent_name').notNull(),
  currentStreakDays: integer('current_streak_days').notNull().default(0),
  longestStreakDays: integer('longest_streak_days').notNull().default(0),
  lastQualifiedOn: date('last_qualified_on'),
  lastBrokenOn: date('last_broken_on'),
  freezeCharges: integer('freeze_charges').notNull().default(0),
  autoFreezeEnabled: boolean('auto_freeze_enabled').notNull().default(true),
  freezeProgressDays: integer('freeze_progress_days').notNull().default(0),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const arenaStreakHistory = pgTable('arena_streak_history', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  tenantId: integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  agentName: text('agent_name').notNull(),
  localDay: date('local_day').notNull(),
  qualified: boolean('qualified').notNull().default(false),
  tasksCompletedCount: integer('tasks_completed_count').notNull().default(0),
  freezeUsed: boolean('freeze_used').notNull().default(false),
  breakOccurred: boolean('break_occurred').notNull().default(false),
  streakAfterDay: integer('streak_after_day').notNull().default(0),
  multiplierAfterDay: numeric('multiplier_after_day', { precision: 4, scale: 2 }).notNull().default('1.00'),
  source: text('source').notNull().default('event+finalizer'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});


export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  used: boolean('used').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const provisionedInstances = pgTable('provisioned_instances', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  dropletId: bigint('droplet_id', { mode: 'number' }),
  dropletIp: text('droplet_ip'),
  status: text('status').notNull().default('pending'), // pending|creating|configuring|ready|failed
  errorMessage: text('error_message'),
  plan: text('plan').notNull(),
  isTrial: boolean('is_trial').default(false),
  ttlExpiresAt: timestamp('ttl_expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
