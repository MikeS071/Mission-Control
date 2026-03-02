# mc-p1-test: Phase 1 E2E test suite

Run the full test and build verification after Phase 1 integration.

Steps:
1. `npx tsc --noEmit` — zero type errors
2. `npx jest --ci --coverage` — all tests pass, capture coverage
3. `npm run build` — production build succeeds
4. Review any new warnings or deprecations
5. If anything fails, fix it

Commit any fixes. Include coverage summary in commit message.
