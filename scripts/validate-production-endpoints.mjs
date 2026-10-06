import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
const ref = "iewlobsbtwovcgpalgva";
if (process.env.PRODUCTION_VALIDATION_REF !== ref)
  throw Error("Explicit production opt-in required");
const db = `https://${ref}.supabase.co`,
  base = "https://fitness-tracker-prod.pages.dev";
// Administrative credential is restricted to disposable identity setup/cleanup.
const keys = JSON.parse(
  execFileSync(
    "cmd.exe",
    [
      "/c",
      `npx supabase projects api-keys --project-ref ${ref} --reveal --output json`,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ),
);
const secret = keys.find((k) => k.name === "service_role").api_key;
const identities = [],
  rows = [];
async function admin(path, method, body) {
  const r = await fetch(db + "/auth/v1/admin/users" + path, {
    method,
    headers: {
      apikey: secret,
      Authorization: "Bearer " + secret,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw Error("Administrative fixture operation failed");
  return r.status === 204 ? null : r.json();
}
async function request(u, path, method = "GET", body, expected = 200) {
  const sample = "perf-" + randomUUID(),
    start = performance.now();
  const r = await fetch(base + "/api/v1" + path, {
    method,
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      "X-Validation-Sample": sample,
      ...(u.token ? { Authorization: "Bearer " + u.token } : {}),
      ...(u.cookie ? { Cookie: u.cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  const cookie = r.headers.get("set-cookie");
  if (cookie) u.cookie = cookie.split(";")[0];
  rows.push({
    sample,
    method,
    route: path.replace(
      /[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi,
      "REDACTED",
    ),
    status: r.status,
    client_wall_ms: Math.round(performance.now() - start),
    upstream_requests: Number(r.headers.get("x-upstream-requests")),
  });
  if (r.status !== expected)
    throw Error(
      "Deployed endpoint rejected " +
        method +
        " " +
        path.split("/")[1] +
        " with " +
        r.status,
    );
  return data;
}
try {
  for (let i = 0; i < 2; i++) {
    const email = "endpoint-validation-" + randomUUID() + "@example.invalid",
      password = randomUUID() + randomUUID();
    const created = await admin("", "POST", {
      email,
      password,
      email_confirm: true,
    });
    const u = { id: created.id };
    identities.push(u);
    const login = await request(u, "/auth/login", "POST", { email, password });
    u.token = login.access_token;
    await request(u, "/me/consents", "POST", {
      accepted: true,
      versions: { terms: "2026-10-v1", privacy: "2026-10-v1" },
    });
  }
  const [u, v] = identities;
  if (process.env.ENDPOINT_ONLY === "body-metrics") {
    for (let i = 0; i < 6; i++)
      await request(
        u,
        "/body-metrics",
        "POST",
        { weight_kg: 75, notes: "x".repeat(1000) },
        201,
      );
    await request(u, "/body-metrics");
  } else {
    for (let i = 0; i < 6; i++) {
      await request(u, "/me/profile", "PUT", {
        handle: "cpu_" + u.id.slice(0, 8),
        display_name: "Endpoint validation",
        bio: "x".repeat(500),
      });
      await request(u, "/me/profile");
      await request(u, "/exercises");
    }
    const exercise = (await request(u, "/exercises")).system[0];
    const metric = (
      await request(
        u,
        "/body-metrics",
        "POST",
        { weight_kg: 75, notes: "x".repeat(1000) },
        201,
      )
    )[0];
    for (let i = 0; i < 10; i++)
      await request(u, "/body-metrics/" + metric.id, "PATCH", {
        weight_kg: 75 + i / 10,
        notes: "x".repeat(1000),
      });
    await request(
      v,
      "/body-metrics/" + metric.id,
      "PATCH",
      { weight_kg: 90 },
      404,
    );
    await request(
      u,
      "/body-metrics/" + metric.id,
      "PATCH",
      { owner_id: v.id, weight_kg: 90 },
      422,
    );
    await request(u, "/body-metrics");
    const plan = (
      await request(u, "/plans", "POST", { name: "Endpoint plan" }, 201)
    )[0];
    await request(u, "/plans/" + plan.id, "PATCH", {
      name: "Edited endpoint plan",
    });
    const day = (
      await request(
        u,
        "/plans/" + plan.id + "/days",
        "POST",
        { name: "Endpoint day", position: 0 },
        201,
      )
    )[0];
    await request(
      u,
      "/days/" + day.id + "/exercises",
      "POST",
      { exercise_id: exercise.id, position: 0 },
      201,
    );
    const session = await request(
      u,
      "/sessions",
      "POST",
      { day_id: day.id, idempotency_key: randomUUID() },
      201,
    );
    const detail = await request(u, "/sessions/" + session.id);
    const se = detail.session_exercises[0];
    for (let i = 0; i < 10; i++)
      await request(
        u,
        "/session-exercises/" + se.id + "/sets",
        "POST",
        {
          id: randomUUID(),
          position: i,
          reps: 8,
          weight_kg: 80,
          notes: "x".repeat(1000),
        },
        201,
      );
    await request(u, "/sessions/" + session.id + "/complete", "POST", {}, 201);
    for (let i = 0; i < 6; i++) {
      await request(u, "/history");
      await request(u, "/progress");
      await request(u, "/sessions/" + session.id);
      await request(u, "/body-metrics");
    }
    for (let i = 0; i < 3; i++) {
      const session = await request(u, "/auth/refresh", "POST", {});
      u.token = session.access_token;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  console.log(
    "Representative deployed endpoint requests passed; secrets suppressed.",
  );
} finally {
  for (const u of identities) await admin("/" + u.id, "DELETE");
  mkdirSync("performance-results", { recursive: true });
  writeFileSync(
    "performance-results/" +
      (process.env.ENDPOINT_ONLY === "body-metrics"
        ? "remaining-body-metric-requests.json"
        : "remaining-endpoint-requests.json"),
    JSON.stringify(
      { rows, cleanup: "disposable Auth identities deleted" },
      null,
      2,
    ),
  );
  console.log("Disposable endpoint identities removed.");
}
