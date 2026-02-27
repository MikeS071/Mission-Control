import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { readFileSync } from 'fs';
import path from 'path';

export default async function AgentTeamsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/signin');
  }

  const htmlPath = path.join(process.cwd(), 'src', 'app', 'agentteams', 'landing.html');
  const html = readFileSync(htmlPath, 'utf-8');

  return (
    <iframe
      srcDoc={html}
      style={{
        width: '100vw',
        height: '100vh',
        border: 'none',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 9999,
      }}
      title="AgentTeams"
    />
  );
}
