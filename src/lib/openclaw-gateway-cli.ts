import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type OpenClawGatewayCallOptions = {
  timeoutMs?: number;
  maxBufferBytes?: number;
};

function getOpenClawBin(): string {
  // Prefer an explicit path if provided (container/runtime differences).
  const explicit = process.env.OPENCLAW_BIN?.trim();
  if (explicit) return explicit;

  // Host default (this repo’s infra): openclaw is installed under ~/.local/bin.
  const hostPath = '/home/openclaw/.local/bin/openclaw';
  if (fs.existsSync(hostPath)) return hostPath;

  return 'openclaw';
}

function parseJsonFromStdout(stdout: string): unknown {
  const s = stdout.trim();
  if (!s) return null;

  // Normal case: stdout is exactly JSON.
  try {
    return JSON.parse(s);
  } catch {
    // Fallback: find the last JSON object/array in the output.
    const lastObj = s.lastIndexOf('{');
    const lastArr = s.lastIndexOf('[');
    const start = Math.max(lastObj, lastArr);
    if (start >= 0) {
      const tail = s.slice(start);
      try {
        return JSON.parse(tail);
      } catch {
        // fallthrough
      }
    }
    throw new Error('Failed to parse JSON from openclaw output');
  }
}

export async function openclawGatewayCall(
  method: string,
  params: Record<string, unknown> | undefined,
  opts?: OpenClawGatewayCallOptions,
): Promise<unknown> {
  const bin = getOpenClawBin();

  const args = ['gateway', 'call', method];
  if (params !== undefined) {
    args.push('--params', JSON.stringify(params));
  }
  args.push('--json');

  const timeoutMs = opts?.timeoutMs ?? 30_000;
  const maxBuffer = opts?.maxBufferBytes ?? 20 * 1024 * 1024;

  try {
    const { stdout } = await execFileAsync(bin, args, {
      timeout: timeoutMs,
      maxBuffer,
      env: process.env,
    });

    return parseJsonFromStdout(stdout);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`openclaw gateway call failed (${method}): ${msg}`);
  }
}
