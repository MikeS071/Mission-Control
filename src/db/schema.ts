import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').default(''),
  status: text('status').notNull().default('todo'), // todo|in_progress|done
  priority: text('priority').default('Medium'), // Low|Medium|High|Critical
  goal: text('goal').default('Goal 1'),
  assignedAgent: text('assigned_agent'),
  tags: text('tags').default(''),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
  agentName: text('agent_name'),
  eventType: text('event_type').notNull(),
  payload: text('payload').default(''),
  createdAt: timestamp('created_at').defaultNow(),
});
