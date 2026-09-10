# Nexus v0.2.3 - Agent Intelligence Layer (integrated)

The integration is applied on `nexus-v0.2.3-agent-intelligence`. No manual copying or anchored
replacements are needed. See `NEXUS_AGENT_INTELLIGENCE_REVIEW.md` for architecture and verification.

## Included intelligence modules

    NexusCLI/nexus/src/intelligence/intent.ts
    NexusCLI/nexus/src/intelligence/memory.ts
    NexusCLI/nexus/src/intelligence/supervisor.ts
    NexusCLI/nexus/src/intelligence/trust.ts
    NexusCLI/nexus/test/agent-intelligence.test.ts
    NEXUS_AGENT_INTELLIGENCE_REVIEW.md            <- repo root

## Runtime integration

Section 8 of NEXUS_AGENT_INTELLIGENCE_REVIEW.md documents the applied changes:
src/domain/types.ts, src/composition.ts, src/tools/executor.ts,
src/permissions/engine.ts, src/core/agent-loop.ts

`src/domain/ports.ts` also carries optional workspace context for scoped trust profiles.
Old sessions without intent remain supported; CompletionPolicy is unchanged.

## Run the gate

    cd NexusCLI/nexus
    bun run check

## local-evidence/

Historical module-only evidence: a Node harness over the four pure modules, 17/17 pass.
Run it with:  node --import tsx --test harness.ts   (needs the shim, see the review doc)
