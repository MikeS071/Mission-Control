import { NextRequest, NextResponse } from 'next/server';

export async function GET(_req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const joinedPath = path.join('/');
  const url = `${process.env.GATEWAY_URL}/${joinedPath}`;
  try {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
    const data = await res.text();
    return new NextResponse(data, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json' } });
  } catch {
    return NextResponse.json({ error: 'Gateway unreachable' }, { status: 502 });
  }
}
