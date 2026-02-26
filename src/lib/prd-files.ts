import fs from 'node:fs';
import path from 'node:path';

function getWorkspaceRoot(): string {
  return process.env.WORKSPACE_PATH || '/home/openclaw/.openclaw/workspace';
}

export function slugify(input: string): string {
  const base = (input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return base || 'goal';
}

export function buildCanonicalPrdPath(taskId: number, title: string): string {
  return `docs/prd/${taskId}-${slugify(title)}.md`;
}

export function buildVersionedPrdPath(taskId: number, title: string, version: number): string {
  return `docs/prd/${taskId}-${slugify(title)}-v${version}.md`;
}

function safeResolve(relPath: string): string {
  const root = path.resolve(getWorkspaceRoot());
  const abs = path.resolve(root, relPath);
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    throw new Error('Invalid workspace path');
  }
  return abs;
}

export function ensurePrdDir(): void {
  fs.mkdirSync(safeResolve('docs/prd'), { recursive: true });
}

export function readWorkspaceMarkdown(relPath: string): string {
  return fs.readFileSync(safeResolve(relPath), 'utf8');
}

export function writeWorkspaceMarkdown(relPath: string, content: string): void {
  const abs = safeResolve(relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, abs);
}

export function movedToStub(newRelPath: string): string {
  return [
    '# Moved',
    '',
    `This PRD has moved to: \`${newRelPath}\``,
    '',
  ].join('\n');
}

export function isVersionedPrdPath(relPath: string): boolean {
  return /-v\d+\.md$/.test(relPath);
}
