# Commit Conventions

Apollo Map Studio uses [Conventional Commits](https://www.conventionalcommits.org)
strictly. The changelog is generated from commit history with
[`git-cliff`](https://git-cliff.org/), so non-conventional messages
silently disappear from the public release notes.

## Format

```text
<type>(<scope>): <subject>

<body>

<footer>
```

- `<type>` — required, lowercased. See the table below.
- `<scope>` — optional, parenthesised. Use it when the change is
  scoped to one area (`feat(license): …`, `fix(inspector): …`).
- `<subject>` — imperative, no trailing period. < 72 chars.
- `<body>` — wrap at 100 chars. Explain the **why**, not the **what**;
  the diff already shows the what.
- `<footer>` — `BREAKING CHANGE:`, `Closes #123`, etc.

## Types in use

The grouping below mirrors `cliff.toml` — these are the types that
git-cliff knows to render. Anything else falls into "Other" or is
skipped.

| Type       | When to use                                                | Changelog group     |
| ---------- | ---------------------------------------------------------- | ------------------- |
| `feat`     | New user-visible feature.                                  | Features            |
| `fix`      | Bug fix.                                                   | Bug Fixes           |
| `perf`     | Performance improvement (no behaviour change).             | Performance         |
| `refactor` | Internal restructure, no behaviour or feature change.      | Refactor            |
| `docs`     | Documentation only.                                        | Documentation       |
| `style`    | Formatting / whitespace only. Rare; use sparingly.         | Styling             |
| `test`     | Adding or updating tests; no production code change.       | Testing             |
| `chore`    | Build / tooling / housekeeping that doesn't fit elsewhere. | Miscellaneous Tasks |
| `ci`       | CI workflow changes.                                       | Miscellaneous Tasks |
| `build`    | Build system / dependencies change.                        | Miscellaneous Tasks |
| `revert`   | Revert of a prior commit.                                  | Revert              |

`cliff.toml` skip rules also drop:

- `chore(release): prepare for …` (the version-bump commits themselves)
- `chore(deps…)` (dependabot noise)
- `chore(pr…)` and `chore(pull…)` (merge artefacts)

If the body contains the word `security`, the commit is regrouped to
the **Security** section regardless of type.

## Subject style

Imperative, present tense. Read the subject as completing the sentence
"This commit will …":

```text
feat(inspector): add friction field to lane form
fix(undo): cancel FSM before time-travelling map store
perf(spatial): reuse decoration cache on incremental edits
refactor(actions): split registry into types/definitions/helpers
docs(recipes): walk through adding a new map element
```

Avoid past tense (`added`, `fixed`) and "and" subjects that bundle
two changes.

## Body content

Explain context that the diff alone can't:

```text
fix(undo): send CANCEL to FSM before time-travelling

zundo's partialize covers `mapStore.entities` only. A mid-draw Ctrl+Z
left FSM holding stale drawPoints while the entity store rolled back,
so the next CONFIRM committed against an entity that no longer existed.

The dispatcher now sends `{ type: 'CANCEL' }` to the actor before
calling `temporal.undo()`. CANCEL is safe in every FSM state — draw
states reset, selected/editing return to safe states, idle is a
no-op.

Regression test: src/hooks/__tests__/undoCancel.test.ts.
```

Reference issues / PRs in the body, not the subject:

```text
Closes #142
See ARCHITECTURE.md → "Anti-corruption layer (R2)"
```

## Atomic commits

One commit = one logical change. Don't pack a bug fix and a refactor
into the same commit; split them. Splitting is easy on the dev side
(`git add -p` or commit-then-amend during the review) and pays off
during bisects, reverts, and changelog reviews.

Concrete patterns:

- **Add a new entity type** → split into:
  1. `feat(types): introduce TollGateEntity`
  2. `feat(io): round-trip toll gate proto`
  3. `feat(inspector): add toll gate form`
  4. `feat(actions): register toll gate draw tool`
  5. `test: cover toll gate cascade-delete`
- **Refactor that uncovers a bug** → split into:
  1. `fix(...)`: minimal patch with a regression test.
  2. `refactor(...)`: the broader cleanup.

## BREAKING CHANGE

Append `BREAKING CHANGE:` in the footer when the change forces
consumers (other modules, IPC contracts, license payload format,
docs/api references) to adapt:

```text
refactor(license): rotate Ed25519 keypair

Generated a fresh keypair via tools/license-gen/gen-keys.mjs. The
embedded public key in electron/license/public-key.cts is replaced.

BREAKING CHANGE: Activation codes signed with the previous private
key are rejected after this commit ships. Customers on existing
licenses must request re-issued codes; older installers continue to
trust the old key until upgraded.
```

git-cliff renders breaking commits with a `[**breaking**]` marker in
the changelog group they belong to.

## PR title style

Same format as the commit subject:

```text
feat(inspector): add friction field to lane form
fix(spatial): correct mercator scale on hit-test radius
```

The PR title becomes the merge commit subject by default, so it must
parse as Conventional Commits or it pollutes the changelog. The
[pr-checklist](./pr-checklist.md) flags this explicitly.

## Pre-commit hook

`.husky/pre-commit` runs `pnpm exec lint-staged`. `lint-staged`
config (in `package.json`):

```json
{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md,yml,yaml,css}": ["prettier --write"]
}
```

The hook auto-fixes formatting and re-stages the changes. If ESLint
finds an unfixable error, the commit is blocked.

::: warning Don't `--no-verify`
Bypassing the hook just defers the failure to CI. If a hook fails,
fix the underlying issue and **create a new commit** — never amend
across a hook failure (the previous commit may have left a partial
state). The CI runs the same lint + format pass.
:::

## Verifying your history before push

```sh
git log --oneline origin/v1..HEAD
```

Each line should parse as `type(scope): subject` and read sensibly to
someone who didn't write it. If you spot a non-conventional message,
rebase before pushing:

```sh
git rebase -i origin/v1
# reword the offending commit
```

## git-cliff configuration

`cliff.toml` lives at the repo root. Key bits:

```toml
[git]
conventional_commits = true
filter_unconventional = true   # silently drop messages that don't parse
require_conventional = false   # don't fail on non-conventional commits
sort_commits = "oldest"

[git.commit_parsers]
{ message = "^feat",     group = "🚀 Features" },
{ message = "^fix",      group = "🐛 Bug Fixes" },
{ message = "^doc",      group = "📚 Documentation" },
{ message = "^perf",     group = "⚡ Performance" },
{ message = "^refactor", group = "🚜 Refactor" },
{ message = "^style",    group = "🎨 Styling" },
{ message = "^test",     group = "🧪 Testing" },
{ message = "^chore|^ci",group = "⚙️ Miscellaneous Tasks" },
{ body = ".*security",   group = "🛡️ Security" },
{ message = "^revert",   group = "◀️ Revert" },
{ message = ".*",        group = "💼 Other" },
```

`filter_unconventional = true` means a commit like `Update foo` is
**dropped** from the changelog. Always commit with a recognised type.

## Cross-references

- [release-process](./release-process.md) — how the changelog is
  regenerated and tagged
- [pr-checklist](./pr-checklist.md) — review gating items
- [code-style](./code-style.md) — what the pre-commit hook enforces
- `cliff.toml` — full configuration reference
