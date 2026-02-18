'use client';

import { FormEvent, useState } from 'react';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M9 7.364v3.273h4.542c-.2 1.052-.8 1.943-1.707 2.543l2.763 2.146c1.607-1.482 2.534-3.664 2.534-6.262 0-.6-.054-1.173-.152-1.727H9Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.805 5.955-2.182L12.19 13.67c-.805.545-1.834.873-3.19.873-2.453 0-4.532-1.655-5.273-3.882H.873v2.218A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#4A90E2"
        d="M3.727 10.661A5.41 5.41 0 0 1 3.436 9c0-.577.1-1.137.291-1.66V5.122H.873A9 9 0 0 0 0 9c0 1.454.345 2.832.873 3.878l2.854-2.217Z"
      />
      <path
        fill="#FBBC05"
        d="M9 3.58c1.322 0 2.507.455 3.439 1.348l2.58-2.58C13.463.89 11.426 0 9 0A9 9 0 0 0 .873 5.122l2.854 2.217C4.468 5.235 6.547 3.58 9 3.58Z"
      />
    </svg>
  );
}

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const handlePasswordSignIn = (event: FormEvent) => {
    event.preventDefault();
    setMessage('Email/password sign-in is coming soon. Use Google for now.');
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-950 px-4 text-white">
      <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900/70 p-8 shadow-xl backdrop-blur-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">🧭 Mission Control</h1>
          <p className="mt-2 text-sm text-gray-400">Sign in to continue</p>
        </div>

        <form className="space-y-4" onSubmit={handlePasswordSignIn}>
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm text-gray-300">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 w-full rounded-md border border-gray-700 bg-gray-950 px-3 text-sm text-white outline-none ring-offset-gray-950 transition placeholder:text-gray-500 focus:border-gray-500 focus:ring-2 focus:ring-gray-600"
              placeholder="you@company.com"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm text-gray-300">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 w-full rounded-md border border-gray-700 bg-gray-950 px-3 text-sm text-white outline-none ring-offset-gray-950 transition placeholder:text-gray-500 focus:border-gray-500 focus:ring-2 focus:ring-gray-600"
              placeholder="••••••••"
            />
          </div>

          <Button type="submit" className="h-11 w-full bg-gray-800 text-white hover:bg-gray-700">
            Sign in
          </Button>
        </form>

        {message && <p className="mt-3 text-center text-xs text-amber-300">{message}</p>}

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-700" />
          <span className="text-xs uppercase tracking-wider text-gray-500">or</span>
          <div className="h-px flex-1 bg-gray-700" />
        </div>

        <button
          type="button"
          onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
          className="flex h-11 w-full items-center justify-center gap-3 rounded-md border border-gray-200 bg-white px-4 text-sm font-medium text-[#1f1f1f] shadow-sm transition hover:bg-gray-100"
        >
          <GoogleLogo />
          <span>Sign in with Google</span>
        </button>
      </div>
    </main>
  );
}
