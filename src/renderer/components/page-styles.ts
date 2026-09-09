/** Inline styles (avoids a SCSS toolchain; matches Freelens flex conventions). */

export const pageStyles: Record<string, React.CSSProperties> = {
  container: {
    padding: "0 10px 10px 10px",
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
.ResourceFilterPage .resource-filter-bar {
  padding: 8px;
  margin-bottom: 8px;
  border-radius: 4px;
  border: 1px solid rgba(128, 128, 128, 0.35);
}
.ResourceFilterPage .resource-filter-bar .resource-filter-field,
.ResourceFilterPage .resource-filter-bar .resource-filter-operator {
  min-width: 180px;
  max-width: 320px;
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
.ResourceFilterPage .resource-filter-bar .resource-filter-row-stale .resource-filter-field {
  border: 1px solid rgba(204, 102, 34, 0.8);
  border-radius: 3px;
}
.ResourceFilterPage .resource-filter-bar .resource-filter-row-stale .resource-filter-stale-icon {
  color: #cc6622;
}
`;
