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
`;
