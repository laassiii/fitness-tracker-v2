import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
mkdirSync("performance-results", { recursive: true });
const rows = [];
let depth = 0,
  inString = false,
  escape = false,
  json = "";
const child = spawn(
  "cmd.exe",
  ["/c", "npx wrangler tail fitness-tracker-api --format json"],
  { cwd: "apps/api", stdio: ["ignore", "pipe", "pipe"] },
);
child.stdout.on("data", (chunk) => {
  for (const c of chunk.toString()) {
    if (!depth) {
      if (c !== "{") continue;
      depth = 1;
      json = "{";
      continue;
    }
    json += c;
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    if (c === "}" && --depth === 0) {
      try {
        const e = JSON.parse(json);
        const req = e.event?.request;
        if (req?.url) {
          const url = new URL(req.url);
          const r = {
            sample: /^perf-[a-f0-9-]{36}$/.test(
              req.headers?.["x-validation-sample"] ?? "",
            )
              ? req.headers["x-validation-sample"]
              : null,
            timestamp: e.eventTimestamp,
            route: url.pathname,
            method: req.method,
            cpu_ms: e.cpuTime ?? null,
            worker_wall_ms: e.wallTime ?? null,
            outcome: e.outcome,
            version: e.scriptVersion?.id ?? null,
          };
          rows.push(r);
          writeFileSync(
            process.env.METRICS_FILE ??
              "performance-results/production-runtime-metrics.json",
            JSON.stringify(rows, null, 2),
          );
          console.log(JSON.stringify(r));
        }
      } catch {}
      json = "";
    }
  }
});
child.stderr.on("data", () => {});
process.on("SIGINT", () => {
  child.kill();
  process.exit();
});
setTimeout(() => {
  child.kill();
  process.exit();
}, 600000);
