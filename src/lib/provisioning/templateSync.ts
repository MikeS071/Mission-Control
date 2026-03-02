import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface SyncResult {
  synced: string[];
  skipped: string[];
  errors: string[];
}

export interface TemplateSyncStatus {
  path: string;
  lastSyncedAt: string | null;
}

type IgnoreRule = {
  regex: RegExp;
};

function normalizeRelativePath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseIgnoreRules(content: string): IgnoreRule[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((pattern) => {
      let raw = pattern.replace(/\\/g, '/');
      const directoryPattern = raw.endsWith('/');
      raw = raw.replace(/^\//, '');

      const hasSlash = raw.includes('/');
      const normalized = directoryPattern ? raw.slice(0, -1) : raw;
      const escaped = escapeRegExp(normalized)
        .replace(/\\\*\\\*/g, '.*')
        .replace(/\\\*/g, '[^/]*')
        .replace(/\\\?/g, '[^/]');

      if (hasSlash) {
        return {
          regex: new RegExp(`^${escaped}${directoryPattern ? '(?:/.*)?' : '$'}`),
        };
      }

      return {
        regex: new RegExp(`(?:^|/)${escaped}${directoryPattern ? '(?:/.*)?' : '$'}`),
      };
    });
}

async function loadIgnoreRules(sourceDir: string): Promise<IgnoreRule[]> {
  const ignorePath = path.join(sourceDir, '.template-ignore');

  try {
    const content = await fs.readFile(ignorePath, 'utf8');
    return parseIgnoreRules(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

function isIgnored(relativePath: string, rules: IgnoreRule[]): boolean {
  return rules.some((rule) => rule.regex.test(relativePath));
}

async function collectTemplateFiles(sourceDir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dirPath: string): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const absPath = path.join(dirPath, entry.name);
      const relativePath = normalizeRelativePath(path.relative(sourceDir, absPath));

      if (entry.isDirectory()) {
        await walk(absPath);
        continue;
      }

      if (entry.isFile() && relativePath !== '.template-ignore') {
        files.push(relativePath);
      }
    }
  }

  await walk(sourceDir);
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

async function hashFile(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

async function getTargetHashIfPresent(targetFilePath: string): Promise<string | null> {
  try {
    const stat = await fs.stat(targetFilePath);
    if (!stat.isFile()) {
      throw new Error('target path exists and is not a file');
    }

    return hashFile(targetFilePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

function formatError(prefix: string, error: unknown): string {
  if (error instanceof Error) {
    return `${prefix}: ${error.message}`;
  }

  return `${prefix}: unknown error`;
}

export async function listTemplatesWithSyncStatus(
  sourceDir: string,
  targetDir: string,
): Promise<TemplateSyncStatus[]> {
  const ignoreRules = await loadIgnoreRules(sourceDir);
  const sourceFiles = await collectTemplateFiles(sourceDir);
  const templates: TemplateSyncStatus[] = [];

  for (const relativePath of sourceFiles) {
    if (isIgnored(relativePath, ignoreRules)) {
      continue;
    }

    const targetPath = path.join(targetDir, relativePath);

    try {
      const stat = await fs.stat(targetPath);
      templates.push({
        path: relativePath,
        lastSyncedAt: stat.isFile() ? stat.mtime.toISOString() : null,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        templates.push({ path: relativePath, lastSyncedAt: null });
        continue;
      }

      throw error;
    }
  }

  return templates;
}

export async function syncTemplates(sourceDir: string, targetDir: string): Promise<SyncResult> {
  const result: SyncResult = {
    synced: [],
    skipped: [],
    errors: [],
  };

  try {
    const ignoreRules = await loadIgnoreRules(sourceDir);
    const sourceFiles = await collectTemplateFiles(sourceDir);

    for (const relativePath of sourceFiles) {
      if (isIgnored(relativePath, ignoreRules)) {
        result.skipped.push(relativePath);
        continue;
      }

      const sourcePath = path.join(sourceDir, relativePath);
      const targetPath = path.join(targetDir, relativePath);

      try {
        const sourceHash = await hashFile(sourcePath);
        const targetHash = await getTargetHashIfPresent(targetPath);

        if (targetHash !== null && targetHash === sourceHash) {
          result.skipped.push(relativePath);
          continue;
        }

        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.copyFile(sourcePath, targetPath);
        result.synced.push(relativePath);
      } catch (error) {
        result.errors.push(formatError(relativePath, error));
      }
    }
  } catch (error) {
    result.errors.push(formatError('sync_templates_failed', error));
  }

  result.synced.sort((a, b) => a.localeCompare(b));
  result.skipped.sort((a, b) => a.localeCompare(b));
  return result;
}
