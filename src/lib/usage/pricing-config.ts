export const PRICING_CONFIG = {
  defaultMarkup: { free: 50, pro: 20, team: 0 },
  modelOverrides: {
    'gpt-4o-mini': { free: 30, pro: 10, team: 0 },
  },
  flatFeePerRequest: 0, // USD
} as const;
