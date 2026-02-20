import type { Metadata } from 'next';
import { Inter, Bricolage_Grotesque, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', weight: ['400', '500', '600', '700', '800'] });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', weight: ['400', '500', '600'] });

const BASE_URL = 'https://archonhq.ai';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'Mission Control — AI Agent Coordination Dashboard',
    template: '%s | Mission Control',
  },
  description:
    'Mission Control is an AI agent coordination dashboard. Manage tasks, track agent activity, monitor LLM costs, and route requests to the right model automatically.',
  keywords: [
    'AI agent dashboard',
    'LLM cost optimisation',
    'AI routing',
    'agent coordination',
    'OpenClaw',
    'AiPipe',
    'kanban for AI agents',
  ],
  authors: [{ name: 'ArchonHQ', url: BASE_URL }],
  creator: 'ArchonHQ',
  openGraph: {
    type: 'website',
    locale: 'en_AU',
    url: BASE_URL,
    siteName: 'Mission Control',
    title: 'Mission Control — AI Agent Coordination Dashboard',
    description:
      'One dashboard to coordinate your AI agents, track costs, and cut your LLM spend by up to 50% with automatic smart routing.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mission Control — AI Agent Coordination Dashboard',
    description:
      'One dashboard to coordinate your AI agents, track costs, and cut LLM spend by up to 50%.',
    creator: '@teaser380',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: BASE_URL,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${bricolage.variable} ${jetbrains.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
