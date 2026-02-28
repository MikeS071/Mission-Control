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

    const isBlog = source === 'blog';
    const subjectLine = isBlog
      ? "You're subscribed! \u{1F9ED} Welcome to ArchonHQ Insights"
      : "You're on the list \u{1F389} Welcome to archonhq";

    const blogHtml = `<!DOCTYPE html>
<html>
<body style="background:#0a1a12;color:#e5e7eb;font-family:system-ui,sans-serif;padding:40px 20px;max-width:600px;margin:0 auto;">
  <div style="text-align:center;margin-bottom:32px;">
    <span style="font-size:32px;">\u{1F9ED}</span>
    <h1 style="color:#fff;font-size:24px;margin:12px 0 4px;">You're subscribed!</h1>
    <p style="color:#2dd47a;margin:0;">Welcome to ArchonHQ Insights</p>
  </div>
  <p style="color:#d1d5db;line-height:1.7;">Hey there,</p>
  <p style="color:#d1d5db;line-height:1.7;">Thanks for subscribing. You'll get an email whenever we publish new articles about AI engineering, agent swarms, and what we're building.</p>
  <ul style="color:#d1d5db;line-height:2;">
    <li>\u{1F916} <strong style="color:#fff;">Agent swarms</strong> \u2014 building and managing AI coding teams</li>
    <li>\u{1F527} <strong style="color:#fff;">Engineering insights</strong> \u2014 real lessons from production systems</li>
    <li>\u{1F4CA} <strong style="color:#fff;">Product updates</strong> \u2014 new features and behind-the-scenes</li>
  </ul>
  <div style="text-align:center;margin:32px 0;">
    <a href="https://archonhq.ai/insights" style="background:#2dd47a;color:#0a1a12;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Read Latest Articles \u2192</a>
  </div>
  <p style="color:#6b7280;font-size:13px;text-align:center;margin-top:40px;">archonhq.ai \u00b7 You subscribed to our blog.<br><a href="https://archonhq.ai/unsubscribe?token=${emailToken(email)}" style="color:#6b7280;">Unsubscribe</a></p>
</body>
</html>`;

    const waitlistHtml = `<!DOCTYPE html>
<html>
<body style="background:#0a0a0f;color:#e5e7eb;font-family:system-ui,sans-serif;padding:40px 20px;max-width:600px;margin:0 auto;">
  <div style="text-align:center;margin-bottom:32px;">
    <span style="font-size:32px;">\u{1F9ED}</span>
    <h1 style="color:#fff;font-size:24px;margin:12px 0 4px;">You're on the list!</h1>
    <p style="color:#818cf8;margin:0;">Welcome to archonhq early access</p>
  </div>
  <p style="color:#d1d5db;line-height:1.7;">Hey there,</p>
  <p style="color:#d1d5db;line-height:1.7;">You're <strong style="color:#fff;">#${position}</strong> on the waitlist.</p>
  <ul style="color:#d1d5db;line-height:2;">
    <li>\u{1F500} <strong style="color:#fff;">AiPipe</strong> \u2014 intelligent LLM routing</li>
    <li>\u{1F3C6} <strong style="color:#fff;">Agent Challenges</strong> \u2014 XP, streaks, leaderboards</li>
    <li>\u{1F50C} <strong style="color:#fff;">OpenClaw-native</strong> \u2014 connect in 60 seconds</li>
  </ul>
  <div style="text-align:center;margin:32px 0;">
    <a href="https://archonhq.ai/roadmap" style="background:#6366f1;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">See the Roadmap \u2192</a>
  </div>
  <p style="color:#6b7280;font-size:13px;text-align:center;margin-top:40px;">archonhq.ai<br>You joined our waitlist.</p>
</body>
</html>`;

    const htmlBody = isBlog ? blogHtml : waitlistHtml;

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
          subject: subjectLine,
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
