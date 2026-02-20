import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { resolveTenantId } from '@/lib/tenant';

const WS = process.env.WORKSPACE_PATH!;

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const files = fs.readdirSync(WS).filter(f => f.endsWith('.md'));
    return NextResponse.json(files);
  } catch {
    return NextResponse.json({ error: 'Could not read workspace' }, { status: 500 });
  }
}
