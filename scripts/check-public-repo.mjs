import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
const tracked = execFileSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
export const forbiddenPath =
  /(^|\/)(\.runtime|backups?|exports?|test-results|playwright-report)\/|\.(sqlite|db|pem|key|log|zip|tar|tgz)$/;
export const secretPattern =
  /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|sk-proj-[A-Za-z0-9_-]{20,}/;
const markers = (
  process.env.KAMELOG_PRIVATE_MARKERS ||
  (existsSync(".private-markers")
    ? readFileSync(".private-markers", "utf8")
    : "")
)
  .split(/\r?\n/)
  .filter(Boolean);
let failed = false;
export const containsSensitiveText = (text, privateMarkers = markers) =>
  secretPattern.test(text) ||
  privateMarkers.some((marker) => text.includes(marker));
export const isAllowedEmail = (email) =>
  email === "kamesan1577@gmail.com" ||
  email === "matsugaura_ken@andfactory.co.jp" ||
  email.endsWith("@users.noreply.github.com");
for (const file of new Set(tracked)) {
  if (!existsSync(file)) continue;
  if (
    forbiddenPath.test(file) ||
    (/(^|\/)\.env/.test(file) && file !== ".env.example")
  ) {
    failed = true;
    continue;
  }
  const data = readFileSync(file);
  if (data.includes(0)) continue;
  const text = data.toString();
  if (containsSensitiveText(text)) failed = true;
}
const emails = execFileSync("git", ["log", "HEAD", "--format=%ae%n%ce"], {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);
if (emails.some((email) => !isAllowedEmail(email))) failed = true;
if (failed) {
  console.error(
    "Public repository gate failed. Inspect privately; matched values are intentionally not printed.",
  );
  process.exit(1);
}
console.log(
  "Public repository gate passed (tracked files, pending files, commit identities)",
);
