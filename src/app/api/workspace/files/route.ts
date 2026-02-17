import { NextResponse } from 'next/server';
import fs from 'fs';

const WS = process.env.WORKSPACE_PATH!;

export async function GET() {
  const files = fs.readdirSync(WS).filter(f => f.endsWith('.md'));
  return NextResponse.json(files);
}
