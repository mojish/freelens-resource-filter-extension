/** Inline styles (avoids a SCSS toolchain; matches Freelens flex conventions). */

export const pageStyles: Record<string, React.CSSProperties> = {
  container: {
    padding: "0 10px 10px 10px",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
  },
  pickerRow: {
    margin: "10px 0",
    display: "flex",
    gap: "8px",
    alignItems: "center",
  },
  emptyState: {
    padding: "40px 0",
    textAlign: "center",
    opacity: 0.75,
  },
  summary: {
    fontSize: "0.9em",
  },
};

/** Minimal stylesheet for the filter bar (Select/inputs inside flex rows). */
export const rowStyles = `
/* Freelens 2 removed the v1 flex utilities. Keep our layout scoped to this page. */
.ResourceFilterPage .flex { display: flex; }
.ResourceFilterPage .column { flex-direction: column; }
.ResourceFilterPage .gaps { gap: 8px; }
.ResourceFilterPage .align-center { align-items: center; }
.ResourceFilterPage .wrap { flex-wrap: wrap; }
.ResourceFilterPage .resource-filter-bar {
  padding: 8px;
  margin-bottom: 8px;
  border-radius: 4px;
  border: 1px solid rgba(128, 128, 128, 0.35);
}
.ResourceFilterPage .resource-filter-bar .resource-filter-field,
.ResourceFilterPage .resource-filter-bar .resource-filter-operator {
  min-width: 180px;
  max-width: 480px;
}
.ResourceFilterPage .resource-filter-bar .resource-filter-field-picker {
  position: relative;
  min-width: 220px;
  max-width: 480px;
  flex: 1;
}
.ResourceFilterPage .resource-filter-bar .resource-filter-field-input {
  background: none;
  border: 1px solid rgba(128, 128, 128, 0.4);
  border-radius: 3px;
  padding: 4px 8px;
  color: currentColor;
  width: 100%;
  box-sizing: border-box;
}
.ResourceFilterPage .resource-filter-bar .resource-filter-field-menu {
  position: absolute;
  z-index: 20;
  left: 0;
  right: 0;
  top: calc(100% + 2px);
  margin: 0;
  padding: 4px 0;
  list-style: none;
  max-height: 240px;
  overflow: auto;
  border: 1px solid rgba(128, 128, 128, 0.45);
  border-radius: 3px;
  background: var(--contentColor, #1e2124);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
}
.ResourceFilterPage .resource-filter-bar .resource-filter-field-menu li {
  padding: 4px 8px;
  cursor: pointer;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ResourceFilterPage .resource-filter-bar .resource-filter-field-menu li:hover {
  background: rgba(128, 128, 128, 0.25);
}
.ResourceFilterPage .resource-filter-bar .resource-filter-field-empty {
  cursor: default;
  opacity: 0.7;
  font-family: inherit;
}
.ResourceFilterPage .resource-filter-bar .resource-filter-field-empty:hover {
  background: transparent;
}
.ResourceFilterPage .resource-filter-bar .resource-filter-field-use-typed {
  font-family: inherit;
  font-style: italic;
  border-bottom: 1px solid rgba(128, 128, 128, 0.25);
}
.ResourceFilterPage .resource-filter-bar .resource-filter-value {
  flex: 1;
  min-width: 160px;
}
.ResourceFilterPage .resource-filter-bar .resource-filter-value-placeholder {
  flex: 1;
}
.ResourceFilterPage .resource-filter-bar .resource-filter-value input,
.ResourceFilterPage .resource-filter-bar input.resource-filter-value {
  background: none;
  border: 1px solid rgba(128, 128, 128, 0.4);
  border-radius: 3px;
  padding: 4px 8px;
  color: currentColor;
  width: 100%;
}
.ResourceFilterPage .resource-picker {
  min-width: 360px;
}
.ResourceFilterPage .resource-filter-bar .resource-filter-set-name {
  background: none;
  border: 1px solid rgba(128, 128, 128, 0.4);
  border-radius: 3px;
  padding: 4px 8px;
  color: currentColor;
  min-width: 120px;
}
.ResourceFilterPage .resource-filter-bar .resource-filter-sets {
  min-width: 160px;
}
.ResourceFilterPage .resource-filter-bar .resource-filter-sets-divider {
  flex: 0 0 1px;
  align-self: stretch;
  background: rgba(128, 128, 128, 0.35);
  margin: 0 4px;
}
.ResourceFilterPage .resource-filter-bar .resource-filter-row-stale .resource-filter-field,
.ResourceFilterPage .resource-filter-bar .resource-filter-row-stale .resource-filter-field-input {
  border: 1px solid rgba(204, 102, 34, 0.8);
  border-radius: 3px;
}
.ResourceFilterPage .resource-filter-bar .resource-filter-row-stale .resource-filter-stale-icon {
  color: #cc6622;
}
.ResourceFilterPage .resource-filter-bar .resource-filter-output {
  padding-top: 4px;
  border-top: 1px solid rgba(128, 128, 128, 0.25);
}
.ResourceFilterPage .resource-filter-bar .resource-filter-output-label {
  opacity: 0.8;
  font-size: 12px;
  white-space: nowrap;
}
.ResourceFilterPage .resource-filter-bar .resource-filter-chip {
  background: none;
  border: 1px solid rgba(128, 128, 128, 0.45);
  border-radius: 999px;
  padding: 2px 10px;
  color: currentColor;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.4;
}
.ResourceFilterPage .resource-filter-bar .resource-filter-chip.is-active {
  border-color: rgba(80, 160, 220, 0.85);
  background: rgba(80, 160, 220, 0.18);
}
.ResourceFilterPage .resource-filter-bar .resource-filter-chip:hover {
  border-color: rgba(128, 128, 128, 0.7);
}
.ResourceFilterPage .resource-filter-bar .resource-filter-output-add {
  min-width: 200px;
  max-width: 320px;
  flex: 1;
}
.ResourceFilterPage .resource-filter-bar .wrap {
  flex-wrap: wrap;
}
.ResourceFilterPage .resource-filter-meta {
  font-size: 12px;
  opacity: 0.9;
}
.ResourceFilterPage .resource-filter-ns-badge,
.ResourceFilterPage .resource-filter-match-count,
.ResourceFilterPage .resource-filter-catalog-note {
  padding: 2px 8px;
  border: 1px solid rgba(128, 128, 128, 0.35);
  border-radius: 3px;
}
.ResourceFilterPage .resource-filter-help {
  cursor: help;
  opacity: 0.7;
  font-size: 12px;
  user-select: none;
}
.ResourceFilterPage .resource-filter-query-input,
.ResourceFilterPage .resource-filter-preview-text {
  background: none;
  border: 1px solid rgba(128, 128, 128, 0.4);
  border-radius: 3px;
  padding: 4px 8px;
  color: currentColor;
  width: 100%;
  box-sizing: border-box;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}
.ResourceFilterPage .resource-filter-preview-summary {
  cursor: pointer;
  font-size: 12px;
  opacity: 0.9;
  user-select: none;
  padding: 4px 0;
}
.ResourceFilterPage .resource-filter-preview-text {
  margin-top: 6px;
}
.ResourceFilterPage .resource-filter-preview-label {
  font-size: 12px;
  opacity: 0.8;
  margin-bottom: 4px;
}
.ResourceFilterPage .resource-filter-empty-hints {
  font-size: 12px;
  opacity: 0.9;
  padding: 4px 0;
}
.ResourceFilterPage .resource-filter-empty-hints ul {
  margin: 4px 0 0 16px;
  padding: 0;
}
.ResourceFilterPage .resource-filter-combinator {
  min-width: 48px;
  background: none;
  border: 1px solid rgba(128, 128, 128, 0.45);
  border-radius: 3px;
  color: currentColor;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 6px;
}
.ResourceFilterPage .resource-filter-combinator.is-or {
  border-color: rgba(220, 160, 80, 0.85);
  background: rgba(220, 160, 80, 0.15);
}
.ResourceFilterPage .resource-filter-combinator-spacer {
  min-width: 48px;
}
.ResourceFilterPage .resource-filter-field-menu li.is-active {
  background: rgba(80, 160, 220, 0.25);
}
.ResourceFilterPage .resource-filter-name-link {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.ResourceFilterPage .resource-filter-drawer {
  width: 360px;
  max-width: 40vw;
  border: 1px solid rgba(128, 128, 128, 0.35);
  border-radius: 4px;
  padding: 8px;
  overflow: auto;
  max-height: 70vh;
}
.ResourceFilterPage .resource-filter-drawer-body {
  margin: 8px 0 0;
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-word;
}
.ResourceFilterPage .resource-filter-bar .resource-filter-operator-native {
  background: none;
  border: 1px solid rgba(128, 128, 128, 0.4);
  border-radius: 3px;
  padding: 4px 8px;
  color: currentColor;
  min-width: 120px;
  max-width: 160px;
}
.ResourceFilterPage .resource-filter-list-hint {
  font-size: 12px;
  opacity: 0.75;
  margin: 0 0 6px;
}
`;
