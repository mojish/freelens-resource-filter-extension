import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
function fixture() {
  mkdirSync(".vitest", { recursive: true });
  const root = mkdtempSync(path.resolve(".vitest/updater-")); temporary.push(root);
  const userData = path.join(root, "profile's data");
  const destination = path.join(userData, "extensions/freelens-resource-filter-extension");
  mkdirSync(path.join(destination, "out"), { recursive: true });
  mkdirSync(path.join(root, "out/main"), { recursive: true });
  mkdirSync(path.join(root, "out/renderer"), { recursive: true });
  mkdirSync(path.join(root, "bin"));
  writeFileSync(path.join(destination, "out/old.js"), "old");
  writeFileSync(path.join(root, "out/main/index.js"), "main");
  writeFileSync(path.join(root, "out/renderer/index.mjs"), "renderer");
  writeFileSync(path.join(root, "package.json"), '{"version":"9.0.0"}');
  const script = readFileSync("update-installed.sh", "utf8");
  writeFileSync(path.join(root, "update-installed.sh"), script);
  // Only process discovery is mocked. Copy operations run against this fixture.
  writeFileSync(path.join(root, "bin/pgrep"), '#!/usr/bin/env node\nprocess.exit(new RegExp("^(?:"+process.argv[3]+")$", "i").test(process.env.FRF_TEST_PROCESS || "") ? 0 : 1);\n');
  chmodSync(path.join(root, "bin/pgrep"), 0o755);
  const run = (processName = "") => spawnSync("bash", [path.join(root, "update-installed.sh")], { env: { ...process.env, FREELENS_USER_DATA_DIR: userData, PATH: path.join(root, "bin") + path.delimiter + process.env.PATH, FRF_TEST_PROCESS: processName }, encoding: "utf8" });
  return { root, destination, run };
}

describe("local updater", () => {
  it.each(["freelens", "Freelens", "Freelens-2.0.0", "Freelens.AppImage"])("refuses writes while %s runs", (processName) => {
    const { destination, run } = fixture();
    const result = run(processName);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Freelens is running");
    expect(readFileSync(path.join(destination, "out/old.js"), "utf8")).toBe("old");
  });
  it("refuses an incomplete build before deleting installed files", () => {
    const { root, destination, run } = fixture();
    rmSync(path.join(root, "out/renderer/index.mjs"));
    expect(run().stderr).toContain("Run pnpm verify first");
    expect(existsSync(path.join(destination, "out/old.js"))).toBe(true);
  });
  it("updates only the fixture and handles apostrophes in the install path", () => {
    const { destination, run } = fixture();
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("version 9.0.0");
    expect(readFileSync(path.join(destination, "out/renderer/index.mjs"), "utf8")).toBe("renderer");
    expect(existsSync(path.join(destination, "out/old.js"))).toBe(false);
  });
  it("installs into the new v2 profile and preserves managed versions and preferences", () => {
    const { destination, run } = fixture();
    rmSync(path.join(destination, "out"), { recursive: true });
    mkdirSync(path.join(destination, "0.4.0-12345678"));
    writeFileSync(path.join(destination, "0.4.0-12345678/package.json"), "old managed version");
    const prefs = path.resolve(destination, "../../resource-filter-ui-prefs.json");
    writeFileSync(prefs, '{"favorites":["v1/Pod"]}');
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(path.join(destination, "out/renderer/index.mjs"), "utf8")).toBe("renderer");
    expect(readFileSync(path.join(destination, "0.4.0-12345678/package.json"), "utf8")).toBe("old managed version");
    expect(readFileSync(prefs, "utf8")).toBe('{"favorites":["v1/Pod"]}');
  });
});
