import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { resolveTenantId } from '@/lib/tenant';

const WS = process.env.WORKSPACE_PATH!;

const SKIP_DIRS = new Set(['node_modules', '.git', '.next']);

type FileEntry = {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: FileEntry[];
};

function scanDir(absDir: string, relBase: string): FileEntry[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const result: FileEntry[] = [];

  for (const entry of entries) {
    // Skip hidden dirs and known noisy dirs
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
      const children = scanDir(path.join(absDir, entry.name), relPath);
      if (children.length > 0) {
        result.push({ name: entry.name, path: relPath, type: 'dir', children });
      }
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
      result.push({ name: entry.name, path: relPath, type: 'file' });
    }
  }

  return result;
}

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const tree = scanDir(WS, '');
    return NextResponse.json(tree);
  } catch {
    return NextResponse.json({ error: 'Could not read workspace' }, { status: 500 });
  }
}
