import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KanbanBoard } from '@/components/KanbanBoard';
import { FileExplorer } from '@/components/FileExplorer';
import { GatewayStatus } from '@/components/GatewayStatus';
import { ActivityFeed } from '@/components/ActivityFeed';
import { AgentCostChart } from '@/components/AgentCostChart';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { gatewayConnections } from '@/db/schema';
import { eq } from 'drizzle-orm';

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect('/signin');

  const gatewayCount = session.tenantId
    ? (await db.select({ id: gatewayConnections.id }).from(gatewayConnections).where(eq(gatewayConnections.tenantId, session.tenantId))).length
    : 0;

  return (
    <div className="min-h-screen bg-gray-950 p-4 text-white">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">🧭 Mission Control</h1>
          <Link href="https://archonhq.ai" target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-indigo-300 hover:text-indigo-200">🌐 View public site</Link>
        </div>
        <span className="text-sm text-gray-400">{session.user?.email}</span>
      </div>

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
        </TabsList>
        <TabsContent value="status"><GatewayStatus /></TabsContent>
        <TabsContent value="kanban"><KanbanBoard /></TabsContent>
        <TabsContent value="activity"><ActivityFeed /></TabsContent>
        <TabsContent value="agents"><AgentCostChart /></TabsContent>
        <TabsContent value="files"><FileExplorer /></TabsContent>
      </Tabs>
    </div>
  );
}
