import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const WS = process.env.WORKSPACE_PATH!;

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')!;
  const file = path.join(WS, path.basename(name));
  return new NextResponse(fs.readFileSync(file, 'utf8'));
}

export async function POST(req: NextRequest) {
  const { name, content } = await req.json();
  const file = path.join(WS, path.basename(name));
  fs.writeFileSync(file, content, 'utf8');
  return NextResponse.json({ ok: true });
}
