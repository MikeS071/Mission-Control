import 'next-auth';
import 'next-auth/jwt';
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    tenantId?: number;
    user?: DefaultSession['user'] & {
      id?: string;
      isAdmin?: boolean;
    };
  }

  interface User {
    isSuspended?: boolean | null;
    suspendedAt?: Date | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    tenantId?: number;
    isAdmin?: boolean;
    userId?: string;
  }
}
