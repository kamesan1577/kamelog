import { execFileSync } from "node:child_process";
import { isNewJavaScriptSource } from "./typescript-policy.ts";

function gitFiles(args: string[]): string[] {
  const output = execFileSync("git", [...args, "-z"], { encoding: "utf8" });
  return output.split("\0").filter(Boolean);
}

// CI supplies the full PR or push range. Local checks also inspect staged
// and untracked files so new JavaScript cannot bypass the gate before commit.
const candidate = process.env.KAMELOG_TS_POLICY_BASE?.trim() || "HEAD^";
const base = /^0{40}$/.test(candidate) ? "HEAD^" : candidate;
const diffArgs = ["diff", "--no-renames", "--diff-filter=A", "--name-only"];
const committed = gitFiles([...diffArgs, base, "HEAD"]);
const staged = gitFiles([...diffArgs, "--cached", "HEAD"]);
const untracked = gitFiles(["ls-files", "--others", "--exclude-standard"]);
const files = new Set([...committed, ...staged, ...untracked]);
const violations = [...files].filter(isNewJavaScriptSource).sort();

if (violations.length) {
  console.error("New first-party JavaScript files are forbidden.");
  console.error("Use .ts or .tsx instead:\n" + violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    "TypeScript-only gate passed (no new first-party JavaScript files)",
  );
}
