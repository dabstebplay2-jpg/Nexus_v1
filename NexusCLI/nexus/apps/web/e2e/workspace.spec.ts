import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

test.setTimeout(25000)
test.use({ viewport: { width: 1440, height: 960 } })

const tab = (page: Page, id: string) => page.locator(`[role="tab"] [data-panel-tab="${id}"]`)
const open = async (page: Page, title: string) => {
  await page.locator(".workspace-toolbar summary").filter({ hasText: /^Panels$/ }).click()
  await page.getByRole("button", { name: `Open ${title}`, exact: true }).click()
}
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("nexus.workspace.v1")!))
const drag = async (page: Page, from: { x: number; y: number }, to: { x: number; y: number }) => {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 10, from.y + 40, { steps: 5 })
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.waitForTimeout(150)
  await page.mouse.up()
}
const groups = (page: Page) => page.evaluate(() => {
  const model = JSON.parse(localStorage.getItem("nexus.workspace.v1")!).layouts.find((item: { id: string }) => item.id === "developer").layout
  const collect = (node: { type: string; children?: { id: string; type: string }[] }): string[][] => node.type === "tabset" ? [node.children!.map((item) => item.id)] : (node.children ?? []).flatMap(collect)
  return collect(model.layout)
})

test("all panels can be closed and reopened; layout operations never mutate agent or project state", async ({ page }) => {
  const writes: string[] = []
  page.on("request", (request) => { if (request.url().includes("/api/") && request.method() !== "GET") writes.push(request.url()) })
  await page.goto("/")
  await expect(tab(page, "chat")).toBeVisible()
  for (const title of ["Agent Timeline", "Files", "Terminal", "Changes / Diff", "Plan", "Evidence", "Permissions", "Project Explorer", "Logs", "Editor", "Agent State"]) {
    await open(page, title)
    await expect(page.getByLabel(`${title} panel`, { exact: true })).toBeVisible()
  }
  await tab(page, "chat").click()
  await page.getByPlaceholder("Describe the task…").fill("Keep this draft while docking")
  await page.locator(".workspace-toolbar summary").filter({ hasText: /^Arrange$/ }).click()
  await page.getByRole("button", { name: "Join Execution + Agent State", exact: true }).click()
  await expect(page.getByPlaceholder("Describe the task…")).toHaveValue("Keep this draft while docking")
  await tab(page, "chat").locator("xpath=ancestor::*[@role='tab']").getByTitle("Close").click()
  await expect(tab(page, "chat")).toHaveCount(0)
  await open(page, "Chat")
  await expect(tab(page, "chat")).toBeVisible()
  expect(writes).toEqual([])
})

test("dragging tabs joins groups, reorders tabs and creates a split; resize survives reload", async ({ page }) => {
  await page.goto("/")
  await expect(tab(page, "execution")).toBeVisible()
  const source = await page.getByRole("tab", { name: "Execution", exact: true }).boundingBox()
  const destination = await page.getByLabel("Chat panel", { exact: true }).boundingBox()
  await drag(page, { x: source!.x + 30, y: source!.y + source!.height / 2 }, { x: destination!.x + destination!.width / 2, y: destination!.y + destination!.height / 2 })
  await expect.poll(async () => (await groups(page)).some((group) => group.includes("chat") && group.includes("execution"))).toBe(true)
  const execution = await page.getByRole("tab", { name: "Execution", exact: true }).boundingBox()
  const chat = await page.getByRole("tab", { name: "Chat", exact: true }).boundingBox()
  await drag(page, { x: execution!.x + 25, y: execution!.y + 15 }, { x: chat!.x + 2, y: chat!.y + 15 })
  await expect.poll(async () => (await groups(page)).find((group) => group.includes("chat"))).toEqual(["execution", "chat"])
  await tab(page, "chat").click()
  // The edge drop creates an arbitrary new bottom group, without a preset transition.
  const body = await page.getByLabel("Chat panel", { exact: true }).boundingBox()
  const moving = await page.getByRole("tab", { name: "Execution", exact: true }).boundingBox()
  await drag(page, { x: moving!.x + 25, y: moving!.y + 15 }, { x: body!.x + body!.width / 2, y: body!.y + body!.height - 8 })
  await expect.poll(async () => (await groups(page)).length).toBe(4)
  const splitter = page.locator(".flexlayout__splitter").first()
  const before = await splitter.boundingBox()
  await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2)
  await page.mouse.down()
  await page.mouse.move(before!.x + 65, before!.y + before!.height / 2, { steps: 8 })
  await page.mouse.up()
  const arrangement = await saved(page)
  await page.reload()
  await expect(tab(page, "chat")).toBeVisible()
  await expect(page.locator(".workspace-warning")).toHaveCount(0)
  expect(await saved(page)).toEqual(arrangement)
  const after = await page.locator(".flexlayout__splitter").first().boundingBox()
  expect(Math.abs(after!.x - before!.x)).toBeGreaterThan(20)
})

test("presets and custom layouts restore their own tabs, selection and sizes", async ({ page, browser }) => {
  await page.goto("/")
  await page.getByLabel("Workspace layout").selectOption("coding")
  await expect(page.getByLabel("Editor panel", { exact: true })).toBeVisible()
  await expect(page.getByLabel("Terminal panel", { exact: true })).toBeVisible()
  await page.locator(".workspace-toolbar summary").filter({ hasText: /^Layouts$/ }).click()
  await page.getByLabel("Save current arrangement as").fill("Code-first")
  await page.getByRole("button", { name: "Save layout", exact: true }).click()
  const custom = await page.getByLabel("Workspace layout").inputValue()
  await page.getByLabel("Workspace layout").selectOption("analysis")
  await expect(page.getByLabel("Agent Timeline panel", { exact: true })).toBeVisible()
  await expect(page.getByLabel("Evidence panel", { exact: true })).toBeVisible()
  await page.getByLabel("Workspace layout").selectOption(custom)
  await expect(page.getByLabel("Terminal panel", { exact: true })).toBeVisible()
  const context = await browser.newContext({ storageState: await page.context().storageState() })
  try {
    const reopened = await context.newPage()
    await reopened.goto("http://127.0.0.1:4321")
    await expect(reopened.getByLabel("Workspace layout")).toHaveValue(custom)
    await expect(reopened.getByLabel("Terminal panel", { exact: true })).toBeVisible()
  } finally { await context.close() }
  await page.locator(".workspace-toolbar summary").filter({ hasText: /^Layouts$/ }).click()
  await page.screenshot({ path: "test-results/workspace-coding.png" })
})

test("a corrupt saved workspace recovers, and the explorer opens real project files", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("nexus.workspace.v1", "{broken"))
  await page.goto("/")
  await expect(page.locator(".workspace-warning")).toContainText("Developer layout was recovered")
  await open(page, "Project Explorer")
  await page.getByLabel("Project Explorer panel", { exact: true }).getByRole("button", { name: "add.ts", exact: true }).click()
  await expect(page.getByLabel("File content", { exact: true })).toContainText("export const add")
  await expect(page.getByLabel("Editor panel", { exact: true })).toContainText("Read-only")
})
