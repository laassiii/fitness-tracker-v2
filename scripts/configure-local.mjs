import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
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
const config = JSON.parse(
  execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
if (config.API_URL !== "http://127.0.0.1:55321")
  throw new Error("Refusing a non-local database for development");
writeFileSync(
  "apps/api/.dev.vars",
  `SUPABASE_URL=${JSON.stringify(config.API_URL)}\nSUPABASE_PUBLISHABLE_KEY=${JSON.stringify(config.PUBLISHABLE_KEY)}\nAPP_ORIGIN="http://localhost:5173"\n`,
  { mode: 0o600 },
);
console.log("Configured the isolated local API with its publishable key.");
