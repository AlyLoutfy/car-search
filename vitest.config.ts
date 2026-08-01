import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Git worktrees live under .claude/worktrees/ and contain a full copy of this repo, so the
    // default glob picks up their test files too — `npm test` would run (and report failures for)
    // whatever an unrelated branch happens to be mid-edit on.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
  },
});
