# Nexus v0.2.3 - Agent Intelligence Layer (change set)

The GitHub token available to the author is read-only (`403 Resource not accessible by personal
access token` on branch creation), so this could not be pushed as a branch/PR. Apply it manually.

## 1. Copy the new files into the repo (paths already mirror the repo layout)

    NexusCLI/nexus/src/intelligence/intent.ts
    NexusCLI/nexus/src/intelligence/memory.ts
    NexusCLI/nexus/src/intelligence/supervisor.ts
    NexusCLI/nexus/src/intelligence/trust.ts
    NexusCLI/nexus/test/agent-intelligence.test.ts
    NEXUS_AGENT_INTELLIGENCE_REVIEW.md            <- repo root

## 2. Apply the five anchored edits

See section 8 of NEXUS_AGENT_INTELLIGENCE_REVIEW.md:
src/domain/types.ts, src/composition.ts, src/tools/executor.ts,
src/permissions/engine.ts, src/core/agent-loop.ts

## 3. Run the gate (NOT run by the author - no bun, no network)

    cd NexusCLI/nexus && bun install && bun run check

## local-evidence/

What WAS executed: a Node harness over the four pure modules, 17/17 pass.
Run it with:  node --import tsx --test harness.ts   (needs the shim, see the review doc)
