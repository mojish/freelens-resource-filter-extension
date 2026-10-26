// Local fixture for the built renderer. No cluster access or Freelens profile use.
import React from "react";
import ReactDOM from "react-dom";
import * as Mobx from "mobx";
import * as MobxReact from "mobx-react";
import * as JSX from "react/jsx-runtime";
import { Simulate } from "react-dom/test-utils";

globalThis.global = globalThis;
Object.assign(globalThis, { React, ReactDom: ReactDOM, ReactJsxRuntime: JSX, Mobx, MobxReact });
const mounts = [], unmounts = [];
const makeItem = (name, revision, spec = {}) => ({
  metadata: { name, uid: name, resourceVersion: revision, creationTimestamp: new Date().toISOString() },
  spec, status: { state: "healthy" },
  getName() { return name; }, getNs() { return ""; }, getCreationTimestamp() { return this.metadata.creationTimestamp; }, getSearchFields() { return [name]; },
});
const api = (kind) => ({ kind, apiBase: `/apis/example.com/v1/${kind.toLowerCase()}s`, apiVersionWithGroup: "example.com/v1", isNamespaced: true, apiResource: `${kind.toLowerCase()}s` });
const widget = api("Widget"), gadget = api("Gadget");
const makeStore = (id) => Mobx.observable({ id, isLoaded: true, items: [makeItem(id, "1", { state: "ready" })] }, { items: Mobx.observable.shallow });
const stores = { [widget.apiBase]: makeStore("widget"), [gadget.apiBase]: makeStore("gadget") };
const Layout = MobxReact.observer((props) => {
  React.useEffect(() => { mounts.push(props.store.id); return () => unmounts.push(props.store.id); }, []);
  const items = props.filterItems[0](props.store.items);
  return <div>
    <pre data-testid="table-count">{items.length}</pre>
    <pre data-testid="headers">{JSON.stringify(props.renderTableHeader)}</pre>
    {items.slice(0, 1).map((item) => <div key={item.metadata.name} data-testid="row">{props.renderTableContents(item)}</div>)}
  </div>;
});
const Select = ({ className, value, options = [], onChange }) => <select className={className} value={value ?? ""} onChange={(event) => onChange({ value: event.target.value })}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;
const Button = ({ label, onClick, disabled, ...props }) => <button data-testid={props["data-testid"]} disabled={disabled} onClick={onClick}>{label}</button>;
globalThis.LensExtensions = { Renderer: {
  Component: new Proxy({ Select, Button, KubeObjectListLayout: Layout, WithTooltip: ({ children }) => children }, { get: (target, key) => target[key] ?? (() => null) }),
  K8sApi: { apiManager: { apis: Mobx.observable.map([[widget.apiBase, widget], [gadget.apiBase, gadget]]), getStore: (base) => stores[base] }, namespaceStore: { areAllSelectedImplicitly: true } },
} };
localStorage.clear();
localStorage.setItem("frf:v1:last-kind", "example.com/v1/Widget");
localStorage.setItem("frf:v1:session:example.com/v1/Widget", JSON.stringify({ outputFields: ["metadata.name"], columns: ["spec.state", "status.state", "spec"], dialect: "jq" }));
localStorage.setItem("frf:v1:session:example.com/v1/Gadget", JSON.stringify({ outputFields: ["spec"], columns: [], dialect: "yq" }));
const { ResourceFilterPage } = require("../out/renderer/components/resource-filter-page.js");
ReactDOM.render(<ResourceFilterPage />, document.getElementById("app"));
const pause = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
const query = (selector) => document.querySelector(selector);
const count = () => ({ badge: query('[data-testid="match-count"]')?.textContent, table: query('[data-testid="table-count"]')?.textContent });
const apply = async (value) => { Simulate.change(query('[data-testid="filter-query-bar"]'), { target: { value } }); Simulate.click(query('[data-testid="apply-query"]')); await pause(); };
const result = {};
try {
  await pause(100);
  result.headers = JSON.parse(query('[data-testid="headers"]').textContent);
  result.row = query('[data-testid="row"]').textContent;
  await apply("spec.state = ready");
  Mobx.runInAction(() => stores[widget.apiBase].items.replace([makeItem("widget", "2", { state: "pending", newField: "added" })]));
  await pause();
  result.watch = count();
  Simulate.focus(query('[data-testid="field-path-picker"] input'));
  Simulate.change(query('[data-testid="field-path-picker"] input'), { target: { value: "spec.newField" } });
  result.newField = [...document.querySelectorAll('[role="option"]')].some((option) => option.textContent === "spec.newField");
  Mobx.runInAction(() => stores[widget.apiBase].items.replace(Array.from({ length: 201 }, (_, i) => makeItem(`item-${i}`, "1", i === 200 ? { rare: "yes", state: "ready AND waiting" } : {}))));
  await apply("spec.rare exists"); result.sampled = count();
  await apply('spec.state = "ready AND waiting"'); result.quoted = count();
  await apply("spec.state = ready AND broken"); result.invalid = { ...count(), error: query('[role="alert"]')?.textContent };
  await apply(""); result.cleared = count();
  Mobx.runInAction(() => stores[widget.apiBase].items.replace([makeItem("widget", "3", { state: "ready" })]));
  await apply("metadata.creationTimestamp newer_than 1s");
  const preview = query('[data-testid="kubectl-preview-text"]').value;
  result.ageBefore = count();
  await pause(2100);
  result.ageAfter = { ...count(), previewChanged: preview !== query('[data-testid="kubectl-preview-text"]').value };
  await apply("");
  Simulate.click(query(".resource-filter-name-link")); await pause();
  result.drawerBefore = Boolean(query('[data-testid="yaml-drawer"]'));
  Simulate.change(query(".resource-picker"), { target: { value: "example.com/v1/Gadget" } }); await pause();
  result.switchKind = { mounts, unmounts, drawerAfter: Boolean(query('[data-testid="yaml-drawer"]')), session: JSON.parse(localStorage.getItem("frf:v1:session:example.com/v1/Gadget")) };
} catch (error) {
  result.error = error.stack;
}
document.getElementById("result").textContent = JSON.stringify(result);
