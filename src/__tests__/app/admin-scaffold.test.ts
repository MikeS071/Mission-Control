import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getAdminRedirectPath } from '@/lib/admin-auth';

jest.mock('next/link', () => {
  return function Link({
    href,
    className,
    children,
  }: {
    href: string;
    className?: string;
    children: React.ReactNode;
  }) {
    return React.createElement('a', { href, className }, children);
  };
});

describe('admin scaffold', () => {
  describe('getAdminRedirectPath', () => {
    it('returns null for platform admin tenant', () => {
      expect(getAdminRedirectPath({ tenantId: 1 })).toBeNull();
    });

    it('returns signin redirect when session is missing', () => {
      expect(getAdminRedirectPath(null)).toBe('/signin');
    });

    it('returns dashboard redirect when tenantId is not numeric 1', () => {
      expect(getAdminRedirectPath({ tenantId: '1' })).toBe('/dashboard');
      expect(getAdminRedirectPath({ tenantId: 9 })).toBe('/dashboard');
    });
  });

  describe('AdminSidebar', () => {
    it('renders all expected admin nav links', async () => {
      const { AdminSidebar } = await import('@/components/admin/AdminSidebar');
      const html = renderToStaticMarkup(React.createElement(AdminSidebar));

      expect(html).toContain('href="/admin"');
      expect(html).toContain('href="/admin/users"');
      expect(html).toContain('href="/admin/tenants"');
      expect(html).toContain('href="/admin/policies"');
      expect(html).toContain('href="/admin/provisioning"');
      expect(html).toContain('href="/admin/audit-log"');
      expect(html).toContain('href="/admin/system"');
      expect(html).toContain('Dashboard');
      expect(html).toContain('Users');
      expect(html).toContain('Tenants');
      expect(html).toContain('Policies');
      expect(html).toContain('Provisioning');
      expect(html).toContain('Audit Log');
      expect(html).toContain('System');
    });
  });

  describe('AdminPage', () => {
    it('renders placeholder cards for users, tenants, and system', async () => {
      const { default: AdminPage } = await import('@/app/admin/page');
      const html = renderToStaticMarkup(await AdminPage());

      expect(html).toContain('Admin Dashboard');
      expect(html).toContain('Users');
      expect(html).toContain('Tenants');
      expect(html).toContain('System');
    });
  });
});
