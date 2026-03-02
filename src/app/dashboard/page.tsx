import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { KanbanBoard } from '@/components/KanbanBoard';
import { FileExplorer } from '@/components/FileExplorer';
import { ArenaPanel } from '@/components/ArenaPanel';
import { AiPipeWidget } from '@/components/AiPipeWidget';
import { ChatPanel } from '@/components/ChatPanel';
import { GatewayHeartbeatIndicator } from '@/components/GatewayHeartbeatIndicator';
import { UserAvatarMenu } from '@/components/UserAvatarMenu';
import { NavbarArenaProgress } from '@/components/NavbarArenaProgress';
import { auth } from '@/lib/auth';
import { getTenantPlan, getTenantPlanLabel } from '@/lib/billing';
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
  const planLabel = getTenantPlanLabel(plan);
  const isAdmin = tenantId === 1; // Admin tenant check

  return (
    <Tabs defaultValue="kanban" className="flex h-full flex-col bg-gray-950 text-white">

      {/* ── Unified top navbar ── */}
      <nav className="sticky top-0 z-50 flex h-14 flex-shrink-0 items-center gap-0 border-b border-gray-800 bg-gray-900/95 px-4 backdrop-blur">

        {/* Logo + workspace */}
        <div className="flex flex-shrink-0 items-center gap-2 pr-6 border-r border-gray-800 mr-4">
          <span className="text-lg font-bold tracking-tight text-white">Archon<span className="text-red-500">HQ</span></span>
          <span className="text-gray-700 select-none">·</span>
          <span className="text-xs text-gray-400 max-w-[160px] truncate">{tenant?.name ?? 'Workspace'}</span>
          <Badge variant="secondary" className="ml-0.5 text-[10px] px-1.5 py-0">{planLabel}</Badge>
        </div>

        {/* Navigation tabs */}
        <TabsList className="h-8 bg-transparent p-0 gap-0.5">
          <TabsTrigger value="kanban"    className="h-8 px-3 text-xs data-[state=active]:bg-gray-800 data-[state=active]:text-white text-gray-400">Mission Control</TabsTrigger>
          <TabsTrigger value="files"     className="h-8 px-3 text-xs data-[state=active]:bg-gray-800 data-[state=active]:text-white text-gray-400">Memory</TabsTrigger>
          <TabsTrigger value="progress"  className="h-8 px-3 text-xs data-[state=active]:bg-gray-800 data-[state=active]:text-white text-gray-400">Arena</TabsTrigger>
          <TabsTrigger value="router"    className="h-8 px-3 text-xs data-[state=active]:bg-gray-800 data-[state=active]:text-white text-gray-400">⚡ Router</TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="admin" className="h-8 px-3 text-xs data-[state=active]:bg-gray-800 data-[state=active]:text-white text-gray-400">🔧 Admin</TabsTrigger>
          )}
        </TabsList>
        <Link
          href="/dashboard/usage"
          className="ml-2 inline-flex h-8 items-center rounded-md border border-gray-700 px-3 text-xs text-gray-300 transition hover:border-gray-500 hover:text-white"
        >
          Usage
        </Link>

        <div className="ml-auto px-3">
          <NavbarArenaProgress />
        </div>

        {/* Right-side controls */}
        <div className="flex items-center gap-3">
          {process.env.NODE_ENV === 'development' && (
            <Link
              href="https://archonhq.ai"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors hidden sm:block"
            >
              🌐 Public site
            </Link>
          )}
          <GatewayHeartbeatIndicator />
          <UserAvatarMenu email={session.user?.email} image={session.user?.image} />
        </div>
      </nav>

      {/* ── Setup banners (shown below nav, above content) ── */}
      {(!setupComplete || gatewayCount === 0) && (
        <div className="px-4 pt-3 space-y-2 flex-shrink-0">
          {!setupComplete && (
            <div className="rounded-md border border-amber-700/50 bg-amber-950/30 px-4 py-2.5 text-sm text-amber-100">
              Complete setup to unlock your AI team.{' '}
              <Link href="/dashboard/connect" className="font-semibold text-amber-300 hover:text-amber-200">Open Setup Wizard</Link>
            </div>
          )}
          {gatewayCount === 0 && (
            <div className="rounded-md border border-indigo-700/50 bg-indigo-950/30 px-4 py-2.5 text-sm text-indigo-100">
              No gateway connected yet.{' '}
              <Link href="/dashboard/connect" className="font-semibold text-indigo-300 hover:text-indigo-200">Connect Gateway</Link>
            </div>
          )}
        </div>
      )}

      {/* ── Tab content ── */}
      <div className="flex-1 flex flex-col px-4 pt-4 pb-4 min-h-0">
        <TabsContent value="kanban"   className="mt-0 flex-1 min-h-0"><KanbanBoard /></TabsContent>
        <TabsContent value="files"    className="mt-0"><FileExplorer /></TabsContent>
        <TabsContent value="progress" className="mt-0"><ArenaPanel /></TabsContent>
        <TabsContent value="router"   className="mt-0"><AiPipeWidget /></TabsContent>
        <TabsContent value="chat"     className="mt-0 h-[calc(100vh-120px)]"><ChatPanel /></TabsContent>
        {isAdmin && (
          <TabsContent value="admin" className="mt-0">
            <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-6">
              <h2 className="text-lg font-semibold text-white">Admin Controls</h2>
              <p className="mt-2 text-sm text-gray-400">Provisioning and policy tools moved to the dedicated admin area.</p>
              <Link
                href="/admin"
                className="mt-4 inline-flex items-center rounded-md border border-sky-700/70 bg-sky-900/25 px-4 py-2 text-sm font-medium text-sky-200 transition hover:bg-sky-900/40"
              >
                Open Admin Console
              </Link>
            </div>
          </TabsContent>
        )}
      </div>

    </Tabs>
  );
}
