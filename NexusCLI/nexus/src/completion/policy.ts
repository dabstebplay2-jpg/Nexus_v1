import type { Action, AgentSession, Check, Contract, Decision, Evidence, Project } from "../domain/types"
import { classifyIntent } from "./intent"

export function createContract(goal: string, project: Project, mode: Contract["mode"], goalCheck?: Check): Contract {
  if (mode === "answer")
    return {
      revision: 1,
      goal,
      mode,
      checks: [],
      criteria: [
        {
          id: "answer",
          description: "A non-empty informational response was delivered (not a coding success claim)",
          kind: "GOAL_ASSERTION",
          required: true,
        },
      ],
    }
  const checks = [...project.checks, ...(goalCheck ? [goalCheck] : [])]
  // A repair request is proved by reproducing the failure and then removing it. A user-supplied
  // goal check is already a stronger proof, so it replaces the reproduction contract.
  const test =
    !goalCheck && classifyIntent(goal) === "repair"
      ? project.checks.find((check) => check.kind === "TEST_RESULT")
      : undefined
  return {
    revision: 1,
    goal,
    mode,
    checks,
    criteria: [
      ...checks.map((check) => ({
        id: check.id,
        description: check.description,
        checkId: check.id,
        kind: check.kind,
        required: true,
      })),
      ...(test
        ? [
            {
              id: "reproduction",
              description: "Original test failure reproduced before changes",
              checkId: test.id,
              kind: "TEST_RESULT" as const,
              expectedVerdict: "fail" as const,
              baseline: true,
              required: true,
            },
            {
              id: "goal",
              description: "The originally failing test suite now passes",
              checkId: test.id,
              kind: "TEST_RESULT" as const,
              required: true,
            },
          ]
        : !goalCheck
          ? [
              {
                id: "goal",
                description: "User confirms the original scenario, or supplies a trusted goal check",
                kind: "GOAL_ASSERTION" as const,
                required: true,
              },
            ]
          : []),
    ],
  }
}
/** Only this policy authorizes COMPLETED. Model text and arbitrary COMMAND_RESULT never satisfy checks. */
export function completionPolicy(
  session: AgentSession,
  actions: Action[],
  evidence: Evidence[],
  fingerprint: string,
): Decision {
  const unknown = actions.filter((action) => action.sideEffect && ["STARTED", "UNKNOWN"].includes(action.status))
  if (unknown.length)
    return {
      outcome: "BLOCKED",
      reason: "Uncertain side effects require inspection before completion",
      missing: unknown.map((action) => action.id),
    }
  if (session.errors.length)
    return { outcome: "INCOMPLETE", reason: "Unresolved runtime errors", missing: session.errors }
  // Repetition cannot turn an unattributable check into a proof. Once a check has come back
  // unknown twice, say so and stop instead of verifying forever.
  const unknownFor = (checkId: string) =>
    evidence.filter(
      (item) =>
        item.contractRevision === session.contract.revision &&
        item.source === "verification" &&
        item.metadata.checkId === checkId &&
        item.verdict === "unknown",
    )
  const unprovable = session.contract.criteria.filter(
    (criterion) =>
      criterion.required && criterion.checkId && !criterion.baseline && unknownFor(criterion.checkId).length >= 2,
  )
  if (unprovable.length)
    return {
      outcome: "UNKNOWN",
      reason: unprovable
        .map((criterion) => {
          const detail = unknownFor(criterion.checkId!).at(-1)?.metadata.unknownReason
          return `${criterion.description}: ${typeof detail === "string" ? detail : "the check result could not be attributed to the agent's work"}`
        })
        .join("; "),
      missing: unprovable.map((criterion) => criterion.id),
    }
  const missing = session.contract.criteria.filter((criterion) => {
    if (!criterion.required) return false
    const candidates = evidence.filter(
      (item) =>
        item.contractRevision === session.contract.revision &&
        item.fingerprint === (criterion.baseline ? session.contract.baselineFingerprint : fingerprint) &&
        (criterion.checkId
          ? item.source === "verification" &&
            item.metadata.checkId === criterion.checkId &&
            item.kind === criterion.kind
          : item.kind === criterion.kind &&
            (item.source === "user" || (session.contract.mode === "answer" && item.source === "core"))),
    )
    const latest = criterion.baseline
      ? candidates.find((item) => item.verdict === criterion.expectedVerdict)
      : candidates.at(-1)
    return !latest || latest.verdict !== (criterion.expectedVerdict ?? "pass")
  })
  if (missing.length)
    return {
      outcome: missing.every((item) => !item.checkId) ? "NEEDS_USER_INPUT" : "NEEDS_VERIFICATION",
      reason: missing.map((item) => item.description).join("; "),
      missing: missing.map((item) => item.id),
    }
  const pending = session.plan.filter((step) => step.state !== "DONE")
  if (pending.length)
    return { outcome: "INCOMPLETE", reason: "Plan still has unfinished steps", missing: pending.map((step) => step.id) }
  return {
    outcome: "COMPLETE",
    reason: "All required criteria have current, trusted passing evidence; plan and ledger are settled",
    missing: [],
  }
}
