import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import {
  ContentItemNotFoundError,
  ContentNotPublishedError,
  listSocialPosts,
  scheduleSocialPost,
} from '@/lib/content/social';

const CreateSocialPostSchema = z.object({
  platform: z.enum(['x', 'linkedin']),
  text: z.string().trim().min(1).max(280),
  scheduledAt: z.string().datetime(),
});

async function requireAdminSession() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if ((session as { tenantId?: number }).tenantId !== 1) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  return session;
}

function toErrorResponse(error: unknown) {
  if (error instanceof ContentItemNotFoundError) {
    return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
  }
  if (error instanceof ContentNotPublishedError) {
    return NextResponse.json(
      { error: 'Content item must be published before scheduling social posts' },
      { status: 400 },
    );
  }

  console.error('Admin content social API error:', error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const sessionOrResponse = await requireAdminSession();
  if (sessionOrResponse instanceof Response) return sessionOrResponse;

  try {
    const { slug } = await params;
    const posts = await listSocialPosts(slug);
    return NextResponse.json(posts);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const sessionOrResponse = await requireAdminSession();
  if (sessionOrResponse instanceof Response) return sessionOrResponse;

  try {
    const body = await req.json();
    const payload = CreateSocialPostSchema.parse(body);
    const { slug } = await params;

    const created = await scheduleSocialPost(slug, payload);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid payload', issues: error.issues }, { status: 400 });
    }
    return toErrorResponse(error);
  }
}
