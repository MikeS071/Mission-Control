# Security Notes

This project is functional for local/self-hosted usage, but there are important hardening tasks before wider deployment.

## Immediate Items

1. Remove hardcoded credentials from source.
   - `src/app/api/gog-callback/route.ts` currently contains embedded OAuth values.
2. Move all secrets to environment variables.
3. Restrict Google sign-in domain or allowlist users if needed.
4. Add server-side authorization checks for sensitive routes:
   - workspace file read/write routes
   - task mutation routes
5. Validate and sanitize all user input in API routes.

## Auth and Access Control

Current:

- NextAuth Google login is enabled.
- Sign-in callback currently allows any Google account.

Recommended:

1. Add allowlist/domain checks in NextAuth callbacks.
2. Enforce authenticated session in API handlers that mutate data.
3. Add role model for admin/editor/read-only actions.

## File System Safety

Workspace routes use `path.basename`, which helps reduce path traversal risk.

Still recommended:

1. Enforce strict filename patterns.
2. Add max file-size limits.
3. Add audit logging for file writes.

## Network and Transport

1. If running publicly, terminate TLS with known-good cert management.
2. Restrict direct DB access from untrusted networks.
3. Put auth-protected routes behind trusted reverse proxy rules.

## Monitoring and Incident Readiness

At minimum:

1. Log auth events.
2. Log task/file write operations.
3. Capture and alert on repeated API failures.
