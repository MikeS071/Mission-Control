import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/lib/tenant.ts',
    'src/lib/billing.ts',
    'src/lib/xp.ts',
    'src/lib/streak.ts',
  ],
};

export default config;
