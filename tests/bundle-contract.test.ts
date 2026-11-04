import { existsSync, readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const rendererRoot = path.dirname(manifest.renderer);
function modules(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? modules(file) : file.endsWith(".mjs") ? [file] : [];
  });
}

describe.skipIf(!existsSync(manifest.renderer))("Freelens 2 bundle contract", () => {
  it("loads and activates main with only the main-process host globals", () => {
    const result = spawnSync(process.execPath, ["-e", `
      class Store {
        static getInstanceOrCreate() { return new this(); }
        loadExtension() {}
      }
      globalThis.FreelensExtensionApi = {
        Common: { Store: { ExtensionStore: Store } },
        Main: { LensExtension: class {} },
        Mobx: require("mobx"),
      };
      const Extension = require(${JSON.stringify(path.resolve(manifest.main))}).default;
      new Extension().onActivate().catch((error) => { console.error(error); process.exitCode = 1; });
    `], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  it("ships browser modules with relative imports and no bundled host libraries", () => {
    const files = modules(rendererRoot);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/\brequire\s*\(|\bmodule\.exports\b|\bglobal\.|\bprocess\./);
      expect(file).not.toMatch(/node_modules\/(?:\.pnpm\/)?(?:@freelensapp|react|react-dom|mobx|mobx-react)[@/]/);
      for (const [, specifier] of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
        expect(specifier, file).toMatch(/^\.\.?\//);
        expect(existsSync(path.resolve(path.dirname(file), specifier)), `${file}: ${specifier}`).toBe(true);
      }
    }
  });
});
