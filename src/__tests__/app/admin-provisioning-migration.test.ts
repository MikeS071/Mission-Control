import fs from 'node:fs';
import path from 'node:path';

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('admin provisioning migration', () => {
  it('adds an admin provisioning page that uses ProvisioningPanel', () => {
    const source = readSource('src/app/admin/provisioning/page.tsx');

    expect(source).toContain("from '@/components/ProvisioningPanel'");
    expect(source).toContain('Provisioning');
    expect(source).toContain('<ProvisioningPanel />');
  });

  it('replaces dashboard admin tab panel with a link to /admin', () => {
    const source = readSource('src/app/dashboard/page.tsx');

    expect(source).toContain('href="/admin"');
    expect(source).not.toContain('<ProvisioningPanel />');
  });

  it('adds Policies and Provisioning links to the admin sidebar', () => {
    const source = readSource('src/components/admin/AdminSidebar.tsx');

    expect(source).toContain("'/admin/policies'");
    expect(source).toContain("'/admin/provisioning'");
  });
});
