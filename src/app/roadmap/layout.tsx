import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Roadmap',
  description:
    'See what the Mission Control team is building next. Vote on features, track what\'s shipped, and follow the path to production.',
  openGraph: {
    title: 'Roadmap | Mission Control',
    description:
      'Track what\'s shipping, vote on features, and see what\'s coming next in Mission Control.',
    url: 'https://archonhq.ai/roadmap',
  },
  alternates: {
    canonical: 'https://archonhq.ai/roadmap',
  },
};

export default function RoadmapLayout({ children }: { children: ReactNode }) {
  return children;
}
