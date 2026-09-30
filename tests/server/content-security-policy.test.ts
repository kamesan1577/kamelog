import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "../../next.config.ts";

test("CSP permits external HTTPS preview images while restricting other resources", async () => {
  const rules = await nextConfig.headers!();
  const policy = rules
    .find((rule) => rule.source === "/:path*")
    ?.headers.find((header) => header.key === "Content-Security-Policy")?.value;
  assert.ok(policy);
  const directives = new Map(
    policy.split(";").map((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/);
      return [name, sources];
    }),
  );
  assert.deepEqual(directives.get("img-src"), ["'self'", "data:", "https:"]);
  assert.deepEqual(directives.get("script-src"), ["'self'", "'unsafe-inline'"]);
  assert.deepEqual(directives.get("connect-src"), ["'self'"]);
  assert.deepEqual(directives.get("object-src"), ["'none'"]);
});
