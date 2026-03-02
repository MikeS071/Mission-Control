import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { TenantPolicyEditor, resetTenantPolicy, saveTenantPolicy } from '@/components/admin/TenantPolicyEditor';

const basePolicy = {
  tenant: {
    id: 14,
    name: 'Acme Ops',
    slug: 'acme-ops',
  },
  tier: 'strategos',
  rules: {
    browserEnabled: true,
    maxAgents: 4,
    maxMembers: 10,
  },
  overrides: {
    browserEnabled: true,
    maxAgents: false,
    maxMembers: false,
  },
  auditLog: [
    {
      id: 'evt-1',
      action: 'policy.updated',
      actor: 'admin@openclaw.dev',
      createdAt: '2026-03-01T00:00:00.000Z',
    },
  ],
};

describe('admin tenant policy editor', () => {
  it('renders tier selector, rules, and audit history', () => {
    const html = renderToStaticMarkup(
      React.createElement(TenantPolicyEditor, {
        tenantId: 14,
        initialData: basePolicy,
      }),
    );

    expect(html).toContain('Policy Editor');
    expect(html).toContain('Current Tier');
    expect(html).toContain('Save Policy');
    expect(html).toContain('Reset to Defaults');
    expect(html).toContain('browserEnabled');
    expect(html).toContain('maxAgents');
    expect(html).toContain('policy.updated');
  });

  it('renders empty-state copy when there is no audit history', () => {
    const html = renderToStaticMarkup(
      React.createElement(TenantPolicyEditor, {
        tenantId: 14,
        initialData: {
          ...basePolicy,
          auditLog: [],
        },
      }),
    );

    expect(html).toContain('No audit history yet.');
  });
});

describe('tenant policy api helpers', () => {
  it('saveTenantPolicy sends PUT request payload', async () => {
    const mockFetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await saveTenantPolicy(14, { tier: 'archon', rules: {} }, mockFetch);

    expect(mockFetch).toHaveBeenCalledWith('/api/admin/policy/14', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tier: 'archon', rules: {} }),
    });
  });

  it('saveTenantPolicy throws on non-OK response', async () => {
    const mockFetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'denied' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(saveTenantPolicy(14, { tier: 'archon', rules: {} }, mockFetch)).rejects.toThrow('denied');
  });

  it('resetTenantPolicy sends POST request to reset endpoint', async () => {
    const mockFetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify(basePolicy), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await resetTenantPolicy(14, mockFetch);

    expect(mockFetch).toHaveBeenCalledWith('/api/admin/policy/14/reset', {
      method: 'POST',
    });
  });
});
