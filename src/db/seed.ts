import { db } from '@/lib/db';
import { tasks } from './schema';

// Default tenant ID (Mike's personal tenant, id=1)
const TENANT_ID = 1;

const seed = [
  { tenantId: TENANT_ID, title: 'Goal 1: Blog Pipeline', description: 'Daily scan → shortlist → outline → draft with approvals', status: 'in_progress', assignedAgent: 'Navi', priority: 'High' },
  { tenantId: TENANT_ID, title: 'Goal 2: X/Twitter Reply Partner', description: 'Brave+HN scan → Claude drafts → manual review', status: 'in_progress', assignedAgent: 'Navi', priority: 'High' },
  { tenantId: TENANT_ID, title: 'Goal 3: Mission Control', description: 'Multi-bot dashboard — this very board', status: 'in_progress', assignedAgent: 'Navi', priority: 'High' },
  { tenantId: TENANT_ID, title: 'Goal 4: Coding Assistant', description: 'Quick clean implementation help via claude-sonnet', status: 'done', assignedAgent: 'Navi', priority: 'Medium' },
  { tenantId: TENANT_ID, title: 'Goal 5: Cost Optimisation', description: 'Aggressive token/model cost reduction across all LLM calls', status: 'done', assignedAgent: 'Navi', priority: 'Medium' },
];

async function main() {
  await db.insert(tasks).values(seed);
  console.log('Seeded');
  process.exit(0);
}
main();
