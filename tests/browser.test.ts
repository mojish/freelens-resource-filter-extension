/** Runs the built page in an isolated Chromium profile with local host/store mocks. */
import { afterAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const chrome = ["google-chrome", "chromium", "chromium-browser"].find((command) => spawnSync(command, ["--version"], { timeout: 3000 }).status === 0);
const profiles: string[] = [];
afterAll(() => profiles.forEach((profile) => rmSync(profile, { recursive: true, force: true })));

describe.skipIf(!chrome || !existsSync("out/renderer/index.js"))("browser regressions", () => {
  it("refreshes watches/time, applies all filters, and remounts the correct resource store", async () => {
    // esbuild is already provided by the electron-vite build dependency.
    const { build } = createRequire(require.resolve("electron-vite"))("esbuild");
    const bundle = await build({ entryPoints: ["tests/browser-fixture.jsx"], bundle: true, write: false, platform: "browser", format: "esm", define: { "process.env.NODE_ENV": '"development"' } });
    const server = createServer((req, res) => {
      res.setHeader("Content-Type", req.url === "/fixture.js" ? "application/javascript" : "text/html");
      res.end(req.url === "/fixture.js" ? bundle.outputFiles[0].text : '<div id="app"></div><pre id="result">pending</pre><script type="module" src="/fixture.js"></script>');
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    mkdirSync(".vitest", { recursive: true });
    const profile = mkdtempSync(path.resolve(".vitest/browser-")); profiles.push(profile);
    try {
      const child = spawn(chrome!, ["--headless=new", "--no-sandbox", "--disable-gpu", "--no-proxy-server", "--disable-dev-shm-usage", `--user-data-dir=${profile}`, "--dump-dom", "--virtual-time-budget=6000", `http://127.0.0.1:${port}`]);
      let output = "", stderr = "";
      child.stdout.on("data", (data) => { output += data; }); child.stderr.on("data", (data) => { stderr += data; });
      const timer = setTimeout(() => child.kill("SIGKILL"), 15000);
      try { await new Promise<void>((resolve, reject) => { child.on("error", reject); child.on("exit", () => resolve()); }); } finally { clearTimeout(timer); }
      const json = output.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1];
      expect(json, stderr).toBeTruthy();
      const result = JSON.parse(json!.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
      expect(result.error).toBeUndefined();
      expect(result.watch).toEqual({ badge: "0 / 1 items", table: "0" });
      expect(result.newField).toBe(true);
      for (const key of ["sampled", "quoted"]) expect(result[key]).toEqual({ badge: "1 / 201 items", table: "1" });
      expect(result.invalid).toEqual({ badge: "1 / 201 items", table: "1", error: "Invalid query clause: broken" });
      expect(result.cleared).toEqual({ badge: "201 / 201 items", table: "201" });
      expect(result.ageBefore).toEqual({ badge: "1 / 1 items", table: "1" });
      expect(result.ageAfter).toEqual({ badge: "0 / 1 items", table: "0", previewChanged: true });
      expect(result.drawerBefore).toBe(true);
      expect(result.switchKind).toEqual({ mounts: ["widget", "gadget"], unmounts: ["widget"], drawerAfter: false, session: { outputFields: ["spec"], columns: [], dialect: "yq" } });
      const ids = result.headers.map((header: { id: string }) => header.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(result.headers.map((header: { title: string }) => header.title)).toContain("spec.state");
      expect(result.row).toContain('{"state":"ready"}');
    } finally { server.close(); }
  }, 20000);
});
