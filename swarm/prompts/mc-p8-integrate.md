# mc-p8-integrate: Phase 8 integration merge

Merge all Phase 8 feature branches into dev and resolve any conflicts.

Steps:
1. Run `git branch -a | grep feat/mc-` to find Phase 8 branches
2. For each branch with commits ahead of dev, merge: `git merge <branch> --no-ff`
3. Resolve any merge conflicts (keep both sides where possible, prefer newer code)
4. After all merges: `npx tsc --noEmit` (zero type errors)
5. After all merges: `npx jest --ci` (all tests pass)
6. If build or tests fail, fix the issues

Commit when done. Push to dev.
