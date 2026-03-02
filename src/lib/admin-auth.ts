type SessionLike = {
  tenantId?: unknown;
} | null;

export function getAdminRedirectPath(session: SessionLike): '/signin' | '/dashboard' | null {
  if (!session) return '/signin';
  if (session.tenantId !== 1) return '/dashboard';
  return null;
}
