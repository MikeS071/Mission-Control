---

## MANDATORY DEVELOPMENT PROCESS (follow in exact order)

### Phase 0: Decapod governance
Run once at start (best-effort — do NOT debug or fix failures):
```bash
export PATH="$HOME/.cargo/bin:$PATH"
decapod validate 2>/dev/null || true
```
⚠️ There are ~25 PRE-EXISTING invariant failures in this repo. These are NOT your problem. Ignore them entirely and proceed to Phase 1.

### Phase 1: Understand the spec
- Read the task objective and requirements above
- Read the source file(s) to test — understand inputs, outputs, error cases
- Read an existing test (e.g. `src/__tests__/api/activity.test.ts`) for the mocking pattern

### Phase 2: Write tests FIRST
- Write failing tests that cover: happy path, error path, edge cases
- Mock external dependencies (DB, HTTP) — no real connections
- Run tests — they SHOULD fail (red)

### Phase 3: Implement (if needed)
- Write minimum code to make tests pass
- For test-only tickets: skip this phase

### Phase 4: Quality gates (fix and re-run until all green)
1. Tests pass: `npx jest <test-file> --ci`
2. Build check: `npx tsc --noEmit` (best-effort, don't fix pre-existing errors)

### Phase 5: Commit and push
```bash
git add -A
git commit -m "<type>: <description>"
git push origin HEAD
```
Do NOT exit without committing and pushing.
