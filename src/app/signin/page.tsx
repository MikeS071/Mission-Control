'use client';

import { FormEvent, Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#EA4335" d="M9 7.364v3.273h4.542c-.2 1.052-.8 1.943-1.707 2.543l2.763 2.146c1.607-1.482 2.534-3.664 2.534-6.262 0-.6-.054-1.173-.152-1.727H9Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.805 5.955-2.182L12.19 13.67c-.805.545-1.834.873-3.19.873-2.453 0-4.532-1.655-5.273-3.882H.873v2.218A9 9 0 0 0 9 18Z" />
      <path fill="#4A90E2" d="M3.727 10.661A5.41 5.41 0 0 1 3.436 9c0-.577.1-1.137.291-1.66V5.122H.873A9 9 0 0 0 0 9c0 1.454.345 2.832.873 3.878l2.854-2.217Z" />
      <path fill="#FBBC05" d="M9 3.58c1.322 0 2.507.455 3.439 1.348l2.58-2.58C13.463.89 11.426 0 9 0A9 9 0 0 0 .873 5.122l2.854 2.217C4.468 5.235 6.547 3.58 9 3.58Z" />
    </svg>
  );
}

function SignInPageInner() {
  const searchParams = useSearchParams();
  const message = searchParams.get('message');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePasswordSignIn = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const normalized = email.trim().toLowerCase();
    if (!normalized || !password) {
      setError('Enter your email and password.');
      return;
    }
    setIsSubmitting(true);
    const result = await signIn('credentials', {
      redirect: false,
      email: normalized,
      password,
    });
    setIsSubmitting(false);
    if (result?.error) {
      setError('Invalid email or password.');
      return;
    }
    window.location.href = '/dashboard';
  };

  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center px-4 text-[#f1f5f0]"
      style={{ background: '#0a1a12' }}
    >
      {/* Background orbs */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-48 -top-48 h-[500px] w-[500px] rounded-full blur-[120px]" style={{ background: 'rgba(255,59,111,0.07)' }} />
        <div className="absolute -bottom-48 -right-24 h-[400px] w-[400px] rounded-full blur-[100px]" style={{ background: 'rgba(45,212,122,0.07)' }} />
      </div>

      {/* Return to home */}
      <Link
        href="/"
        className="absolute left-6 top-6 flex items-center gap-1.5 text-sm transition hover:text-[#ff6b8a]"
        style={{ color: '#6a7f6f', fontFamily: 'var(--font-jetbrains, monospace)' }}
      >
        ← Return to home
      </Link>

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl p-8 shadow-2xl backdrop-blur-sm"
        style={{ border: '1px solid rgba(45,212,122,0.15)', background: '#0f2418' }}
      >
        {/* Top accent line */}
        <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-2xl" style={{ background: 'linear-gradient(90deg, transparent, #ff3b6f, #2dd47a, transparent)' }} />

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}>
            Archon<span className="text-red-500">HQ</span>
          </h1>
          <p className="mt-2 text-sm" style={{ color: '#6a7f6f' }}>Sign in to continue</p>
        </div>

        {message === 'password-reset' && (
          <div className="mb-4 rounded-xl border border-[#2dd47a]/30 bg-[#2dd47a]/10 p-3 text-sm text-[#2dd47a] text-center">
            Password successfully reset! Please sign in with your new password.
          </div>
        )}

        <form className="space-y-4" onSubmit={handlePasswordSignIn}>
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm" style={{ color: '#a3b8a8' }}>Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 w-full rounded-xl px-3 text-sm text-[#f1f5f0] outline-none transition placeholder-[#6a7f6f]"
              style={{ border: '1px solid rgba(45,212,122,0.2)', background: 'rgba(45,212,122,0.04)' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,59,111,0.45)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255,59,111,0.1)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(45,212,122,0.2)'; e.currentTarget.style.boxShadow = 'none'; }}
              placeholder="you@company.com"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm" style={{ color: '#a3b8a8' }}>Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 w-full rounded-xl px-3 text-sm text-[#f1f5f0] outline-none transition"
              style={{ border: '1px solid rgba(45,212,122,0.2)', background: 'rgba(45,212,122,0.04)' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,59,111,0.45)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255,59,111,0.1)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(45,212,122,0.2)'; e.currentTarget.style.boxShadow = 'none'; }}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="h-11 w-full rounded-xl text-sm font-semibold text-[#a3b8a8] transition hover:-translate-y-px disabled:cursor-not-allowed"
            style={{ border: '1px solid rgba(45,212,122,0.2)', background: 'rgba(45,212,122,0.06)' }}
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {error && <p className="mt-3 text-center text-xs text-[#ff6b8a]">{error}</p>}

        <div className="mt-4 flex items-center justify-between text-xs" style={{ color: '#6a7f6f' }}>
          <Link href="/forgot-password" className="transition hover:text-[#ff6b8a]">Forgot password?</Link>
          <Link href="/signup" className="transition hover:text-[#ff6b8a]">Need an account?</Link>
        </div>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1" style={{ background: 'rgba(45,212,122,0.12)' }} />
          <span className="text-xs uppercase tracking-wider" style={{ color: '#6a7f6f' }}>or</span>
          <div className="h-px flex-1" style={{ background: 'rgba(45,212,122,0.12)' }} />
        </div>

        <button
          type="button"
          onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
          className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-[#1f1f1f] shadow-sm transition hover:bg-gray-50 hover:-translate-y-px"
        >
          <GoogleLogo />
          <span>Sign in with Google</span>
        </button>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInPageInner />
    </Suspense>
  );
}
