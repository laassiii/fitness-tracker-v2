import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
test.describe.configure({ mode: "serial" });
let page: Page;
let context: BrowserContext;
let local: { API_URL: string; SECRET_KEY: string };
const email = `browser-${randomUUID()}@example.invalid`;
const password = randomUUID() + randomUUID();
test.beforeAll(async ({ browser }) => {
  const command = process.platform === "win32" ? "cmd.exe" : "npx";
  const args =
    process.platform === "win32"
      ? [
          "/c",
          "npx supabase status --output json --agent no --output-format text",
        ]
      : [
          "supabase",
          "status",
          "--output",
          "json",
          "--agent",
          "no",
          "--output-format",
          "text",
        ];
  local = JSON.parse(
    execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  if (local.API_URL !== "http://127.0.0.1:55321")
    throw new Error("Browser tests require isolated local Supabase");
  context = await browser.newContext({
    baseURL: "http://localhost:5173",
    viewport: { width: 1280, height: 900 },
  });
  page = await context.newPage();
});
test.afterAll(async () => {
  if (local) {
    const result = await (
      await fetch(`${local.API_URL}/auth/v1/admin/users?per_page=1000`, {
        headers: { apikey: local.SECRET_KEY },
      })
    ).json();
    const user = result.users?.find(
      (u: { email: string }) => u.email === email,
    );
    if (user) {
      const response = await fetch(
        `${local.API_URL}/auth/v1/admin/users/${user.id}`,
        { method: "DELETE", headers: { apikey: local.SECRET_KEY } },
      );
      if (!response.ok) throw new Error("Browser fixture cleanup failed");
    }
  }
  await context?.close();
});
test("protected entry and explicit signup consent", async () => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Check your email");
});
test("email verification, consent recording and onboarding", async () => {
  let hash: string | undefined;
  await expect
    .poll(async () => {
      const messages = await (
        await fetch("http://127.0.0.1:55324/api/v1/messages")
      ).json();
      const message = messages.messages?.find(
        (m: { To: { Address: string }[] }) =>
          m.To.some((t) => t.Address === email),
      );
      if (message) {
        const body = await (
          await fetch(`http://127.0.0.1:55324/api/v1/message/${message.ID}`)
        ).json();
        hash = body.HTML?.match(/token_hash=([a-zA-Z0-9_-]+)/)?.[1];
      }
      return Boolean(hash);
    })
    .toBe(true);
  await page.goto(`/?token_hash=${hash}&type=email`);
  await expect(
    page.getByRole("heading", { name: "Your profile" }),
  ).toBeVisible();
  await page.getByLabel("Handle").fill(`browser_${randomUUID().slice(0, 8)}`);
  await page.getByLabel("Display name").fill("Browser Test");
  await page.getByLabel("Bio").fill("<script>untrusted text</script>");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(
    page.getByRole("heading", { name: "Ready to train, Browser Test?" }),
  ).toBeVisible();
  expect(page.url()).not.toContain("token_hash");
});
test("session restoration and custom exercise workflow", async () => {
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Ready to train, Browser Test?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Exercises", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Exercise library" }),
  ).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Browser Custom Row");
  await page.getByLabel("Muscle group").fill("Back");
  await page.getByLabel("Equipment").fill("Dumbbell");
  await page.getByRole("button", { name: "Add exercise", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Browser Custom Row" }),
  ).toBeVisible();
});
test("plan creation, day/exercise/targets and workout execution", async () => {
  await page.getByRole("button", { name: "Plans", exact: true }).click();
  await page.getByLabel("Plan name").fill("Browser Plan");
  await page.getByRole("button", { name: "Create plan", exact: true }).click();
  await page.getByLabel("New workout day").fill("Browser Push");
  await page.getByRole("button", { name: "Add day", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Add exercise", exact: true })
    .selectOption({ label: "Bench Press" });
  await page.getByRole("button", { name: "Add to day" }).click();
  await page.getByLabel("Target sets").fill("2");
  await page.getByRole("button", { name: "Save targets" }).click();
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Browser Push" }),
  ).toBeVisible();
  await page.getByLabel("Weight (kg)", { exact: true }).fill("80");
  await page.getByLabel("Reps", { exact: true }).fill("8");
  await page.getByRole("button", { name: "Log set for Bench Press" }).click();
  await expect(page.getByRole("cell", { name: "80 kg" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Resume Browser Push" }).click();
  await expect(page.getByRole("cell", { name: "80 kg" })).toBeVisible();
  await page.getByRole("button", { name: "Complete workout" }).click();
  await expect(
    page.getByRole("heading", { name: "Workout history" }),
  ).toBeVisible();
});
test("historical integrity, progress and optional metrics", async () => {
  await page.getByRole("button", { name: "Plans", exact: true }).click();
  await page.getByRole("button", { name: "Browser Plan", exact: true }).click();
  await page.getByLabel("Workout day", { exact: true }).fill("Edited day");
  await page.getByRole("button", { name: "Save day name" }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("button", { name: "View workout" }).click();
  await expect(
    page.getByRole("heading", { name: "Browser Push" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Complete workout" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Personal records" }),
  ).toBeVisible();
  await expect(page.getByText(/heaviest set 80 kg/)).toBeVisible();
  await page.getByLabel("Bodyweight (kg)").fill("75");
  await page.getByRole("button", { name: "Save measurement" }).click();
  await expect(
    page.getByRole("button", { name: "Edit measurement" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit measurement" }).click();
  await page.getByLabel("Bodyweight (kg)").fill("76");
  await page.getByRole("button", { name: "Save measurement" }).click();
  await expect(page.getByText(/76 kg/)).toBeVisible();
  await page.screenshot({
    path: "test-results/local-progress-desktop.png",
    fullPage: true,
  });
});
test("safe rendering, mobile usability and no browser data database", async () => {
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.getByLabel("Bio")).toHaveValue(
    "<script>untrusted text</script>",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Save profile" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
  await page.screenshot({
    path: "test-results/local-profile-mobile.png",
    fullPage: true,
  });
});
test("signout clears restoration and signin works again", async () => {
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ready to train, Browser Test?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
});
test("password recovery is usable through the local email link", async () => {
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send recovery email" }).click();
  await expect(page.getByRole("status")).toContainText("recovery email");
  let hash: string | undefined;
  await expect
    .poll(async () => {
      const messages = await (
        await fetch("http://127.0.0.1:55324/api/v1/messages")
      ).json();
      const entry = messages.messages?.find(
        (m: { To: { Address: string }[]; Subject: string }) =>
          m.To.some((t) => t.Address === email) &&
          m.Subject.includes("Recover"),
      );
      if (entry) {
        const body = await (
          await fetch(`http://127.0.0.1:55324/api/v1/message/${entry.ID}`)
        ).json();
        hash = body.HTML?.match(/token_hash=([a-zA-Z0-9_-]+)/)?.[1];
      }
      return Boolean(hash);
    })
    .toBe(true);
  await page.goto(`/?token_hash=${hash}&type=recovery`);
  await expect(
    page.getByRole("heading", { name: "Choose a new password" }),
  ).toBeVisible();
  const next = randomUUID() + randomUUID();
  await page.getByLabel("Password", { exact: true }).fill(next);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("status")).toContainText("Password updated");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(next);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ready to train, Browser Test?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
});
