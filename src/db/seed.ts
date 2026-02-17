import { db } from '@/lib/db';
import { tasks } from './schema';

const seed = [
  { title: 'Goal 1: Blog Pipeline', description: 'Daily scan → shortlist → outline → draft with approvals', status: 'in_progress', agent: 'Navi', priority: 'high' },
  { title: 'Goal 2: X/Twitter Reply Partner', description: 'Brave+HN scan → Claude drafts → manual review', status: 'in_progress', agent: 'Navi', priority: 'high' },
  { title: 'Goal 3: Mission Control', description: 'Multi-bot dashboard — this very board', status: 'in_progress', agent: 'Navi', priority: 'high' },
  { title: 'Goal 4: Coding Assistant', description: 'Quick clean implementation help via claude-sonnet-4-5', status: 'done', agent: 'Navi', priority: 'medium' },
  { title: 'Goal 5: Cost Optimisation', description: 'Aggressive token/model cost reduction across all LLM calls', status: 'done', agent: 'Navi', priority: 'medium' },
];

async function main() {
  await db.insert(tasks).values(seed);
  console.log('Seeded');
  process.exit(0);
}
main();
