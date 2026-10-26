import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
function fixture() {
  mkdirSync(".vitest", { recursive: true });
  const root = mkdtempSync(path.resolve(".vitest/updater-")); temporary.push(root);
  const destination = path.join(root, "extension's copy");
  mkdirSync(path.join(destination, "out"), { recursive: true });
  mkdirSync(path.join(root, "out/main"), { recursive: true });
  mkdirSync(path.join(root, "out/renderer"), { recursive: true });
  mkdirSync(path.join(root, "bin"));
  writeFileSync(path.join(destination, "out/old.js"), "old");
  writeFileSync(path.join(root, "out/main/index.js"), "main");
  writeFileSync(path.join(root, "out/renderer/index.js"), "renderer");
  writeFileSync(path.join(root, "package.json"), '{"version":"9.0.0"}');
  const script = readFileSync("update-installed.sh", "utf8").replace('EXT_DIR="${HOME}/.freelens/extensions/freelens-resource-filter-extension"', `EXT_DIR=${JSON.stringify(destination)}`);
  writeFileSync(path.join(root, "update-installed.sh"), script);
  // Only process discovery is mocked. Copy operations run against this fixture.
  writeFileSync(path.join(root, "bin/pgrep"), '#!/usr/bin/env node\nprocess.exit(new RegExp("^(?:"+process.argv[3]+")$", "i").test(process.env.FRF_TEST_PROCESS || "") ? 0 : 1);\n');
  chmodSync(path.join(root, "bin/pgrep"), 0o755);
  const run = (processName = "") => spawnSync("bash", [path.join(root, "update-installed.sh")], { env: { ...process.env, PATH: path.join(root, "bin") + path.delimiter + process.env.PATH, FRF_TEST_PROCESS: processName }, encoding: "utf8" });
  return { root, destination, run };
}

describe("local updater", () => {
  it.each(["freelens", "Freelens", "Freelens-1.10.3", "Freelens.AppImage"])("refuses writes while %s runs", (processName) => {
    const { destination, run } = fixture();
    const result = run(processName);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Freelens is running");
    expect(readFileSync(path.join(destination, "out/old.js"), "utf8")).toBe("old");
  });
  it("refuses an incomplete build before deleting installed files", () => {
    const { root, destination, run } = fixture();
    rmSync(path.join(root, "out/renderer/index.js"));
    expect(run().stderr).toContain("Run pnpm verify first");
    expect(existsSync(path.join(destination, "out/old.js"))).toBe(true);
  });
  it("updates only the fixture and handles apostrophes in the install path", () => {
    const { destination, run } = fixture();
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("version 9.0.0");
    expect(readFileSync(path.join(destination, "out/renderer/index.js"), "utf8")).toBe("renderer");
    expect(existsSync(path.join(destination, "out/old.js"))).toBe(false);
  });
});
