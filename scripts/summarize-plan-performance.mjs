import { readFileSync, writeFileSync } from "node:fs";
const phases = [
  "baseline",
  "optimized",
  "optimized-confirmation",
  "optimized-auth",
];
const joined = [];
const raw = [];
for (const phase of phases) {
  try {
    const c = JSON.parse(
      readFileSync(`performance-results/${phase}-clients.json`, "utf8"),
    );
    const r = JSON.parse(
      readFileSync(`performance-results/${phase}-runtime.json`, "utf8"),
    );
    raw.push(...r);
    for (const client of c) {
      const event = r.find((x) => x.sample === client.sample);
      joined.push({
        ...client,
        cpu_ms: event?.cpu_ms ?? null,
        worker_wall_ms: event?.worker_wall_ms ?? null,
        version: event?.version ?? null,
      });
    }
  } catch {}
}
function stats(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const n = sorted.length;
  return n
    ? {
        count: n,
        min: sorted[0],
        median:
          n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
        mean: Number((sorted.reduce((a, b) => a + b, 0) / n).toFixed(3)),
        max: sorted.at(-1),
      }
    : { count: 0 };
}
const groups = {};
for (const row of joined) {
  const key =
    (row.phase === "baseline" ? "baseline" : "after") +
    " " +
    row.method +
    " " +
    row.operation +
    " " +
    (row.success ? "success" : "rejected");
  (groups[key] ??= []).push(row);
}
const summary = Object.fromEntries(
  Object.entries(groups).map(([key, rows]) => [
    key,
    {
      sent: rows.length,
      cpu_ms: stats(rows.map((r) => r.cpu_ms)),
      worker_wall_ms: stats(rows.map((r) => r.worker_wall_ms)),
      client_wall_ms: stats(rows.map((r) => r.client_wall_ms)),
      upstream_requests: [...new Set(rows.map((r) => r.upstream_requests))],
      response_bytes: stats(rows.map((r) => r.response_bytes)),
      unmeasured: rows.filter((r) => r.cpu_ms === null).length,
    },
  ]),
);
const plan = summary["after GET /plans/:id success"];
const required = [
  "GET /plans",
  "GET /me/profile",
  "GET /exercises",
  "GET /sessions/:id",
  "POST /auth/login",
  "POST /auth/refresh",
];
const enough =
  plan?.cpu_ms.count >= 30 &&
  required.every((k) => summary["after " + k + " success"]?.cpu_ms.count >= 3);
const after = joined.filter((r) => r.phase !== "baseline" && r.cpu_ms !== null);
const versions = [...new Set(after.map((r) => r.version))];
const budget =
  plan?.upstream_requests.every((n) => n === 4) &&
  plan?.response_bytes.max <= 20000;
const comfortable =
  budget && plan?.cpu_ms.max <= 6 && after.every((r) => r.cpu_ms < 10);
const result = {
  decision:
    !enough || versions.length !== 1 ? "OPEN" : comfortable ? "PASS" : "FAIL",
  versions,
  rule: "Single after-version; at least 30 matched plan reads and 3 matched reads for every representative/auth path; plan max <=6 ms; all measured requests <10 ms; realistic fixture plan uses four upstream calls and <=20 KB response.",
  summary,
};
writeFileSync(
  "performance-results/summary.json",
  JSON.stringify(result, null, 2),
);
writeFileSync(
  "performance-results/correlated.json",
  JSON.stringify(joined, null, 2),
);
console.log(JSON.stringify(result, null, 2));
if (result.decision !== "PASS") process.exitCode = 1;
