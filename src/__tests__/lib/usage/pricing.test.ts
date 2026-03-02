import { getTenantCost } from '@/lib/usage/pricing';

describe('pricing', () => {
  it('applies default free plan markup', () => {
    expect(getTenantCost(1, 'gpt-4o', 'free')).toBeCloseTo(1.5, 8);
  });

  it('applies default pro plan markup', () => {
    expect(getTenantCost(1, 'gpt-4o', 'pro')).toBeCloseTo(1.2, 8);
  });

  it('applies model-specific override markup', () => {
    expect(getTenantCost(1, 'gpt-4o-mini', 'free')).toBeCloseTo(1.3, 8);
    expect(getTenantCost(1, 'gpt-4o-mini', 'pro')).toBeCloseTo(1.1, 8);
  });

  it('applies zero markup for team plan', () => {
    expect(getTenantCost(1, 'gpt-4o', 'team')).toBeCloseTo(1, 8);
    expect(getTenantCost(1, 'gpt-4o-mini', 'team')).toBeCloseTo(1, 8);
  });

  it('falls back to free pricing for unknown plan values', () => {
    expect(getTenantCost(2, 'gpt-4o', 'enterprise')).toBeCloseTo(3, 8);
  });
});
