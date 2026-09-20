import { execFileSync } from "node:child_process";
import { isNewJavaScriptSource } from "./typescript-policy.ts";

function gitFiles(args: string[]): string[] {
  return execFileSync("git", [...args, "-z"], {
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
}

// CI supplies the PR base or pre-push revision, covering every commit in a PR
// or push. HEAD^ is the local fallback; index and untracked files are checked
// separately so the gate also catches work that has not been committed yet.
const configuredBase = process.env.KAMELOG_TS_POLICY_BASE?.trim();
const base = configuredBase && !/^0{40}$/.test(configuredBase) ? configuredBase : "HEAD^";
const added = new Set([
  ...gitFiles([
    "diff",
    "--no-renames",
    "--diff-filter=A",
    "--name-only",
    base,
    "HEAD",
  ]),
  ...gitFiles([
    "diff",
    "--cached",
    "--no-renames",
    "--diff-filter=A",
    "--name-only",
    "HEAD",
  ]),
  ...gitFiles(["ls-files", "--others", "--exclude-standard"]),
]);
const violations = [...added].filter(isNewJavaScriptSource).sort();
if (violations.length) {
  console.error(
    `New first-party JavaScript files are forbidden; use .ts or .tsx instead:\n${violations.join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log("TypeScript-only gate passed (no new first-party JavaScript files)");
}
