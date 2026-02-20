import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { newsletterIssues, waitlist } from '@/db/schema';
import { desc, sql } from 'drizzle-orm';

function emailToken(email: string): string {
  return Buffer.from(email).toString('base64url');
}

async function getLatestNewsletterIssue(): Promise<{ subject: string; html: string } | null> {
  try {
    const rows = await db
      .select({ subject: newsletterIssues.subject, html: newsletterIssues.html })
      .from(newsletterIssues)
      .orderBy(desc(newsletterIssues.sentAt))
      .limit(1);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

export async function GET() {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(waitlist);
  return NextResponse.json({ count: count ?? 0 });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { email?: string; source?: string };
  const email = body.email?.trim().toLowerCase();
  const source = body.source?.trim() || 'landing';

  if (!email || !emailRegex.test(email)) {
    return NextResponse.json({ ok: false, error: 'Invalid email' }, { status: 400 });
  }

  try {
    await db.insert(waitlist).values({ email, source });
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(waitlist);
    const position = count ?? 0;

    const htmlBody = `<!DOCTYPE html>
<html>
<body style="background:#0a0a0f;color:#e5e7eb;font-family:system-ui,sans-serif;padding:40px 20px;max-width:600px;margin:0 auto;">
  <div style="text-align:center;margin-bottom:32px;">
    <span style="font-size:32px;">🧭</span>
    <h1 style="color:#fff;font-size:24px;margin:12px 0 4px;">You're on the list!</h1>
    <p style="color:#818cf8;margin:0;">Welcome to archonhq early access</p>
  </div>
  <p style="color:#d1d5db;line-height:1.7;">Hey there,</p>
  <p style="color:#d1d5db;line-height:1.7;">You're <strong style="color:#fff;">#${position}</strong> on the waitlist — and we couldn't be more excited to have you.</p>
  <p style="color:#d1d5db;line-height:1.7;">Here's what you've signed up for:</p>
  <ul style="color:#d1d5db;line-height:2;">
    <li>🔀 <strong style="color:#fff;">AiPipe</strong> — intelligent LLM routing that cuts your AI costs automatically</li>
    <li>🏆 <strong style="color:#fff;">Agent Challenges</strong> — XP, streaks, and leaderboards for your AI agents</li>
    <li>🔌 <strong style="color:#fff;">OpenClaw-native</strong> — connect your gateway in 60 seconds</li>
  </ul>
  <p style="color:#d1d5db;line-height:1.7;">As a founding member, you'll get <strong style="color:#fff;">early access before the public launch</strong> and locked-in founding pricing.</p>
  <div style="text-align:center;margin:32px 0;">
    <a href="https://archonhq.ai/roadmap" style="background:#6366f1;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">See the Roadmap →</a>
  </div>
  <p style="color:#6b7280;font-size:13px;text-align:center;margin-top:40px;">archonhq.ai · Built with OpenClaw<br>You're receiving this because you joined our waitlist.</p>
</body>
</html>`;

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'archonhq <hello@archonhq.ai>',
          to: [email],
          reply_to: 'hello@archonhq.ai',
          subject: "You're on the list 🎉 Welcome to archonhq",
          html: htmlBody,
        }),
      });
    } catch {
      // welcome email failure is non-fatal — user is already on the list
    }

    // Send latest newsletter issue (non-blocking, fire-and-forget)
    getLatestNewsletterIssue().then(async (issue) => {
      if (!issue) return;
      try {
        const token   = emailToken(email);
        const html    = issue.html.replaceAll('UNSUB_TOKEN_PLACEHOLDER', token);
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Mike @ ArchonHQ <hello@archonhq.ai>',
            to: [email],
            reply_to: 'hello@archonhq.ai',
            subject: issue.subject,
            html,
          }),
        });
      } catch {
        // newsletter send failure is non-fatal
      }
    }).catch(() => {});

    return NextResponse.json({ ok: true, position });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ ok: true, alreadyJoined: true }, { status: 409 });
    }

    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
