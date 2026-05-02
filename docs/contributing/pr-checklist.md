# PR Checklist

Use this checklist before merging documentation or code changes.

- Run `pnpm format:check` or format changed files.
- Run `pnpm lint` for code changes.
- Run `pnpm typecheck` for TypeScript changes.
- Run targeted tests, then `pnpm test` when behavior changed.
- Run `pnpm docs:build` for documentation changes.
- Confirm no generated or unrelated files were reverted.
- Update docs when public behavior, commands, shortcuts or architecture change.
