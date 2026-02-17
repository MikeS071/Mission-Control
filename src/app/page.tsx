'use client';
import { useSession, signIn } from 'next-auth/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KanbanBoard } from '@/components/KanbanBoard';
import { FileExplorer } from '@/components/FileExplorer';
import { GatewayStatus } from '@/components/GatewayStatus';
import { Button } from '@/components/ui/button';

export default function Home() {
  const { data: session, status } = useSession();

  if (status === 'loading') return <div className="flex h-screen items-center justify-center text-white">Loading…</div>;
  if (!session) return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-950 text-white">
      <h1 className="text-2xl font-bold">Mission Control</h1>
      <Button onClick={() => signIn('google')}>Sign in with Google</Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">🧭 Mission Control</h1>
        <span className="text-sm text-gray-400">{session.user?.email}</span>
      </div>
      <Tabs defaultValue="kanban">
        <TabsList className="mb-4">
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="files">Workspace Files</TabsTrigger>
        </TabsList>
        <TabsContent value="status"><GatewayStatus /></TabsContent>
        <TabsContent value="kanban"><KanbanBoard /></TabsContent>
        <TabsContent value="files"><FileExplorer /></TabsContent>
      </Tabs>
    </div>
  );
}
