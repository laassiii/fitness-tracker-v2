import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import worker, { type Env } from "../src/index";
// Explicit opt-in: actual production DB, local handler until deployed URL supplied.
// Privileged key is confined to disposable Auth fixture setup/cleanup, never Env.
const enabled =
  process.env.PRODUCTION_VALIDATION_REF === "iewlobsbtwovcgpalgva";
describe.runIf(enabled)("production database security gate", () => {
  let env: Env;
  let admin: string;
  const users: {
    id: string;
    token: string;
    plan?: string;
    day?: string;
    session?: string;
    metric?: string;
    ex?: string;
    set?: string;
    key?: string;
  }[] = [];
  const report = (name: string) => console.log("PASS " + name);
  async function api(
    u: (typeof users)[number],
    path: string,
    method = "GET",
    body?: unknown,
  ) {
    const request = new Request(`https://validation.invalid/api/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${u.token}`,
        "Content-Type": "application/json",
        Origin: env.APP_ORIGIN,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (process.env.DEPLOYED_API_URL)
      return fetch(process.env.DEPLOYED_API_URL + "/api/v1" + path, {
        method,
        headers: request.headers,
        body: request.body,
        duplex: "half",
      } as RequestInit);
    return worker.fetch(request, env);
  }
  async function rest(
    u: (typeof users)[number],
    path: string,
    method = "GET",
    body?: unknown,
  ) {
    return fetch(env.SUPABASE_URL + "/rest/v1/" + path, {
      method,
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${u.token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  async function data(r: Response, status: number) {
    expect(r.status).toBe(status);
    return r.json();
  }
  beforeAll(async () => {
    if (
      process.env.DEPLOYED_API_URL &&
      process.env.DEPLOYED_API_URL !==
        "https://fitness-tracker-api.fitness-fastapi-worker-spike.workers.dev"
    )
      throw new Error(
        "Refusing to send production JWTs to an unapproved API host",
      );
    const cli = execFileSync(
      "cmd.exe",
      [
        "/c",
        "npx supabase projects api-keys --project-ref iewlobsbtwovcgpalgva --reveal --output json",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const keys = JSON.parse(cli);
    admin = keys.find(
      (k: { name: string }) => k.name === "service_role",
    ).api_key;
    env = {
      SUPABASE_URL: "https://iewlobsbtwovcgpalgva.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: keys.find(
        (k: { type: string }) => k.type === "publishable",
      ).api_key,
      APP_ORIGIN:
        process.env.PRODUCTION_APP_ORIGIN ?? "https://validation.invalid",
    };
    for (let i = 0; i < 2; i++) {
      const email = `production-validation-${randomUUID()}@example.invalid`;
      const password = randomUUID() + randomUUID();
      const created = await fetch(env.SUPABASE_URL + "/auth/v1/admin/users", {
        method: "POST",
        headers: {
          apikey: admin,
          Authorization: `Bearer ${admin}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, email_confirm: true }),
      });
      expect(created.status).toBe(200);
      const identity = await created.json();
      const u = { id: identity.id, token: "" };
      users.push(u);
      const login = await fetch(
        env.SUPABASE_URL + "/auth/v1/token?grant_type=password",
        {
          method: "POST",
          headers: {
            apikey: env.SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        },
      );
      expect(login.status).toBe(200);
      u.token = (await login.json()).access_token;
      await data(
        await api(u, "/me/consents", "POST", {
          accepted: true,
          versions: { terms: "2026-10-v1", privacy: "2026-10-v1" },
        }),
        200,
      );
    }
    report("two disposable production Auth identities authenticated");
  }, 60000);
  afterAll(async () => {
    for (const u of users) {
      const deleted = await fetch(
        env.SUPABASE_URL + "/auth/v1/admin/users/" + u.id,
        {
          method: "DELETE",
          headers: { apikey: admin, Authorization: `Bearer ${admin}` },
        },
      );
      expect(deleted.status).toBe(200);
      const gone = await fetch(
        env.SUPABASE_URL + "/auth/v1/admin/users/" + u.id,
        { headers: { apikey: admin, Authorization: `Bearer ${admin}` } },
      );
      expect(gone.status).toBe(404);
    }
    report("disposable production identities removed and verified absent");
  }, 60000);
  it("both users own profiles, plans, sessions, metrics, history and consent", async () => {
    for (const u of users) {
      expect((await data(await api(u, "/me"), 200)).user.id).toBe(u.id);
      const handle = "v_" + randomUUID().slice(0, 12).replaceAll("-", "");
      await data(
        await api(u, "/me/profile", "PUT", {
          handle,
          display_name: "Validation only",
        }),
        200,
      );
      await data(
        await api(u, "/me/profile", "PUT", {
          handle,
          display_name: "Updated validation",
        }),
        200,
      );
      expect((await data(await api(u, "/me/profile"), 200)).display_name).toBe(
        "Updated validation",
      );
      u.plan = (
        await data(
          await api(u, "/plans", "POST", {
            name: "Disposable validation plan",
          }),
          201,
        )
      )[0].id;
      expect((await data(await api(u, "/plans/" + u.plan), 200)).id).toBe(
        u.plan,
      );
      u.day = (
        await data(
          await api(u, `/plans/${u.plan}/days`, "POST", {
            name: "Snapshot day",
            position: 0,
          }),
          201,
        )
      )[0].id;
      const catalog = await data(await api(u, "/exercises"), 200);
      await data(
        await api(u, `/days/${u.day}/exercises`, "POST", {
          exercise_id: catalog.system[0].id,
          position: 0,
        }),
        201,
      );
      u.key = randomUUID();
      u.session = await data(
        await api(u, "/sessions", "POST", {
          day_id: u.day,
          idempotency_key: u.key,
        }),
        201,
      );
      if (typeof u.session !== "string") u.session = (u.session as any).id;
      const session = await data(await api(u, "/sessions/" + u.session), 200);
      u.ex = session.session_exercises[0].id;
      u.set = randomUUID();
      await data(
        await api(u, `/session-exercises/${u.ex}/sets`, "POST", {
          id: u.set,
          position: 0,
          reps: 8,
          weight_kg: 80,
        }),
        201,
      );
      u.metric = (
        await data(
          await api(u, "/body-metrics", "POST", { weight_kg: 75 }),
          201,
        )
      )[0].id;
      await data(
        await api(u, "/body-metrics/" + u.metric, "PATCH", { weight_kg: 76 }),
        200,
      );
      expect(
        (await data(await api(u, "/body-metrics/" + u.metric), 200)).weight_kg,
      ).toBe(76);
      expect((await data(await api(u, "/me/consents"), 200)).accepted).toBe(
        true,
      );
    }
    report("both users own read/write workflows");
  }, 120000);
  it("real PostgREST RLS denies reads and writes in both directions", async () => {
    for (const [u, v] of [
      [users[0], users[1]],
      [users[1], users[0]],
    ]) {
      for (const [table, column] of [
        ["profiles", "user_id"],
        ["workout_plans", "owner_id"],
        ["workout_sessions", "owner_id"],
        ["body_metric_entries", "owner_id"],
        ["consent_acceptances", "user_id"],
      ]) {
        expect(
          await data(await rest(u, `${table}?${column}=eq.${v.id}`), 200),
        ).toEqual([]);
        const attempted = await rest(
          u,
          `${table}?${column}=eq.${v.id}`,
          "PATCH",
          table === "profiles"
            ? { display_name: "Forged" }
            : table === "workout_plans"
              ? { name: "Forged" }
              : table === "workout_sessions"
                ? { notes: "Forged" }
                : table === "body_metric_entries"
                  ? { weight_kg: 999 }
                  : { document_version: "forged" },
        );
        if (table === "consent_acceptances")
          expect([401, 403, 200]).toContain(attempted.status);
        else expect(await data(attempted, 200)).toEqual([]);
      }
      for (const path of [
        `/plans/${v.plan}`,
        `/sessions/${v.session}`,
        `/body-metrics/${v.metric}`,
      ])
        expect((await api(u, path)).status).toBe(404);
      expect((await api(u, "/me/profile?user_id=" + v.id)).status).toBe(422);
      expect((await api(u, "/me/consents?user_id=" + v.id)).status).toBe(200);
      expect(
        (
          await data(await api(u, "/me/consents?user_id=" + v.id), 200)
        ).records.every(
          (r: any) => r.user_id === undefined || r.user_id === u.id,
        ),
      ).toBe(true);
      expect(
        (
          await api(u, "/me/profile", "PUT", {
            handle: "forged",
            display_name: "Forged",
            user_id: v.id,
          })
        ).status,
      ).toBe(422);
      expect(
        (await api(u, "/plans", "POST", { name: "Forged", owner_id: v.id }))
          .status,
      ).toBe(422);
      const insert = await rest(u, "workout_plans", "POST", {
        owner_id: v.id,
        name: "Forged",
      });
      expect(insert.status).toBe(403);
    }
    report("bidirectional production RLS and identity tampering");
  }, 120000);
  it("session/set retries, closure and history snapshots remain correct", async () => {
    for (const u of users) {
      expect(
        (
          await data(
            await api(u, "/sessions", "POST", {
              day_id: u.day,
              idempotency_key: u.key,
            }),
            201,
          )
        ).id,
      ).toBe(u.session);
      await data(
        await api(u, "/sessions/" + u.session + "/complete", "POST", {}),
        201,
      );
      await data(
        await api(u, "/sessions/" + u.session + "/complete", "POST", {}),
        201,
      );
      expect(
        (await api(u, "/sets/" + u.set, "PATCH", { reps: 9 })).status,
      ).toBe(409);
      expect(
        (
          await api(u, `/session-exercises/${u.ex}/sets`, "POST", {
            id: randomUUID(),
            position: 1,
            reps: 8,
            weight_kg: 80,
          })
        ).status,
      ).toBe(409);
      await data(
        await api(u, `/session-exercises/${u.ex}/sets`, "POST", {
          id: u.set,
          position: 0,
          reps: 8,
          weight_kg: 80,
        }),
        201,
      );
      await data(
        await api(u, "/days/" + u.day, "PATCH", { name: "Edited plan day" }),
        200,
      );
      const saved = await data(await api(u, "/sessions/" + u.session), 200);
      expect(saved.name_snapshot).toBe("Snapshot day");
      expect(saved.session_exercises[0].performed_sets).toHaveLength(1);
      expect(
        (await data(await api(u, "/history"), 200)).items.some(
          (s: any) => s.id === u.session,
        ),
      ).toBe(true);
      await data(await api(u, "/progress"), 200);
    }
    report("production retries, closed session integrity and history");
  }, 120000);
});
