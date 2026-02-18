import { redirect } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KanbanBoard } from '@/components/KanbanBoard';
import { FileExplorer } from '@/components/FileExplorer';
import { GatewayStatus } from '@/components/GatewayStatus';
import { ActivityFeed } from '@/components/ActivityFeed';
import { auth } from '@/lib/auth';

export default async function DashboardPage() {
  const session = await auth();

  if (!session) {
    redirect('/signin');
  }

  return (
    <div className="min-h-screen bg-gray-950 p-4 text-white">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">🧭 Mission Control</h1>
        <span className="text-sm text-gray-400">{session.user?.email}</span>
      </div>
      <Tabs defaultValue="kanban">
        <TabsList className="mb-4">
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="files">Workspace Files</TabsTrigger>
        </TabsList>
        <TabsContent value="status"><GatewayStatus /></TabsContent>
        <TabsContent value="kanban"><KanbanBoard /></TabsContent>
        <TabsContent value="activity"><ActivityFeed /></TabsContent>
        <TabsContent value="files"><FileExplorer /></TabsContent>
      </Tabs>
    </div>
  );
}
