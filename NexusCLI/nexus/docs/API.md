# Public API

`src/api.ts` is the UI boundary; `createNexus` in `src/composition.ts` is the application constructor.

```ts
const nexus = await createNexus({
  dataDir: "/home/me/.nexuscli",
  onEvent: (event) => render(event),
  permission: async (request, signal) => askUser(request, signal),
})
const session = await nexus.create({ workspace, goal, model })
await nexus.run(session.id, abortController.signal)
nexus.close()
```

Provider port accepts model configuration, bounded messages, captured tool specifications, output-token cap and AbortSignal. It yields text, completed tool calls, usage and finish. It never executes tools. Tests inject a scripted Provider; production uses OpenAICompatibleProvider and fetch. The adapter supports SSE fragmentation, non-streaming, cancellation, bounded 429/5xx retries and context-overflow errors. Partial streams are not retried, avoiding duplicated partial turns.

Store mutations are synchronous commit boundaries. transaction callbacks must remain synchronous. save uses optimistic version checks. Public inspect returns copies from SQLite; changing returned objects does not mutate the runner. prompt admits input independently from execution; CLI input during a running session is consumed at the next boundary, while idle sessions require explicit run/resume.

Events include created, state, model_request, usage, tool, permission, completion, recovery, loop_guard, error, trust_checks. They contain summaries, counts and durable IDs, not hidden model reasoning. --debug renders the persisted event language. The present Event.data is unknown for forward compatibility; clients should narrow by event type. A versioned transport schema for external UI clients is a next-stage task.

The provider wire implementation follows [OpenAI's official function-calling documentation](https://developers.openai.com/api/docs/guides/function-calling), with Chat Completions compatibility for local servers. Not all OpenAI-compatible servers support every optional parameter; live compatibility must be tested against the chosen deployment.
