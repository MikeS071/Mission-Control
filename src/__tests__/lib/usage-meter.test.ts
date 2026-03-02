import { db } from '@/lib/db';
import { recordUsage } from '@/lib/usage/meter';

jest.mock('@/lib/db', () => ({
  db: {
    execute: jest.fn(),
  },
}));

type SqlLike = {
  queryChunks?: unknown[];
};

type MockDb = {
  execute: jest.Mock;
};

const mockedDb = db as unknown as MockDb;

function inspectSql(sqlArg: SqlLike) {
  const chunks = Array.isArray(sqlArg.queryChunks) ? sqlArg.queryChunks : [];
  const text = chunks.map((chunk) => {
    const maybeStringChunk = chunk as { value?: unknown };
    if (maybeStringChunk && typeof maybeStringChunk === 'object' && Array.isArray(maybeStringChunk.value)) {
      return (maybeStringChunk.value as string[]).join('');
    }
    return '?';
  }).join('');

  const params = chunks.filter((chunk) => {
    const maybeStringChunk = chunk as { value?: unknown };
    return !(maybeStringChunk && typeof maybeStringChunk === 'object' && Array.isArray(maybeStringChunk.value));
  });

  return { text, params };
}

function createValidAiPipeHeaders() {
  const headers = new Headers();
  headers.set('X-AiPipe-Model', 'gpt-4o-mini');
  headers.set('X-AiPipe-Provider', 'openai');
  headers.set('X-AiPipe-Tokens-In', '120');
  headers.set('X-AiPipe-Tokens-Out', '80');
  headers.set('X-AiPipe-Cost-USD', '0.0234');
  headers.set('X-AiPipe-Hypothetical-Cost-USD', '0.0520');
  headers.set('X-AiPipe-Saved-USD', '0.0286');
  headers.set('X-AiPipe-Cache', 'hit');
  headers.set('X-AiPipe-Request-Id', 'req-abc-123');
  return headers;
}

describe('usage meter', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockedDb.execute.mockResolvedValue({ rows: [] });
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('records ledger entry and upserts daily/monthly usage summaries', async () => {
    await expect(recordUsage(77, createValidAiPipeHeaders())).resolves.toBeUndefined();

    expect(mockedDb.execute).toHaveBeenCalledTimes(3);

    const first = inspectSql(mockedDb.execute.mock.calls[0]?.[0] as SqlLike);
    const second = inspectSql(mockedDb.execute.mock.calls[1]?.[0] as SqlLike);
    const third = inspectSql(mockedDb.execute.mock.calls[2]?.[0] as SqlLike);

    expect(first.text).toContain('INSERT INTO usage_ledger');
    expect(first.params).toEqual(expect.arrayContaining([
      77,
      'gpt-4o-mini',
      'openai',
      120,
      80,
      0.0234,
      0.052,
      0.0286,
      true,
      'req-abc-123',
    ]));

    expect(second.text).toContain('INSERT INTO usage_summary');
    expect(second.text).toContain('ON CONFLICT');
    expect(second.params).toEqual(expect.arrayContaining([77, 'day', 1, 120, 80]));

    expect(third.text).toContain('INSERT INTO usage_summary');
    expect(third.text).toContain('ON CONFLICT');
    expect(third.params).toEqual(expect.arrayContaining([77, 'month', 1, 120, 80]));
  });

  it('warns and returns without throwing when required headers are missing', async () => {
    const partialHeaders = new Headers();
    partialHeaders.set('X-AiPipe-Model', 'gpt-4o-mini');
    partialHeaders.set('X-AiPipe-Provider', 'openai');

    await expect(recordUsage(77, partialHeaders)).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[usage] missing AiPipe headers'));
    expect(mockedDb.execute).not.toHaveBeenCalled();
  });

  it('warns and returns without throwing when numeric headers are invalid', async () => {
    const headers = createValidAiPipeHeaders();
    headers.set('X-AiPipe-Tokens-In', 'not-a-number');

    await expect(recordUsage(77, headers)).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[usage] invalid AiPipe header values'));
    expect(mockedDb.execute).not.toHaveBeenCalled();
  });
});
