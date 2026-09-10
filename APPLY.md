# How to apply this change set

GitHub write access was refused for this token, so this archive replaces the pull request.

```
POST /repos/dabstebplay2-jpg/Nexus_v1/git/refs -> 403 Resource not accessible by personal access token
```

Nothing was pushed. `main` was not touched.

## Layout

Paths in this archive are repository-relative, so they can be copied straight over a clean checkout:

```
NEXUS_CONTEXT_ARCHITECTURE.md                      (new, repository root)
NexusCLI/nexus/src/context/layers.ts               (new)
NexusCLI/nexus/src/context/report.ts               (new)
NexusCLI/nexus/src/tools/router.ts                 (new)
NexusCLI/nexus/src/planner/policy.ts               (new)
NexusCLI/nexus/src/project/knowledge.ts            (new)
NexusCLI/nexus/test/context-engine.test.ts         (new)
NexusCLI/nexus/test/project-intelligence.test.ts   (new)
NexusCLI/nexus/src/context/manager.ts              (modified)
NexusCLI/nexus/src/context/budget.ts               (modified)
NexusCLI/nexus/src/context/memory.ts               (modified)
NexusCLI/nexus/src/domain/types.ts                 (modified)
NexusCLI/nexus/src/composition.ts                  (modified)
NexusCLI/nexus/docs/ARCHITECTURE.md                (modified, one appended section)
```

The modified files are complete replacements, not fragments.

## Apply

```bash
cd /path/to/Nexus_v1
git checkout main
git pull
git checkout -b nexus-context-foundation

unzip -o /path/to/nexus-context-foundation.zip -d /tmp/nexus-cf
rsync -a --exclude APPLY.md --exclude PR_DESCRIPTION.md /tmp/nexus-cf/ ./

git status
git diff --stat
```

## Verify

```bash
cd NexusCLI/nexus
bun run check
```

Expected steps: typecheck, boundaries, test, bench, build, smoke, product. The two new test files are
picked up automatically by the existing `bun test ./test` step, so `script/check.ts` needed no change.

**This command was not run by me.** Bun is not installed in the environment I worked in and it has no
network access, so `bun run check` could not execute. I am not going to report a gate result I did not
observe. What I did run is listed in `PR_DESCRIPTION.md` under "Quality gate".

## Sanity check on the one file that was rewritten wholesale

`docs/ARCHITECTURE.md` had to be reproduced in full in order to append a section. Before appending, the
reproduction was hashed and compared against the blob on `main`:

```
git hash-object docs/ARCHITECTURE.orig.md -> 5fb411b01486feda49d149859965062e0eebe45c
blob on main                              -> 5fb411b01486feda49d149859965062e0eebe45c
```

Byte-identical, so the appended `## Context Engine` section is the only change in that file. You can
confirm with `git diff docs/ARCHITECTURE.md` after applying.

## If you would rather not take the doc change

`docs/ARCHITECTURE.md` is the only file here whose change is purely editorial. Dropping it costs
nothing functionally:

```bash
git checkout main -- NexusCLI/nexus/docs/ARCHITECTURE.md
```
