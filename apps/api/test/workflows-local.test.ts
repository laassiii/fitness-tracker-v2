import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import worker, { type Env } from "../src/index";
const enabled = process.env.RUN_LOCAL_INTEGRATION === "1";
describe.runIf(enabled)("complete local user workflows", () => {
  let env: Env;
  let admin: string;
  let token = "";
  let cookie = "";
  let userId = "";
  let otherId = "";
  let otherToken = "";
  let docs: { document_type: string; version: string }[];
  let plan: string;
  let day: string;
  let ex: string;
  let session: string;
  let setId: string;
  let metric: string;
  let signupStarted = 0;
  const email = `workflow-${randomUUID()}@example.invalid`;
  const password = randomUUID() + randomUUID();
  const nextPassword = randomUUID() + randomUUID();
  async function call(
    path: string,
    method = "GET",
    body?: unknown,
    asToken = token,
    asCookie = cookie,
  ) {
    return worker.fetch(
      new Request(`http://localhost:8787/api/v1${path}`, {
        method,
        headers: {
          Origin: env.APP_ORIGIN,
          "Content-Type": "application/json",
          ...(asToken ? { Authorization: `Bearer ${asToken}` } : {}),
          ...(asCookie ? { Cookie: asCookie } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
    );
  }
  function versions() {
    return Object.fromEntries(docs.map((d) => [d.document_type, d.version]));
  }
  async function emailHash() {
    for (let n = 0; n < 30; n++) {
      const list = await (
        await fetch("http://127.0.0.1:55324/api/v1/messages")
      ).json();
      const entry = list.messages?.find((m: { To: { Address: string }[] }) =>
        m.To.some((t) => t.Address === email),
      );
      if (entry) {
        const message = await (
          await fetch(`http://127.0.0.1:55324/api/v1/message/${entry.ID}`)
        ).json();
        const hash = (message.HTML ?? message.Text ?? "").match(
          /token_hash=([a-zA-Z0-9_-]+)/,
        )?.[1];
        if (hash) return hash;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Local email verification link not received");
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
    const local = JSON.parse(
      execFileSync(command, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
    if (local.API_URL !== "http://127.0.0.1:55321")
      throw new Error("Only isolated local Supabase is allowed");
    env = {
      SUPABASE_URL: local.API_URL,
      SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
      APP_ORIGIN: "http://localhost:5173",
    };
    admin = local.SECRET_KEY;
    docs = (await (await call("/legal")).json()).items;
    const response = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: admin, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `other-${randomUUID()}@example.invalid`,
        password,
        email_confirm: true,
      }),
    });
    otherId = (await response.json()).id;
    const login = await fetch(
      `${env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: (
            await (
              await fetch(
                `${env.SUPABASE_URL}/auth/v1/admin/users/${otherId}`,
                { headers: { apikey: admin } },
              )
            ).json()
          ).email,
          password,
        }),
      },
    );
    otherToken = (await login.json()).access_token;
  }, 30000);
  afterAll(async () => {
    const users =
      (
        await (
          await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
            headers: { apikey: admin },
          })
        ).json()
      ).users ?? [];
    for (const id of [
      otherId,
      userId || users.find((u: { email: string }) => u.email === email)?.id,
    ])
      if (id) {
        const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${id}`, {
          method: "DELETE",
          headers: { apikey: admin },
        });
        if (!r.ok) throw new Error("Local test cleanup failed");
      }
  });
  it("rejects signup without explicit current consent", async () => {
    expect(
      (
        await call("/auth/signup", "POST", {
          email,
          password,
          accepted: false,
          versions: versions(),
        })
      ).status,
    ).toBe(422);
  });
  it("signs up through the actual Auth service and requires email verification", async () => {
    signupStarted = Date.now();
    const r = await call("/auth/signup", "POST", {
      email,
      password,
      accepted: true,
      versions: versions(),
    });
    expect(r.status).toBe(200);
    expect((await r.json()).verification_required).toBe(true);
    expect(
      (await call("/auth/login", "POST", { email, password })).status,
    ).toBe(401);
  });
  it("verifies the link delivered to the local mail sink", async () => {
    const r = await call("/auth/verify", "POST", {
      token_hash: await emailHash(),
      type: "email",
    });
    expect(r.status).toBe(200);
    const session = await r.json();
    token = session.access_token;
    cookie = r.headers.get("Set-Cookie")!.split(";")[0];
    expect(r.headers.get("Set-Cookie")).toContain(
      "HttpOnly; Secure; SameSite=Lax",
    );
    userId = (await (await call("/me")).json()).user.id;
    expect(userId).toBeTruthy();
  });
  it("protects fitness routes until versions are recorded", async () => {
    expect(
      (await call("/plans", "GET", undefined, otherToken, "")).status,
    ).toBe(403);
    expect((await call("/plans", "GET", undefined, "", "")).status).toBe(401);
    expect(
      (
        await call(
          "/me/consents",
          "POST",
          { accepted: true, versions: versions() },
          otherToken,
          "",
        )
      ).status,
    ).toBe(200);
  });
  it("records signup versions and a server timestamp exactly once", async () => {
    const status = await (await call("/me/consents")).json();
    expect(status.accepted).toBe(true);
    expect(status.records).toHaveLength(2);
    for (const record of status.records) {
      expect(record.document_version).toBe("2026-10-v1");
      expect(Date.parse(record.accepted_at)).toBeGreaterThanOrEqual(
        signupStarted - 1000,
      );
    }
    await call("/me/consents", "POST", {
      accepted: true,
      versions: versions(),
    });
    expect((await (await call("/me/consents")).json()).records).toEqual(
      status.records,
    );
  });
  it("creates, reads and updates only the authenticated profile", async () => {
    const handle = `u_${randomUUID().slice(0, 8)}`;
    expect(
      (
        await call("/me/profile", "PUT", {
          handle,
          display_name: "Local Test",
          bio: "<script>untrusted text</script>",
        })
      ).status,
    ).toBe(200);
    expect((await (await call("/me/profile")).json()).display_name).toBe(
      "Local Test",
    );
    await call("/me/profile", "PUT", {
      handle,
      display_name: "Updated Test",
      bio: "",
    });
    expect((await (await call("/me/profile")).json()).display_name).toBe(
      "Updated Test",
    );
    expect((await call(`/me/profile?user_id=${otherId}`)).status).toBe(422);
    expect(
      (
        await call("/me/profile", "PUT", {
          handle,
          display_name: "Forged",
          user_id: otherId,
        })
      ).status,
    ).toBe(422);
    const direct = await fetch(
      `${env.SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userId}`,
      {
        headers: {
          apikey: env.SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${otherToken}`,
        },
      },
    );
    expect(await direct.json()).toEqual([]);
  });
  it("supports owned custom exercises and denies another user", async () => {
    const r = await call("/custom-exercises", "POST", {
      name: "Local Custom Exercise",
    });
    const id = (await r.json())[0].id;
    expect(
      (await call(`/custom-exercises/${id}`, "GET", undefined, otherToken, ""))
        .status,
    ).toBe(404);
    expect(
      (await (await call("/exercises")).json()).custom.some(
        (e: { id: string }) => e.id === id,
      ),
    ).toBe(true);
  });
  it("creates, reads and edits a plan with a day/exercise/targets", async () => {
    plan = (
      await (await call("/plans", "POST", { name: "Workflow Plan" })).json()
    )[0].id;
    expect(
      (await call(`/plans/${plan}`, "GET", undefined, otherToken, "")).status,
    ).toBe(404);
    await call(`/plans/${plan}`, "PATCH", { name: "Edited Plan" });
    expect((await (await call(`/plans/${plan}`)).json()).name).toBe(
      "Edited Plan",
    );
    day = (
      await (
        await call(`/plans/${plan}/days`, "POST", {
          name: "Push Day",
          position: 0,
        })
      ).json()
    )[0].id;
    ex = (
      await (
        await call(`/days/${day}/exercises`, "POST", {
          exercise_id: "10000000-0000-4000-8000-000000000001",
          position: 0,
        })
      ).json()
    )[0].id;
    expect(
      (
        await call(`/planned-exercises/${ex}/targets`, "POST", {
          position: 0,
          reps: 8,
          weight_kg: 80,
          rest_seconds: 90,
        })
      ).status,
    ).toBe(201);
  });
  it("copies generic templates transactionally and idempotently", async () => {
    const body = {
      template_id: "20000000-0000-4000-8000-000000000001",
      name: "Template copy",
      idempotency_key: randomUUID(),
    };
    const id = (await (await call("/plans/from-template", "POST", body)).json())
      .id;
    expect(
      (await (await call("/plans/from-template", "POST", body)).json()).id,
    ).toBe(id);
    expect(
      (await (await call(`/plans/${id}`)).json()).workout_days[0]
        .planned_exercises,
    ).toHaveLength(3);
  });
  it("starts a snapshot session and deduplicates retries", async () => {
    const body = { day_id: day, idempotency_key: randomUUID() };
    session = (await (await call("/sessions", "POST", body)).json()).id;
    expect((await (await call("/sessions", "POST", body)).json()).id).toBe(
      session,
    );
    ex = (await (await call(`/sessions/${session}`)).json())
      .session_exercises[0].id;
  });
  it("records sets once and rejects changed retry payloads", async () => {
    setId = randomUUID();
    const body = { id: setId, position: 0, reps: 8, weight_kg: 80 };
    const responses = await Promise.all([
      call(`/session-exercises/${ex}/sets`, "POST", body),
      call(`/session-exercises/${ex}/sets`, "POST", body),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    const [first, second] = await Promise.all(responses.map((r) => r.json()));
    expect(first.id).toBe(setId);
    expect(second.id).toBe(setId);
    expect(
      (
        await call(`/session-exercises/${ex}/sets`, "POST", {
          ...body,
          reps: 9,
        })
      ).status,
    ).toBe(409);
    expect(
      (await (await call(`/sessions/${session}`)).json()).session_exercises[0]
        .performed_sets,
    ).toHaveLength(1);
  });
  it("completes once, preserves retries and rejects new closed-session writes", async () => {
    expect(
      (await call(`/sessions/${session}/complete`, "POST", {})).status,
    ).toBe(201);
    expect(
      (await call(`/sessions/${session}/complete`, "POST", {})).status,
    ).toBe(201);
    expect((await call(`/sets/${setId}`, "PATCH", { reps: 99 })).status).toBe(
      409,
    );
    expect(
      (
        await call(`/session-exercises/${ex}/sets`, "POST", {
          id: randomUUID(),
          position: 1,
          reps: 8,
          weight_kg: 80,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call(`/session-exercises/${ex}/sets`, "POST", {
          id: setId,
          position: 0,
          reps: 8,
          weight_kg: 80,
        })
      ).status,
    ).toBe(201);
  });
  it("keeps completed history independent of edited/archived plans", async () => {
    await call(`/days/${day}`, "PATCH", { name: "Different Day" });
    await call(`/plans/${plan}`, "PATCH", {
      archived_at: new Date().toISOString(),
    });
    expect(
      (await (await call(`/plans/${plan}`)).json()).archived_at,
    ).toBeTruthy();
    expect(
      (await (await call(`/sessions/${session}`)).json()).name_snapshot,
    ).toBe("Push Day");
    expect((await (await call("/history?limit=1")).json()).items[0].id).toBe(
      session,
    );
    expect(
      (
        await call("/sessions", "POST", {
          day_id: day,
          idempotency_key: randomUUID(),
        })
      ).status,
    ).toBe(409);
  });
  it("paginates history without duplicates", async () => {
    const id = (
      await (
        await call("/sessions", "POST", {
          name: "Second workout",
          idempotency_key: randomUUID(),
        })
      ).json()
    ).id;
    await call(`/sessions/${id}/complete`, "POST", {});
    const first = await (await call("/history?limit=1")).json();
    expect(first.next_cursor).toBeTruthy();
    const second = await (
      await call(
        `/history?limit=1&cursor=${encodeURIComponent(first.next_cursor)}`,
      )
    ).json();
    expect(second.items[0].id).not.toBe(first.items[0].id);
    expect(second.next_cursor).toBeNull();
  });
  it("creates, updates and isolates body metrics", async () => {
    metric = (
      await (
        await call("/body-metrics", "POST", {
          weight_kg: 75,
          body_fat_percent: 20,
        })
      ).json()
    )[0].id;
    await call(`/body-metrics/${metric}`, "PATCH", {
      weight_kg: 76,
      body_fat_percent: null,
    });
    const updated = await (await call(`/body-metrics/${metric}`)).json();
    expect(updated.weight_kg).toBe(76);
    expect(updated.body_fat_percent).toBeNull();
    expect(
      (await call(`/body-metrics/${metric}`, "GET", undefined, otherToken, ""))
        .status,
    ).toBe(404);
    expect(
      (
        await call(
          `/body-metrics/${metric}`,
          "PATCH",
          { weight_kg: 90 },
          otherToken,
          "",
        )
      ).status,
    ).toBe(404);
    expect((await (await call("/body-metrics")).json()).items).toHaveLength(1);
  });
  it("derives progression and PRs from completed sets", async () => {
    expect((await (await call("/progress")).json()).items[0].heaviest_kg).toBe(
      80,
    );
    expect(
      (await (await call("/personal-records")).json()).items[0].most_reps,
    ).toBe(8);
  });
  it("restores a session from an HttpOnly refresh cookie", async () => {
    const r = await call("/auth/refresh", "POST", {}, "", cookie);
    expect(r.status).toBe(200);
    token = (await r.json()).access_token;
    cookie = r.headers.get("Set-Cookie")!.split(";")[0];
    expect((await call("/me")).status).toBe(200);
  });
  it("signs out and prevents refresh restoration", async () => {
    const r = await call("/auth/logout", "POST", {});
    expect(r.status).toBe(200);
    expect(r.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect((await call("/auth/refresh", "POST", {}, "", cookie)).status).toBe(
      401,
    );
    token = "";
    cookie = "";
    expect((await call("/plans")).status).toBe(401);
  });
  it("signs in again with managed password authentication", async () => {
    const r = await call("/auth/login", "POST", { email, password });
    expect(r.status).toBe(200);
    token = (await r.json()).access_token;
    cookie = r.headers.get("Set-Cookie")!.split(";")[0];
  });
  it("recovers through local email and updates the password", async () => {
    const r = await call("/auth/recover", "POST", { email });
    expect(r.status).toBe(200);
    const verify = await call("/auth/verify", "POST", {
      token_hash: await emailHash(),
      type: "recovery",
    });
    expect(verify.status).toBe(200);
    token = (await verify.json()).access_token;
    expect(
      (await call("/auth/password", "POST", { password: nextPassword })).status,
    ).toBe(200);
    expect(
      (await call("/auth/login", "POST", { email, password })).status,
    ).toBe(401);
    expect(
      (await call("/auth/login", "POST", { email, password: nextPassword }))
        .status,
    ).toBe(200);
  });
});
