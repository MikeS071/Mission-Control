export type PolicyTier = 'free' | 'pro' | 'team' | (string & {});

// Rule model is intentionally open-ended. Product policy engines can extend this
// shape without requiring schema migrations for every new field.
export type PolicyRule = Record<string, unknown>;

export type PolicyRules = PolicyRule[];

export type PolicyOverrides = Record<string, unknown>;
