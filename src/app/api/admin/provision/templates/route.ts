import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { listTemplatesWithSyncStatus, syncTemplates } from '@/lib/provisioning/templateSync';

function getTemplateDirs(): { sourceDir: string; targetDir: string } {
  const sourceDir = process.env.PROVISION_TEMPLATE_SOURCE_DIR;
  const targetDir = process.env.PROVISION_TEMPLATE_TARGET_DIR;

  if (!sourceDir || !targetDir) {
    throw new Error('PROVISION_TEMPLATE_SOURCE_DIR and PROVISION_TEMPLATE_TARGET_DIR must be configured');
  }

  return { sourceDir, targetDir };
}

async function guardAdmin(): Promise<NextResponse | null> {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if ((session as { tenantId?: number }).tenantId !== 1) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  return null;
}

export async function GET(req: NextRequest) {
  try {
    const authError = await guardAdmin();
    if (authError) {
      return authError;
    }

    const { sourceDir, targetDir } = getTemplateDirs();
    const templates = await listTemplatesWithSyncStatus(sourceDir, targetDir);

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('Template list API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authError = await guardAdmin();
    if (authError) {
      return authError;
    }

    const { sourceDir, targetDir } = getTemplateDirs();
    const syncResult = await syncTemplates(sourceDir, targetDir);

    return NextResponse.json(syncResult);
  } catch (error) {
    console.error('Template sync API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
