import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to Mission Control with your Google account.',
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: 'https://archonhq.ai/signin',
  },
};

export default function SignInLayout({ children }: { children: ReactNode }) {
  return children;
}
