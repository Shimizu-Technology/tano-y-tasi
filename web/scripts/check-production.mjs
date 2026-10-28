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
        "This drop is limited to",
        "There aren't enough pieces left for that quantity.",
        "tyt-mock-state",
        "MockServiceWorker",
        "mockServiceWorker.js",
        "TEST MODE · SIMULATED PAYMENT",
        "Complete your test order.",
        "Pay (test)",
        "dev-only-msw-worker",
      ])
        assert(!text.includes(marker), `Development code (${marker}) emitted in ${path}`);
    }
  }
}
await scan("dist");
for (const flag of ["VITE_API_MOCKS", "VITE_SIMULATED_PAYMENTS"]) {
  // Exercise the Vite build guard itself without overwriting the verified output.
  const result = spawnSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      VITE_API_MOCKS: "false",
      VITE_SIMULATED_PAYMENTS: "false",
      [flag]: "true",
    },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0, `${flag}=true unexpectedly built`);
  assert(result.stderr.includes(`${flag} is development-only`), result.stderr || String(result.error));
}
console.log(
  "Production output contains no MSW worker, mock handlers, or simulated payment page; both unsafe flags are rejected."
);
