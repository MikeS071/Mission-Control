import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').default(''),
  status: text('status').notNull().default('backlog'), // backlog|assigned|in_progress|review|done
  agent: text('agent').default(''),
  priority: text('priority').default('medium'), // low|medium|high
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
