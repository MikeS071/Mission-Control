import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaleIndicator } from '@/components/kanban/StaleIndicator';

describe('StaleIndicator', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-10T00:00:00.000Z'));
    delete process.env.KANBAN_STALE_AGING_DAYS;
    delete process.env.KANBAN_STALE_DAYS;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not render for fresh tasks', () => {
    const html = renderToStaticMarkup(
      React.createElement(StaleIndicator, { updatedAt: new Date('2026-01-09T00:00:00.000Z') })
    );

    expect(html).toBe('');
  });

  it('renders aging badge with tooltip', () => {
    const html = renderToStaticMarkup(
      React.createElement(StaleIndicator, { updatedAt: new Date('2026-01-07T00:00:00.000Z') })
    );

    expect(html).toContain('Aging');
    expect(html).toContain('Last updated 3 days ago');
    expect(html).toContain('border-amber-700/70');
  });

  it('renders stale badge with tooltip', () => {
    const html = renderToStaticMarkup(
      React.createElement(StaleIndicator, { updatedAt: new Date('2026-01-01T00:00:00.000Z') })
    );

    expect(html).toContain('Stale');
    expect(html).toContain('Last updated 9 days ago');
    expect(html).toContain('border-rose-700/70');
  });
});
