/**
 * Insights API
 *
 * GET  /api/insights        — list all published insights (paginated)
 * POST /api/insights        — create a new insight article (Bearer auth required)
 *
 * POST body: { title, slug, summary, content, publishedAt? }
 * Validates: slug is URL-safe, title non-empty, content non-empty
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { insights } from '@/db/schema';
import { desc } from 'drizzle-orm';

const API_SECRET = process.env.API_SECRET ?? '';

function requireBearer(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7).trim();
  return !!API_SECRET && token === API_SECRET;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get('limit') ?? 20), 100);

  const rows = await db
    .select({
      id: insights.id,
      slug: insights.slug,
      title: insights.title,
      description: insights.description,
      sourceUrl: insights.sourceUrl,
      publishedAt: insights.publishedAt,
      createdAt: insights.createdAt,
    })
    .from(insights)
    .orderBy(desc(insights.publishedAt))
    .limit(limit);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  if (!requireBearer(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { title, slug, summary, content, publishedAt, imageUrl, sourceUrl } = body as Record<string, unknown>;

  // Validate required fields
  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (!slug || typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: 'slug is required and must be URL-safe (lowercase, hyphens only)' },
      { status: 400 }
    );
  }
  if (!content || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }
  if (!summary || typeof summary !== 'string' || !summary.trim()) {
    return NextResponse.json({ error: 'summary is required' }, { status: 400 });
  }

  const pubAt = publishedAt ? new Date(publishedAt as string) : new Date();
  if (isNaN(pubAt.getTime())) {
    return NextResponse.json({ error: 'publishedAt must be a valid ISO date' }, { status: 400 });
  }

  try {
    const [created] = await db
      .insert(insights)
      .values({
        slug: slug.trim(),
        title: title.trim(),
        description: (summary as string).trim(),
        contentMd: (content as string).trim(),
        publishedAt: pubAt,
        createdAt: new Date(),
        ...(imageUrl && typeof imageUrl === 'string' ? { imageUrl: imageUrl.trim() } : {}),
        ...(sourceUrl && typeof sourceUrl === 'string' ? { sourceUrl: sourceUrl.trim() } : {}),
      })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('unique')) {
      return NextResponse.json({ error: `slug "${slug}" is already taken` }, { status: 409 });
    }
    console.error('[insights POST] DB error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
