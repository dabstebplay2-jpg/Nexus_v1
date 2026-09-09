import { expect, test } from "@playwright/test"

test("discover, select, Probe, reload and run a task through browser SSE", async ({ page, request }) => {
  const info = await (await request.get("/__fixture")).json()
  const failures: string[] = []
  page.on("pageerror", (error) => failures.push(error.message))
  await page.goto("/")
  await expect(page.getByLabel("Endpoint / Base URL")).toHaveValue(info.baseUrl)
  await page.getByRole("button", { name: "Discover models" }).click()
  await expect(page.getByRole("status")).toContainText("Models discovered")
  const choices = await page
    .locator("#model option")
    .evaluateAll((options) =>
      options.map((option) => ({ value: (option as HTMLOptionElement).value, text: option.textContent })),
    )
  const model = choices.find((option) => !option.text?.includes("not discovered"))!.value
  await page.getByLabel("Model", { exact: true }).selectOption(model)
  await expect(page.getByRole("button", { name: "Send task" })).toBeDisabled()
  await page.getByRole("button", { name: "Probe", exact: true }).click()
  await expect(page.getByRole("status")).toContainText("Connected", { timeout: 70000 })
  await page.reload()
  await expect(page.getByLabel("Model", { exact: true })).toHaveValue(model)
  await expect(page.getByLabel("Endpoint / Base URL")).toHaveValue(info.baseUrl)
  await expect(page.getByRole("status")).toContainText("Connection not checked")
  const started = page.waitForResponse(
    (response) => response.url().endsWith("/api/runs") && response.request().method() === "POST",
  )
  const stream = page.waitForResponse((response) => response.url().includes("/events?cursor="))
  await page
    .getByPlaceholder("Describe the task…")
    .fill(
      "Fix the add function in add.ts to add a and b instead of subtracting. Read the file, edit only that expression and verify using the provided goal check. Do not modify scenario.ts. Then finish.",
    )
  await page.getByRole("button", { name: "Send task" }).click()
  const run = await (await started).json()
  expect((await stream).headers()["content-type"]).toContain("text/event-stream")
  await expect(page.locator(".log")).toContainText("finished", { timeout: 110000 })
  const report = await (await request.get(`/api/runs/${run.id}/report`)).json()
  console.log(
    JSON.stringify({
      backend: info.realBackend ? "REAL" : "FAKE",
      runId: run.id,
      status: report.status,
      turns: report.turns,
      toolCount: report.toolCount,
      decision: report.decision,
    }),
  )
  expect(report.status).toBe("COMPLETED")
  expect(report.proposal?.text.length).toBeGreaterThan(0)
  expect(report.changes.files.some((file: { path: string }) => file.path === "add.ts")).toBe(true)
  expect(report.verification.every((check: { verdict: string }) => check.verdict === "pass")).toBe(true)
  expect(failures).toEqual([])
  console.log(
    JSON.stringify({
      backend: info.realBackend ? "REAL" : "FAKE",
      baseUrl: info.baseUrl,
      model,
      runId: run.id,
      status: report.status,
      turns: report.turns,
      toolCount: report.toolCount,
      proposal: report.proposal,
    }),
  )
})

test("informational task returns a final LLM answer through browser EventSource", async ({ page, request }) => {
  const info = await (await request.get("/__fixture")).json()
  await page.goto("/")
  await page.getByRole("button", { name: "Discover models" }).click()
  await expect(page.getByRole("status")).toContainText("Models discovered")
  const choices = await page
    .locator("#model option")
    .evaluateAll((options) =>
      options.map((option) => ({ value: (option as HTMLOptionElement).value, text: option.textContent })),
    )
  await page
    .getByLabel("Model", { exact: true })
    .selectOption(choices.find((option) => !option.text?.includes("not discovered"))!.value)
  await page.getByRole("button", { name: "Probe", exact: true }).click()
  await expect(page.getByRole("status")).toContainText("Connected", { timeout: 70000 })
  const events = await page.evaluate(async () => {
    const projects = await (await fetch("/api/projects")).json()
    const run = await (
      await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projects[0].id,
          answerOnly: true,
          goal: "This is an informational connection test. Do not use any tools. Do not inspect or change files. Reply with exactly NEXUS_LOCAL_OK as your final answer.",
        }),
      })
    ).json()
    return await new Promise<{ id: string; types: string[] }>((resolve, reject) => {
      const stream = new EventSource(`/api/runs/${run.id}/events`)
      const types: string[] = []
      const timeout = setTimeout(() => {
        stream.close()
        reject(new Error("SSE timed out"))
      }, 100000)
      stream.onmessage = (message) => {
        const event = JSON.parse(message.data)
        types.push(event.type)
        if (event.type === "run_finished") {
          clearTimeout(timeout)
          stream.close()
          resolve({ id: run.id, types })
        }
      }
      stream.onerror = () => {
        clearTimeout(timeout)
        stream.close()
        reject(new Error("SSE failed"))
      }
    })
  })
  const report = await (await request.get(`/api/runs/${events.id}/report`)).json()
  console.log(
    JSON.stringify({
      backend: info.realBackend ? "REAL" : "FAKE",
      ...events,
      status: report.status,
      turns: report.turns,
      proposal: report.proposal,
    }),
  )
  expect(events.types).toContain("run_finished")
  expect(report.status).toBe("COMPLETED")
  expect(report.proposal?.text.length).toBeGreaterThan(0)
})

test("endpoint edits clear connected status and unsupported discovery exposes manual input", async ({
  page,
  request,
}) => {
  test.skip(Boolean(process.env.NEXUS_E2E_BASE_URL), "Fake backend error routes only")
  const info = await (await request.get("/__fixture")).json()
  await page.goto("/")
  await page.getByRole("button", { name: "Discover models" }).click()
  await expect(page.getByRole("status")).toContainText("Models discovered")
  await page.getByLabel("Model", { exact: true }).selectOption("fixture-model-a")
  await page.getByRole("button", { name: "Probe", exact: true }).click()
  await expect(page.getByRole("status")).toContainText("Connected")
  await page.getByLabel("Endpoint / Base URL").fill(info.baseUrl.replace(/\/v1$/, "/unsupported/v1"))
  await expect(page.getByRole("status")).not.toContainText("Connected")
  await page.getByRole("button", { name: "Discover models" }).click()
  await expect(page.getByRole("status")).toContainText("discovery is unavailable")
  await expect(page.getByLabel("Manual model ID")).toBeChecked()
  await page.getByLabel("Model", { exact: true }).fill("manual-model")
  await page.getByRole("button", { name: "Probe", exact: true }).click()
  await expect(page.getByRole("status")).toContainText("Connected")
  await page.getByLabel("Endpoint / Base URL").fill("not-a-url")
  await page.getByRole("button", { name: "Save configuration" }).click()
  await expect(page.getByRole("status")).toContainText("Use an HTTP loopback or HTTPS")
})
