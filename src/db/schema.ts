import { bigint, boolean, date, integer, jsonb, numeric, pgTable, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { PolicyOverrides, PolicyRules, PolicyTier } from '@/lib/policy/schema';

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
  prdPath: text('prd_path'),
  prdCanonicalPath: text('prd_canonical_path'),
  prdVersion: integer('prd_version').notNull().default(1),
  prdLastUpdatedAt: timestamp('prd_last_updated_at', { withTimezone: true }),
  prdMissingRemindedAt: timestamp('prd_missing_reminded_at', { withTimezone: true }),

  completedAt: timestamp('completed_at', { withTimezone: true }),
  estimatedCostUsd: numeric('estimated_cost_usd', { precision: 12, scale: 6 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});


export const taskPrdVersions = pgTable('task_prd_versions', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  taskId: integer('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  path: text('path').notNull(),
  source: text('source').notNull().default('generate'),
  parentVersionId: integer('parent_version_id'),
  changeNote: text('change_note'),
  isCurrent: boolean('is_current').notNull().default(true),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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

export const policies = pgTable('policies', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id)
    .unique(),
  tier: text('tier').$type<PolicyTier>().notNull().default('free'),
  rules: jsonb('rules').$type<PolicyRules>().notNull(),
  customOverrides: jsonb('custom_overrides').$type<PolicyOverrides>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const policyAuditLog = pgTable('policy_audit_log', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id),
  changedBy: integer('changed_by').references(() => users.id),
  oldRules: jsonb('old_rules').$type<PolicyRules>(),
  newRules: jsonb('new_rules').$type<PolicyRules>(),
  changeReason: text('change_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
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

export const arenaReactions = pgTable('arena_reactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  fromTenantId: bigint('from_tenant_id', { mode: 'number' }).notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  toTenantId: bigint('to_tenant_id', { mode: 'number' }).notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  reactionType: text('reaction_type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const arenaReactionCounters = pgTable('arena_reaction_counters', {
  toTenantId: bigint('to_tenant_id', { mode: 'number' }).primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  tributeCount: integer('tribute_count').notNull().default(0),
  respectCount: integer('respect_count').notNull().default(0),
  hypeCount: integer('hype_count').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Chat threads ─────────────────────────────────────────────────────────────
export const chatThreads = pgTable('chat_threads', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('New thread'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  // Message source for policy + audit + channel sync.
  source: text('source').notNull().default('mc'), // 'mc' | 'telegram'
  // External message id (e.g. Telegram message_id). Optional for MC-originated messages.
  externalId: bigint('external_id', { mode: 'number' }),
  threadId: integer('thread_id').references(() => chatThreads.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Telegram (webhook ingress + linking) ─────────────────────────────────────
export const telegramLinks = pgTable('telegram_links', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  telegramUserId: bigint('telegram_user_id', { mode: 'number' }).notNull().unique(),
  telegramChatId: bigint('telegram_chat_id', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

export const telegramLinkTokens = pgTable('telegram_link_tokens', {
  token: text('token').primaryKey(),
  tenantId: integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const telegramUpdates = pgTable('telegram_updates', {
  updateId: bigint('update_id', { mode: 'number' }).primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  telegramUserId: bigint('telegram_user_id', { mode: 'number' }),

  // Payload we need for retries / audit
  telegramChatId: bigint('telegram_chat_id', { mode: 'number' }),
  telegramMessageId: bigint('telegram_message_id', { mode: 'number' }),
  text: text('text'),

  // Processing metadata
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  status: text('status').notNull().default('ignored'), // ignored|linked|forwarded|denied|error
  error: text('error'),

  // Retry controls (auto-restart capability)
  attempts: integer('attempts').notNull().default(0),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  lockedBy: text('locked_by'),
});

// ── Activity feed ─────────────────────────────────────────────────────────────
export const activityQueue = pgTable('activity_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  payloadJson: jsonb('payload_json').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  processed: boolean('processed').notNull().default(false),
});

export const activityEvents = pgTable('activity_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  displayName: text('display_name').notNull(),
  description: text('description').notNull().default(''),
  icon: text('icon').notNull().default('⚡'),
  payloadJson: jsonb('payload_json').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const activityReactions = pgTable('activity_reactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => activityEvents.id, { onDelete: 'cascade' }),
  fromTenantId: integer('from_tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  reactionType: text('reaction_type').notNull(), // 'hype' | 'respect' | 'tribute'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const activityComments = pgTable('activity_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => activityEvents.id, { onDelete: 'cascade' }),
  tenantId: integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
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

export const kanbanTriggers = pgTable('kanban_triggers', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  taskId: integer('task_id').notNull(),
  taskTitle: text('task_title').notNull(),
  taskDescription: text('task_description'),
  action: text('action').notNull(),
  triggeredAt: timestamp('triggered_at').notNull().defaultNow(),
});
