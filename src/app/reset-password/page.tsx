'use client';

import { FormEvent, Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

function passwordStrength(password: string) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  const labels = ['Too weak', 'Weak', 'Okay', 'Strong', 'Very strong'];
  return {
    score,
    label: password ? labels[Math.min(score, labels.length - 1)] : 'Too weak',
  };
}

function ResetPasswordPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const strength = passwordStrength(password);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    if (!token) {
      setError('Missing reset token');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }

      router.push('/signin?message=password-reset');
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <main className="min-h-screen bg-[#0a1a12] px-4 py-16 text-[#f1f5f0]">
        <div className="mx-auto max-w-md">
          <div className="mb-10 flex flex-col gap-3 text-center">
            <p className="text-xs font-mono uppercase tracking-[0.25em] text-[#ff6b8a]">ArchonHQ · Mission Control</p>
            <h1 className="text-4xl font-extrabold tracking-tight" style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}>
              Invalid reset link
            </h1>
          </div>

          <div className="space-y-6 rounded-3xl border border-[#1a3020] bg-[#0f2418] p-8 shadow-2xl">
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              This reset link is invalid or expired.
            </div>

            <div className="text-center">
              <Link
                href="/forgot-password"
                className="text-sm text-[#ff6b8a] underline-offset-2 hover:underline"
              >
                Request a new reset link
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
            Set new password
          </h1>
          <p className="text-sm text-[#a3b8a8]">Choose a strong password you'll remember.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-3xl border border-[#1a3020] bg-[#0f2418] p-8 shadow-2xl"
        >
          <div>
            <label className="text-sm text-[#a3b8a8]" htmlFor="password">
              New password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 h-11 w-full rounded-2xl border border-[#1a3020] bg-[#102a1c] px-4 text-sm text-[#f1f5f0] outline-none focus:border-[#ff6b8a]"
              placeholder="••••••••"
              autoComplete="new-password"
              autoFocus
            />
            <div className="mt-2 flex items-center gap-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className={`h-1 flex-1 rounded-full ${strength.score >= i ? 'bg-[#2dd47a]' : 'bg-[#1a3020]'}`}
                />
              ))}
              <span className="text-xs text-[#a3b8a8]">{strength.label}</span>
            </div>
          </div>

          <div>
            <label className="text-sm text-[#a3b8a8]" htmlFor="confirm-password">
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-2 h-11 w-full rounded-2xl border border-[#1a3020] bg-[#102a1c] px-4 text-sm text-[#f1f5f0] outline-none focus:border-[#ff6b8a]"
              placeholder="Repeat password"
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || password.length < 8 || password !== confirmPassword}
            className="w-full rounded-xl bg-[#ff3b6f] px-6 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:opacity-40"
          >
            {submitting ? 'Resetting password...' : 'Reset password'}
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

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordPageInner />
    </Suspense>
  );
}
