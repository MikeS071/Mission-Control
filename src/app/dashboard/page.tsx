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
import { GatewayHeartbeatIndicator } from '@/components/GatewayHeartbeatIndicator';
import { UserAvatarMenu } from '@/components/UserAvatarMenu';
import { auth } from '@/lib/auth';
import { getTenantPlan } from '@/lib/billing';
import { db } from '@/lib/db';
import { gatewayConnections, tenantSettings, tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect('/signin');

  const tenantId = session.tenantId;
  const gatewayCount = tenantId
    ? (await db.select({ id: gatewayConnections.id }).from(gatewayConnections).where(eq(gatewayConnections.tenantId, tenantId))).length
    : 0;

  const [tenant] = tenantId
    ? await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1)
    : [null];
  const [settingsRow] = tenantId
    ? await db
        .select({ settings: tenantSettings.settings })
        .from(tenantSettings)
        .where(eq(tenantSettings.tenantId, tenantId))
        .limit(1)
    : [null];
  const settings = (settingsRow?.settings ?? {}) as {
    anthropicKey?: string;
    openaiKey?: string;
    xaiKey?: string;
    gateway?: { connected?: boolean };
  };
  const hasAnyApiKey = Boolean(settings.anthropicKey || settings.openaiKey || settings.xaiKey);
  const setupComplete = (gatewayCount > 0 || settings.gateway?.connected) && hasAnyApiKey;

  const plan = tenantId ? await getTenantPlan(tenantId) : 'free';

  return (
    <div className="min-h-screen bg-gray-950 p-4 text-white">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">🧭 Mission Control</h1>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm text-gray-400">{tenant?.name ?? 'Tenant'}</span>
            <Badge variant="secondary">{plan === 'free' ? 'Free' : plan === 'pro' ? 'Pro' : 'Team'}</Badge>
          </div>
          <Link href="https://archonhq.ai" target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-indigo-300 hover:text-indigo-200">🌐 View public site</Link>
        </div>
        <div className="flex items-center gap-3">
          <GatewayHeartbeatIndicator />
          <UserAvatarMenu email={session.user?.email} image={session.user?.image} />
        </div>
      </div>

      {!setupComplete && (
        <div className="mb-4 rounded-md border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
          Complete setup to unlock your AI team.{' '}
          <Link href="/dashboard/connect" className="font-semibold text-amber-300 hover:text-amber-200">Open Setup Wizard</Link>
        </div>
      )}

      {gatewayCount === 0 && (
        <div className="mb-4 rounded-md border border-indigo-700/50 bg-indigo-950/30 px-4 py-3 text-sm text-indigo-100">
          No gateway connected yet.{' '}
          <Link href="/dashboard/connect" className="font-semibold text-indigo-300 hover:text-indigo-200">Connect Gateway</Link>
        </div>
      )}

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
