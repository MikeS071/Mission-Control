import 'next-auth';

declare module 'next-auth' {
  interface Session {
    tenantId?: number;
  }
  interface JWT {
    tenantId?: number;
  }
}
