import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { renderMarkdown } from '@/lib/markdown';
import {
  buildCanonicalPrdPath,
  buildVersionedPrdPath,
  ensurePrdDir,
  isVersionedPrdPath,
  movedToStub,
  readWorkspaceMarkdown,
  slugify,
  writeWorkspaceMarkdown,
} from '@/lib/prd-files';
import { getTelegramIngressMode, isMcTelegramBridgeEnabled } from '@/lib/telegram-ingress';
import { cn } from '@/lib/utils';

describe('utils.ts', () => {
  it('merges conflicting tailwind classes with the latest one winning', () => {
    expect(cn('p-2', 'p-4', 'text-sm')).toBe('p-4 text-sm');
  });

  it('supports conditional/falsy values while preserving truthy class names', () => {
    expect(cn('btn', false && 'hidden', ['w-full', null], undefined)).toBe('btn w-full');
  });
});

describe('markdown.ts', () => {
  it('escapes HTML while rendering links and images', () => {
    const html = renderMarkdown(
      '<script>alert("x")</script> [OpenAI](https://openai.com) ![alt](https://example.com/img.png)'
    );

    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('<a href="https://openai.com" target="_blank" rel="noopener noreferrer">OpenAI</a>');
    expect(html).toContain('<img src="https://example.com/img.png" alt="alt" loading="lazy" />');
  });

  it('renders headings with sanitized ids and inline formatting', () => {
    const html = renderMarkdown('## **Hello** `World`!');
    expect(html).toBe('<h2 id="hello-world"><strong>Hello</strong> <code>World</code>!</h2>');
  });

  it('closes unordered list before starting ordered list', () => {
    const html = renderMarkdown('- one\n- two\n1. first\n2. second');
    const ulStart = html.indexOf('<ul>');
    const ulEnd = html.indexOf('</ul>');
    const olStart = html.indexOf('<ol>');
    expect(ulStart).toBeGreaterThanOrEqual(0);
    expect(ulEnd).toBeGreaterThan(ulStart);
    expect(olStart).toBeGreaterThan(ulEnd);
  });

  it('escapes content inside fenced code blocks and flushes unclosed blocks', () => {
    const html = renderMarkdown('```\n<tag attr="1">');
    expect(html).toBe('<pre><code>&lt;tag attr=&quot;1&quot;&gt;</code></pre>');
  });

  it('renders markdown tables and ignores separator rows', () => {
    const html = renderMarkdown('| Name | Link |\n| --- | --- |\n| **A** | [x](https://x.com) |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>Name</th>');
    expect(html).toContain('<th>Link</th>');
    expect(html).toContain('<td><strong>A</strong></td>');
    expect(html).toContain('<td><a href="https://x.com" target="_blank" rel="noopener noreferrer">x</a></td>');
  });
});

describe('prd-files.ts', () => {
  const originalWorkspacePath = process.env.WORKSPACE_PATH;
  let workspacePath = '';

  beforeEach(() => {
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-prd-files-'));
    process.env.WORKSPACE_PATH = workspacePath;
  });

  afterEach(() => {
    fs.rmSync(workspacePath, { recursive: true, force: true });
    if (originalWorkspacePath === undefined) {
      delete process.env.WORKSPACE_PATH;
      return;
    }
    process.env.WORKSPACE_PATH = originalWorkspacePath;
  });

  it.each([
    ['Hello World', 'hello-world'],
    ['  ###  ', 'goal'],
    ['Roadmap v2!', 'roadmap-v2'],
  ])('slugify("%s") -> "%s"', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('builds canonical and versioned PRD paths from task id + title', () => {
    expect(buildCanonicalPrdPath(42, 'Launch Plan')).toBe('docs/prd/42-launch-plan.md');
    expect(buildVersionedPrdPath(42, 'Launch Plan', 3)).toBe('docs/prd/42-launch-plan-v3.md');
  });

  it('creates docs/prd directory inside the workspace root', () => {
    ensurePrdDir();
    expect(fs.existsSync(path.join(workspacePath, 'docs/prd'))).toBe(true);
  });

  it('writes and reads markdown content under workspace root', () => {
    const relPath = 'docs/prd/sample.md';
    writeWorkspaceMarkdown(relPath, '# Title\n\nBody');
    expect(readWorkspaceMarkdown(relPath)).toBe('# Title\n\nBody');
  });

  it('rejects path traversal outside workspace root', () => {
    expect(() => readWorkspaceMarkdown('../outside.md')).toThrow('Invalid workspace path');
  });

  it('builds a moved stub and detects versioned paths', () => {
    expect(movedToStub('docs/prd/9-vision-v2.md')).toContain('This PRD has moved to: `docs/prd/9-vision-v2.md`');
    expect(isVersionedPrdPath('docs/prd/9-vision-v2.md')).toBe(true);
    expect(isVersionedPrdPath('docs/prd/9-vision.md')).toBe(false);
  });
});

describe('telegram-ingress.ts', () => {
  const originalMode = process.env.MC_TELEGRAM_INGRESS_MODE;

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env.MC_TELEGRAM_INGRESS_MODE;
      return;
    }
    process.env.MC_TELEGRAM_INGRESS_MODE = originalMode;
  });

  it('defaults to mission-control ingress mode when env is missing', () => {
    delete process.env.MC_TELEGRAM_INGRESS_MODE;
    expect(getTelegramIngressMode()).toBe('mc');
    expect(isMcTelegramBridgeEnabled()).toBe(true);
  });

  it('parses openclaw mode case-insensitively', () => {
    process.env.MC_TELEGRAM_INGRESS_MODE = 'OpenClaw';
    expect(getTelegramIngressMode()).toBe('openclaw');
    expect(isMcTelegramBridgeEnabled()).toBe(false);
  });

  it('falls back to mc for unexpected values', () => {
    process.env.MC_TELEGRAM_INGRESS_MODE = 'something-else';
    expect(getTelegramIngressMode()).toBe('mc');
  });
});

describe('source.ts', () => {
  it.skip('keeps source loader contract pinned to /docs and docs.toFumadocsSource()', () => {
    const content = fs.readFileSync(path.join(process.cwd(), 'src/lib/source.ts'), 'utf8');
    expect(content).toContain("baseUrl: '/docs'");
    expect(content).toContain('source: docs.toFumadocsSource()');
  });
});
