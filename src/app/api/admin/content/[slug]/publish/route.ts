import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { getContentBySlug } from '@/lib/content/item';
import { ContentPublishError, publishContent } from '@/lib/content/publish';

function readTenantId(session: unknown): number {
  return Number((session as { tenantId?: unknown } | null)?.tenantId);
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = readTenantId(session);
  if (tenantId !== 1) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { slug } = await params;

  try {
    await publishContent(slug, tenantId);

    const updatedItem = await getContentBySlug(slug, tenantId);
    if (!updatedItem) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
    }

    return NextResponse.json(updatedItem);
  } catch (error) {
    if (error instanceof ContentPublishError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('Content publish failed:', error);
    return NextResponse.json({ error: 'Failed to publish content' }, { status: 500 });
  }
}
