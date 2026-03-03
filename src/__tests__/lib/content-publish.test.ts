import { db } from '@/lib/db';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    update: jest.fn(),
  },
}));

import { publishContent } from '@/lib/content/publish';

type MockDb = {
  select: jest.Mock;
  update: jest.Mock;
};

const mockedDb = db as unknown as MockDb;

function mockSelectOne(row: Record<string, unknown> | null) {
  const limit = jest.fn().mockResolvedValue(row ? [row] : []);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  mockedDb.select.mockReturnValueOnce({ from });
  return { from, where, limit };
}

function mockUpdateOne(row: Record<string, unknown> | null) {
  const returning = jest.fn().mockResolvedValue(row ? [row] : []);
  const where = jest.fn().mockReturnValue({ returning });
  const set = jest.fn().mockReturnValue({ where });
  mockedDb.update.mockReturnValueOnce({ set });
  return { set, where, returning };
}

describe('content publish library', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('publishes a draft item and returns publishedAt', async () => {
    mockSelectOne({
      id: 11,
      tenantId: 3,
      slug: 'agent-updates',
      title: 'Agent updates',
      summary: 'Weekly summary',
      contentMd: '# body',
      status: 'draft',
    });

    const updated = {
      id: 11,
      slug: 'agent-updates',
      status: 'published',
      publishedAt: new Date('2026-03-03T02:00:00.000Z'),
    };
    const updateBuilder = mockUpdateOne(updated);

    const result = await publishContent('agent-updates', 3);

    expect(result).toEqual({
      success: true,
      publishedAt: '2026-03-03T02:00:00.000Z',
    });
    expect(mockedDb.update).toHaveBeenCalledTimes(1);
    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'published',
        publishedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    );
  });

  it('publishes a qa item', async () => {
    mockSelectOne({
      id: 12,
      tenantId: 3,
      slug: 'agent-updates-qa',
      title: 'Agent updates QA',
      summary: 'QA summary',
      contentMd: '# qa body',
      status: 'qa',
    });

    mockUpdateOne({
      id: 12,
      slug: 'agent-updates-qa',
      status: 'published',
      publishedAt: new Date('2026-03-03T03:00:00.000Z'),
    });

    await expect(publishContent('agent-updates-qa', 3)).resolves.toEqual({
      success: true,
      publishedAt: '2026-03-03T03:00:00.000Z',
    });
  });

  it('returns error when item does not exist for tenant', async () => {
    mockSelectOne(null);

    await expect(publishContent('missing-slug', 8)).rejects.toThrow('Content item not found');
    expect(mockedDb.update).not.toHaveBeenCalled();
  });

  it('returns error for non-publishable status', async () => {
    mockSelectOne({
      id: 19,
      tenantId: 8,
      slug: 'already-live',
      title: 'Already live',
      summary: 'Summary',
      contentMd: 'Body',
      status: 'published',
    });

    await expect(publishContent('already-live', 8)).rejects.toThrow('Only draft or qa content can be published');
    expect(mockedDb.update).not.toHaveBeenCalled();
  });

  it.each([
    { key: 'title', row: { title: '' }, message: 'title is required before publishing' },
    { key: 'summary', row: { summary: '' }, message: 'summary is required before publishing' },
    { key: 'contentMd', row: { contentMd: '   ' }, message: 'content_md is required before publishing' },
  ])('returns error when required $key is missing', async ({ row, message }) => {
    mockSelectOne({
      id: 23,
      tenantId: 5,
      slug: 'incomplete',
      title: 'Valid title',
      summary: 'Valid summary',
      contentMd: 'Valid content',
      status: 'draft',
      ...row,
    });

    await expect(publishContent('incomplete', 5)).rejects.toThrow(message);
    expect(mockedDb.update).not.toHaveBeenCalled();
  });
});
