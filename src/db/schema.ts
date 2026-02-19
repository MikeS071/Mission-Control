import { integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  plan: text('plan').notNull().default('free'), // free|pro|team
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
