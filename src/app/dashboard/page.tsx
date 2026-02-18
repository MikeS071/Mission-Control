import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { KanbanBoard } from '@/components/KanbanBoard';
import { FileExplorer } from '@/components/FileExplorer';
import { GatewayStatus } from '@/components/GatewayStatus';
import { ActivityFeed } from '@/components/ActivityFeed';
import { AgentCostChart } from '@/components/AgentCostChart';
import { ProgressPanel } from '@/components/ProgressPanel';
import { auth } from '@/lib/auth';
import { getTenantPlan } from '@/lib/billing';
import { db } from '@/lib/db';
import { tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';

export default async function DashboardPage() {
  const session = await auth();

  if (!session) {
    redirect('/signin');
  }

  const tenantId = session.tenantId;
  const [tenant] = tenantId
    ? await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1)
    : [null];
  const plan = tenantId ? await getTenantPlan(tenantId) : 'free';

  return (
    <div className="min-h-screen bg-gray-950 p-4 text-white">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">🧭 Mission Control</h1>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm text-gray-400">{tenant?.name ?? 'Tenant'}</span>
            <Badge variant="secondary">{plan === 'free' ? 'Free' : plan === 'pro' ? 'Pro' : 'Team'}</Badge>
            <Link href="/dashboard/billing" className="text-xs text-indigo-300 hover:text-indigo-200">
              Billing
            </Link>
          </div>
          <Link
            href="https://archonhq.ai"
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-xs text-indigo-300 hover:text-indigo-200"
          >
            🌐 View public site
          </Link>
        </div>
        <span className="text-sm text-gray-400">{session.user?.email}</span>
      </div>
      <Tabs defaultValue="kanban">
        <TabsList className="mb-4">
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="files">Workspace Files</TabsTrigger>
          <TabsTrigger value="progress">Progress</TabsTrigger>
        </TabsList>
        <TabsContent value="status"><GatewayStatus /></TabsContent>
        <TabsContent value="kanban"><KanbanBoard /></TabsContent>
        <TabsContent value="activity"><ActivityFeed /></TabsContent>
        <TabsContent value="agents"><AgentCostChart /></TabsContent>
        <TabsContent value="files"><FileExplorer /></TabsContent>
        <TabsContent value="progress"><ProgressPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
