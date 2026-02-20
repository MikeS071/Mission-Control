import 'fumadocs-ui/style.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { source } from '@/lib/source';

export default function DocsRootLayout({ children }: { children: ReactNode }) {
  return (
    <RootProvider>
      <DocsLayout
        tree={source.pageTree}
        nav={{
          title: (
            <span className="font-semibold tracking-tight">
              Mission Control{' '}
              <span style={{ color: '#2dd47a', fontSize: '0.7rem', fontWeight: 400, marginLeft: '4px' }}>
                docs
              </span>
            </span>
          ),
          url: '/',
        }}
        links={[
          { type: 'main', text: 'Dashboard', url: 'https://archonhq.ai/dashboard' },
          { type: 'main', text: 'Roadmap', url: '/roadmap' },
        ]}
        sidebar={{
          defaultOpenLevel: 1,
        }}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
