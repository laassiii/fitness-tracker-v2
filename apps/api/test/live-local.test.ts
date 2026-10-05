import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index";

// Privileged credentials are used ONLY by this explicitly local fixture harness.
// The Worker receives the publishable key and the user's JWT, never an admin key.
const enabled = process.env.RUN_LOCAL_INTEGRATION === "1";
describe.runIf(enabled)("real local Supabase Auth/PostgREST/RLS", () => {
  let env: Env;
  let adminKey: string;
  let a: { id: string; token: string };
  let b: { id: string; token: string };
  let planId: string;
  let dayId: string;
  let sessionId: string;
  let exerciseId: string;
  const idempotencyKey = randomUUID();
  async function api(
    user: typeof a,
    path: string,
    method = "GET",
    body?: unknown,
  ) {
    return worker.fetch(
      new Request(`http://localhost:8787/api/v1${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${user.token}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
    );
  }
  beforeAll(async () => {
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
    const cli = execFileSync(command, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const local = JSON.parse(cli);
    if (local.API_URL !== "http://127.0.0.1:55321")
      throw new Error("Integration tests require the isolated local stack");
    env = {
      SUPABASE_URL: local.API_URL,
      SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
      APP_ORIGIN: "http://localhost:5173",
    };
    adminKey = local.SECRET_KEY;
    async function fixture() {
      const email = `fitness-${randomUUID()}@example.invalid`;
      const password = randomUUID() + randomUUID();
      const created = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
        method: "POST",
        headers: {
          apikey: adminKey,
          Authorization: `Bearer ${local.SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, email_confirm: true }),
      });
      if (!created.ok) throw new Error("Local fixture creation failed");
      const user = await created.json();
      const signed = await fetch(
        `${env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
        {
          method: "POST",
          headers: {
            apikey: env.SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        },
      );
      if (!signed.ok) throw new Error("Local sign-in failed");
      const token = (await signed.json()).access_token;
      const consent = await fetch(
        `${env.SUPABASE_URL}/rest/v1/rpc/accept_current_documents`,
        {
          method: "POST",
          headers: {
            apikey: env.SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_terms: "2026-10-v1",
            p_privacy: "2026-10-v1",
          }),
        },
      );
      if (!consent.ok) throw new Error("Local fixture consent failed");
      return { id: user.id, token };
    }
    a = await fixture();
    b = await fixture();
  }, 30000);
  afterAll(async () => {
    for (const user of [a, b])
      if (user) {
        const response = await fetch(
          `${env.SUPABASE_URL}/auth/v1/admin/users/${user.id}`,
          { method: "DELETE", headers: { apikey: adminKey } },
        );
        if (!response.ok) throw new Error("Local fixture cleanup failed");
      }
  });
  it("accepts a real JWT and identifies both users", async () => {
    for (const user of [a, b])
      expect(await (await api(user, "/me")).json()).toEqual({
        user: { id: user.id },
      });
  });
  it("rejects body identity tampering", async () => {
    expect(
      (await api(a, "/plans", "POST", { name: "Plan", owner_id: b.id })).status,
    ).toBe(422);
  });
  it("creates an owned plan and isolates B at API and direct RLS layers", async () => {
    const created = await api(a, "/plans", "POST", {
      name: "Integration Plan",
    });
    expect(created.status).toBe(201);
    planId = (await created.json())[0].id;
    expect((await api(b, `/plans/${planId}`)).status).toBe(404);
    const direct = await fetch(
      `${env.SUPABASE_URL}/rest/v1/workout_plans?id=eq.${planId}`,
      {
        headers: {
          apikey: env.SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${b.token}`,
        },
      },
    );
    expect(await direct.json()).toEqual([]);
  });
  it("rejects query tampering", async () => {
    expect((await api(a, `/plans?owner_id=${b.id}`)).status).toBe(422);
  });
  it("keeps plan read within its upstream and response projection budgets", async () => {
    const response = await api(a, `/plans/${planId}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Upstream-Requests")).toBe("4");
    const plan = await response.json();
    expect(plan.id).toBe(planId);
    expect(plan.workout_days).toEqual([]);
    expect(plan).not.toHaveProperty("owner_id");
    expect(plan).not.toHaveProperty("created_at");
    expect((await api(a, "/plans/abc")).status).toBe(422);
  });
  it("rejects a cross-user write through the API", async () => {
    expect(
      (await api(b, `/plans/${planId}`, "PATCH", { name: "Forged" })).status,
    ).toBe(404);
  });
  it("creates a day and exercise", async () => {
    dayId = (
      await (
        await api(a, `/plans/${planId}/days`, "POST", {
          name: "Push",
          position: 0,
        })
      ).json()
    )[0].id;
    const response = await api(a, `/days/${dayId}/exercises`, "POST", {
      exercise_id: "10000000-0000-4000-8000-000000000001",
      position: 0,
    });
    expect(response.status).toBe(201);
  });
  it("starts a real session and retries idempotently", async () => {
    const body = { day_id: dayId, idempotency_key: idempotencyKey };
    sessionId = (await (await api(a, "/sessions", "POST", body)).json()).id;
    expect((await (await api(a, "/sessions", "POST", body)).json()).id).toBe(
      sessionId,
    );
    const session = await (await api(a, `/sessions/${sessionId}`)).json();
    exerciseId = session.session_exercises[0].id;
  });
  it("logs sets and completes the session", async () => {
    expect(
      (
        await api(a, `/session-exercises/${exerciseId}/sets`, "POST", {
          id: randomUUID(),
          position: 0,
          reps: 8,
          weight_kg: 80,
        })
      ).status,
    ).toBe(201);
    expect(
      (await api(a, `/sessions/${sessionId}/complete`, "POST", {})).status,
    ).toBe(201);
    expect(
      (
        await api(a, `/session-exercises/${exerciseId}/sets`, "POST", {
          id: randomUUID(),
          position: 1,
          reps: 8,
          weight_kg: 80,
        })
      ).status,
    ).toBe(409);
  });
  it("keeps history stable after plan edits", async () => {
    await api(a, `/days/${dayId}`, "PATCH", { name: "Changed" });
    const history = await (await api(a, "/history")).json();
    expect(history.items[0].name_snapshot).toBe("Push");
    expect((await (await api(b, "/history")).json()).items).toEqual([]);
  });
  it("stores private optional body metrics", async () => {
    expect(
      (await api(a, "/body-metrics", "POST", { weight_kg: 75 })).status,
    ).toBe(201);
    expect((await (await api(b, "/body-metrics")).json()).items).toEqual([]);
  });
  it("derives progress and PRs from completed sessions", async () => {
    expect(
      (await (await api(a, "/progress")).json()).items[0].heaviest_kg,
    ).toBe(80);
    expect(
      (await (await api(a, "/personal-records")).json()).items[0].heaviest_kg,
    ).toBe(80);
  });
});
