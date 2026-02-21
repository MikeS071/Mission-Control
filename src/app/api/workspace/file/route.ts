import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { resolveTenantId } from '@/lib/tenant';

const WS = process.env.WORKSPACE_PATH!;

function safeResolvePath(name: string): string | null {
  // Must end in .md
  if (!name.endsWith('.md')) return null;
  // Resolve full path and ensure it stays within WS
  const resolved = path.resolve(WS, name);
  if (!resolved.startsWith(path.resolve(WS) + path.sep) && resolved !== path.resolve(WS)) return null;
  return resolved;
}

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get('name');
  if (!name) {
    return NextResponse.json({ error: 'Missing name parameter' }, { status: 400 });
  }

  const filePath = safeResolvePath(name);
  if (!filePath) {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return new NextResponse(content);
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}

export async function POST(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { name?: string; content?: string };
  const { name, content } = body;

  if (!name || typeof content !== 'string') {
    return NextResponse.json({ error: 'Missing name or content' }, { status: 400 });
  }

  const filePath = safeResolvePath(name);
  if (!filePath) {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
  }

  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Write failed' }, { status: 500 });
  }
}
