import { readdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
// Inspect every emitted text chunk, including lazy chunks and source maps if enabled.
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    assert(!/mockServiceWorker/i.test(entry.name), `MSW worker emitted: ${path}`);
    if (entry.isDirectory()) await scan(path);
    else if (/\.(js|mjs|html|map)$/.test(entry.name)) {
      const text = await readFile(path, "utf8");
      for (const marker of [
        "tyt-mock-db",
        "There aren't enough pieces left for that quantity.",
        "tyt-mock-state",
        "MockServiceWorker",
        "mockServiceWorker.js",
        "TEST MODE · SIMULATED PAYMENT",
        "Complete your test order.",
        "Pay (test)",
        "dev-only-msw-worker",
        "tyt-admin-test-auth",
        "TEST ADMIN SESSION",
      ])
        assert(!text.includes(marker), `Development code (${marker}) emitted in ${path}`);
    }
  }
}
await scan("dist");
// Only non-production Netlify deploys (CONTEXT is set by Netlify) may tell search engines to stay away.
const headers = await readFile("dist/_headers", "utf8").catch(() => "");
if (!process.env.CONTEXT || process.env.CONTEXT === "production") assert(!/noindex/i.test(headers), "A production build would be hidden from search");
else assert(/X-Robots-Tag: noindex/.test(headers), `A ${process.env.CONTEXT} build must be hidden from search`);
const netlifyConfig = await readFile("../netlify.toml", "utf8");
for (const forbiddenSource of ["https://*.clerk.accounts.dev", "https://*.clerk.com", "https://api.clerk.com"])
  assert(!netlifyConfig.includes(forbiddenSource), `Broad Clerk CSP source remains: ${forbiddenSource}`);
for (const requiredSource of [
  "https://clerk.tanoytasi.shimizu-technology.com",
  "https://img.clerk.com",
  "https://challenges.cloudflare.com",
  "https://*.protect.clerk.com:*",
])
  assert(netlifyConfig.includes(requiredSource), `Required Clerk CSP source is missing: ${requiredSource}`);
assert(!/script-src[^;]*'unsafe-(?:inline|eval)'/.test(netlifyConfig), "Production script-src is unsafe");
const mediaHost = "https://tano-y-tasi-media.s3.ap-southeast-1.amazonaws.com";
for (const directive of ["img-src", "connect-src"])
  assert(new RegExp(`${directive}[^;]*${mediaHost.replaceAll(".", "\\.")}`).test(netlifyConfig), `${directive} must allow ${mediaHost}`);
for (const flag of ["VITE_API_MOCKS", "VITE_SIMULATED_PAYMENTS", "VITE_ADMIN_TEST_AUTH"]) {
  // Exercise the Vite build guard itself without overwriting the verified output.
  const result = spawnSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      VITE_API_MOCKS: "false",
      VITE_SIMULATED_PAYMENTS: "false",
      VITE_ADMIN_TEST_AUTH: "false",
      [flag]: "true",
    },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0, `${flag}=true unexpectedly built`);
  assert(result.stderr.includes(`${flag} is development-only`), result.stderr || String(result.error));
}
console.log(
  "Production output contains no development-only admin/payment code, unsafe flags are rejected, and Clerk CSP sources are scoped."
);
