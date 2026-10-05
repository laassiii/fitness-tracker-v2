import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
const ref = "iewlobsbtwovcgpalgva",
  db = "https://" + ref + ".supabase.co",
  api = "https://fitness-tracker-api.fitness-fastapi-worker-spike.workers.dev";
if (process.env.PRODUCTION_VALIDATION_REF !== ref)
  throw new Error("Explicit production project opt-in required");
const phase = process.env.PERF_PHASE ?? "baseline";
if (
  ![
    "baseline",
    "optimized",
    "optimized-confirmation",
    "optimized-auth",
  ].includes(phase)
)
  throw new Error("Invalid phase");
const command = process.platform === "win32" ? "cmd.exe" : "npx";
const args =
  process.platform === "win32"
    ? [
        "/c",
        `npx supabase projects api-keys --project-ref ${ref} --reveal --output json`,
      ]
    : [
        "supabase",
        "projects",
        "api-keys",
        "--project-ref",
        ref,
        "--reveal",
        "--output",
        "json",
      ];
const keys = JSON.parse(
  execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
const admin = keys.find((k) => k.name === "service_role").api_key;
const pub = keys.find((k) => k.type === "publishable").api_key;
const users = [];
const results = [];
mkdirSync("performance-results", { recursive: true });
async function checked(response, expected = 200) {
  if (response.status !== expected)
    throw new Error("Validation request failed, status " + response.status);
  return response.status === 204 ? null : response.json();
}
async function authAdmin(path, method, body) {
  return fetch(db + "/auth/v1/admin/users" + path, {
    method,
    headers: {
      apikey: admin,
      Authorization: "Bearer " + admin,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function rest(u, table, method = "GET", body) {
  return checked(
    await fetch(db + "/rest/v1/" + table, {
      method,
      headers: {
        apikey: pub,
        Authorization: "Bearer " + u.token,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    method === "POST" ? 201 : 200,
  );
}
async function request(u, path, method = "GET", body, extra = {}) {
  const sample = "perf-" + randomUUID();
  const start = performance.now();
  const res = await fetch(api + "/api/v1" + path, {
    method,
    headers: {
      Authorization: "Bearer " + u.token,
      Origin: "https://fitness-tracker-prod.pages.dev",
      "Content-Type": "application/json",
      "X-Validation-Sample": sample,
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const bytes = await res.arrayBuffer();
  const row = {
    phase,
    sample,
    operation: path.split("?")[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ":id"),
    method,
    status: res.status,
    success: res.ok,
    client_wall_ms: Math.round(performance.now() - start),
    upstream_requests: Number(res.headers.get("X-Upstream-Requests")),
    response_bytes: bytes.byteLength,
  };
  results.push(row);
  writeFileSync(
    `performance-results/${phase}-clients.json`,
    JSON.stringify(results, null, 2),
  );
  return {
    status: res.status,
    body: JSON.parse(new TextDecoder().decode(bytes)),
    cookie: res.headers.get("Set-Cookie")?.split(";")[0],
  };
}
try {
  for (let n = 0; n < 2; n++) {
    const email = "perf-validation-" + randomUUID() + "@example.invalid",
      password = randomUUID() + randomUUID();
    const identity = await checked(
      await authAdmin("", "POST", { email, password, email_confirm: true }),
    );
    const u = { id: identity.id, token: "", email, password };
    users.push(u);
    writeFileSync(
      "performance-results/perf-fixture-ids.json",
      JSON.stringify(users.map((x) => x.id)),
    );
    const login = await request(u, "/auth/login", "POST", { email, password });
    if (login.status !== 200) throw new Error("Worker login failed");
    u.token = login.body.access_token;
    u.cookie = login.cookie;
    if (phase === "optimized-auth") continue;
    await checked(
      await fetch(db + "/rest/v1/rpc/accept_current_documents", {
        method: "POST",
        headers: {
          apikey: pub,
          Authorization: "Bearer " + u.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_terms: "2026-10-v1",
          p_privacy: "2026-10-v1",
        }),
      }),
      204,
    );
    await rest(u, "profiles", "POST", {
      user_id: u.id,
      handle: "p_" + randomUUID().slice(0, 8),
      display_name: "Disposable performance identity",
    });
    const plans = await rest(
      u,
      "workout_plans",
      "POST",
      Array.from({ length: 3 }, (_, i) => ({
        owner_id: u.id,
        name: "Generic validation plan " + i,
        description: "Disposable realistic data",
      })),
    );
    u.plan = plans[0].id;
    const days = await rest(
      u,
      "workout_days",
      "POST",
      plans.flatMap((p) =>
        Array.from({ length: 4 }, (_, i) => ({
          owner_id: u.id,
          plan_id: p.id,
          name: "Workout day " + i,
          position: i,
        })),
      ),
    );
    u.day = days[0].id;
    const catalog = await rest(u, "exercises?select=id&limit=6");
    const exercises = await rest(
      u,
      "planned_exercises",
      "POST",
      days.flatMap((d) =>
        catalog.map((e, i) => ({
          owner_id: u.id,
          day_id: d.id,
          exercise_id: e.id,
          position: i,
          notes: "Target technique",
        })),
      ),
    );
    await rest(
      u,
      "planned_set_targets",
      "POST",
      exercises.flatMap((e) =>
        Array.from({ length: 4 }, (_, i) => ({
          owner_id: u.id,
          planned_exercise_id: e.id,
          position: i,
          reps: 8,
          weight_kg: 60,
          rest_seconds: 90,
        })),
      ),
    );
    const session = await request(u, "/sessions", "POST", {
      day_id: u.day,
      idempotency_key: randomUUID(),
    });
    if (session.status !== 201) throw new Error("Session creation failed");
    u.session = session.body.id;
  }
  if (phase === "optimized-auth") {
    for (let i = 0; i < 30; i++) {
      const u = users[i % 2];
      if (i % 6 === 0) {
        const signed = await request(u, "/auth/login", "POST", {
          email: u.email,
          password: u.password,
        });
        if (signed.status !== 200) throw new Error("Repeated login failed");
        u.token = signed.body.access_token;
        u.cookie = signed.cookie;
      }
      const refresh = await request(
        u,
        "/auth/refresh",
        "POST",
        {},
        { Cookie: u.cookie },
      );
      if (refresh.status === 429) {
        console.log(
          "Supabase refresh rate limit encountered; stopped the stress burst.",
        );
        break;
      }
      if (refresh.status !== 200) throw new Error("Repeated refresh failed");
      u.token = refresh.body.access_token;
      u.cookie = refresh.cookie;
    }
  } else {
    console.log(
      "Realistic fixtures: two users; each 3 plans / 12 days / 72 exercises / 288 targets.",
    );
    const repeats = phase === "baseline" ? 12 : 30;
    for (let i = 0; i < repeats; i++) {
      const u = users[i % 2];
      const r = await request(u, "/plans/" + u.plan);
      if (
        r.status !== 200 ||
        r.body.workout_days.length !== 4 ||
        r.body.workout_days.some(
          (d) =>
            d.planned_exercises.length !== 6 ||
            d.planned_exercises.some((e) => e.planned_set_targets.length !== 4),
        )
      )
        throw new Error("Plan read or nested data integrity failed");
    }
    for (let i = 0; i < (phase === "baseline" ? 6 : 12); i++) {
      const u = users[i % 2];
      if (phase !== "baseline" && i < 8) {
        const signed = await request(u, "/auth/login", "POST", {
          email: u.email,
          password: u.password,
        });
        if (signed.status !== 200)
          throw new Error("Repeated Worker login failed");
        u.token = signed.body.access_token;
        u.cookie = signed.cookie;
      }
      for (const path of [
        "/plans",
        "/me/profile",
        "/exercises",
        "/sessions/" + u.session,
      ]) {
        if ((await request(u, path)).status !== 200)
          throw new Error("Representative read failed");
      }
      const refresh = await request(
        u,
        "/auth/refresh",
        "POST",
        {},
        { Cookie: u.cookie },
      );
      if (refresh.status !== 200) throw new Error("Worker refresh failed");
      u.token = refresh.body.access_token;
      u.cookie = refresh.cookie;
    }
    for (const [u, v] of [
      [users[0], users[1]],
      [users[1], users[0]],
    ]) {
      if ((await request(u, "/plans/" + v.plan)).status !== 404)
        throw new Error("Cross-owner read permitted");
      if (
        (await request(u, "/plans/" + u.plan + "?owner_id=" + v.id)).status !==
        422
      )
        throw new Error("Query tampering permitted");
      if (
        (
          await request(u, "/plans/" + u.plan, "PATCH", {
            owner_id: v.id,
            name: "Forged",
          })
        ).status !== 422
      )
        throw new Error("Body tampering permitted");
      if (
        (await request({ ...u, token: "invalid" }, "/plans/" + u.plan))
          .status !== 401
      )
        throw new Error("JWT validation missing");
      if ((await rest(u, "workout_plans?id=eq." + v.plan)).length !== 0)
        throw new Error("Direct production RLS failed");
    }
  }
  console.log(
    "Production representative requests and bidirectional security passed. Samples:",
    results.length,
  );
} finally {
  for (const u of users) {
    await checked(await authAdmin("/" + u.id, "DELETE"));
    const gone = await authAdmin("/" + u.id, "GET");
    if (gone.status !== 404) throw new Error("Auth cleanup failed");
    for (const [table, col] of [
      ["workout_plans", "owner_id"],
      ["workout_days", "owner_id"],
      ["planned_exercises", "owner_id"],
      ["planned_set_targets", "owner_id"],
      ["workout_sessions", "owner_id"],
      ["profiles", "user_id"],
      ["consent_acceptances", "user_id"],
    ]) {
      const response = await fetch(
        db + "/rest/v1/" + table + "?" + col + "=eq." + u.id,
        { headers: { apikey: admin, Authorization: "Bearer " + admin } },
      );
      if ((await checked(response)).length)
        throw new Error("Record cleanup failed: " + table);
    }
  }
  console.log(
    "Disposable production users and all fixture records removed and verified absent.",
  );
}
