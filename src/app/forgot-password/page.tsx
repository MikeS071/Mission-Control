'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !/[^@\s]+@[^@\s]+\.[^@\s]+/.test(normalizedEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }

      setSuccess(true);
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <main className="min-h-screen bg-[#0a1a12] px-4 py-16 text-[#f1f5f0]">
        <div className="mx-auto max-w-md">
          <div className="mb-10 flex flex-col gap-3 text-center">
            <p className="text-xs font-mono uppercase tracking-[0.25em] text-[#ff6b8a]">ArchonHQ · Mission Control</p>
            <h1 className="text-4xl font-extrabold tracking-tight" style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}>
              Check your email
            </h1>
          </div>

          <div className="space-y-6 rounded-3xl border border-[#1a3020] bg-[#0f2418] p-8 shadow-2xl">
            <div className="rounded-2xl border border-[#2dd47a]/30 bg-[#2dd47a]/10 p-4 text-sm text-[#2dd47a]">
              If an account exists with that email, we've sent a password reset link. Check your inbox (and spam folder).
            </div>

            <p className="text-sm text-[#a3b8a8] text-center">
              The link will expire in 1 hour.
            </p>

            <div className="text-center">
              <Link
                href="/signin"
                className="text-sm text-[#ff6b8a] underline-offset-2 hover:underline"
              >
                Back to sign in
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a1a12] px-4 py-16 text-[#f1f5f0]">
      <div className="mx-auto max-w-md">
        <div className="mb-10 flex flex-col gap-3 text-center">
          <p className="text-xs font-mono uppercase tracking-[0.25em] text-[#ff6b8a]">ArchonHQ · Mission Control</p>
          <h1 className="text-4xl font-extrabold tracking-tight" style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}>
            Reset your password
          </h1>
          <p className="text-sm text-[#a3b8a8]">Enter your email to receive a reset link.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-3xl border border-[#1a3020] bg-[#0f2418] p-8 shadow-2xl"
        >
          <div>
            <label className="text-sm text-[#a3b8a8]" htmlFor="email">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 h-11 w-full rounded-2xl border border-[#1a3020] bg-[#102a1c] px-4 text-sm text-[#f1f5f0] outline-none focus:border-[#ff6b8a]"
              placeholder="alex@ops.team"
              autoComplete="email"
              autoFocus
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-[#ff3b6f] px-6 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:opacity-40"
          >
            {submitting ? 'Sending...' : 'Send reset link'}
          </button>

          <div className="text-center text-xs text-[#6a7f6f]">
            Remember your password?{' '}
            <Link href="/signin" className="text-[#ff6b8a] underline-offset-2 hover:underline">
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
