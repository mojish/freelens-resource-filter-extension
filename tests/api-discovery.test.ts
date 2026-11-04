import { autorun, observable, runInAction } from "mobx";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Renderer } from "@freelensapp/extensions";
import { discoveredResources, getStoreForResource } from "../src/renderer/discovery/api-discovery";

const host = vi.hoisted(() => ({ apiManager: undefined as unknown }));
vi.mock("@freelensapp/extensions", () => ({ Renderer: { K8sApi: host } }));

type Api = Renderer.K8sApi.KubeApi;
const api = (kind: string, apiVersionWithGroup = "example.com/v1") => ({
  kind, apiVersionWithGroup, apiBase: `/apis/${apiVersionWithGroup}/${kind.toLowerCase()}s`,
  apiResource: `${kind.toLowerCase()}s`, isNamespaced: true,
}) as Api;

beforeEach(() => { host.apiManager = undefined; });

describe("Freelens 2 resource discovery", () => {
  it("is empty before the host registry is available", () => {
    expect(discoveredResources.get()).toEqual([]);
  });

  it("visits the public lookup, deduplicates aliases, and resolves stores only on demand", () => {
    const widget = api("Widget"), gadget = api("Gadget");
    const store = { items: [] };
    const getStore = vi.fn(() => store);
    // No private `apis` property: discovery must use the v2 public API.
    host.apiManager = { getApi: (predicate: (value: Api) => boolean) => [widget, gadget, widget].find(predicate), getStore };
    const resources = discoveredResources.get();
    expect(resources.map((resource) => resource.id)).toEqual(["example.com/v1/Gadget", "example.com/v1/Widget"]);
    expect(getStore).not.toHaveBeenCalled();
    expect(getStoreForResource(resources[1])).toBe(store);
    expect(getStore).toHaveBeenCalledWith(widget.apiBase);
  });

  it("reacts to CRD registration, additional served versions, and removal", () => {
    const registry = observable.map<string, Api>();
    host.apiManager = { getApi: (predicate: (value: Api) => boolean) => [...registry.values()].find(predicate) };
    const snapshots: string[][] = [];
    const dispose = autorun(() => snapshots.push(discoveredResources.get().map((resource) => resource.id)));
    try {
      runInAction(() => registry.set("one", api("Widget")));
      runInAction(() => registry.set("two", api("Widget", "example.com/v2")));
      runInAction(() => registry.delete("one"));
      expect(snapshots).toEqual([[], ["example.com/v1/Widget"], ["example.com/v1/Widget", "example.com/v2/Widget"], ["example.com/v2/Widget"]]);
    } finally {
      dispose();
    }
  });
});
