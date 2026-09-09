/**
 * ErrorBoundary: keeps a render crash inside the Resource Filter page from
 * blanking the whole cluster frame. The cluster connection is unaffected by
 * extension page errors — say so in the fallback.
 */

import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // surfaced in the cluster frame log (~/.config/Freelens/logs/lens-renderer-cluster-*-frame.log)
    console.error("[resource-filter] render error:", error, info.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="ResourceFilterError flex column gaps" style={{ padding: "20px" }}>
          <h3>Resource Filter could not render this page</h3>
          <p style={{ opacity: 0.8 }}>
            The extension hit an unexpected error. The cluster connection and all other pages are unaffected.
          </p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              border: "1px solid rgba(128, 128, 128, 0.4)",
              borderRadius: 4,
              padding: 8,
            }}
          >
            {String(this.state.error?.message ?? this.state.error)}
          </pre>
          <p style={{ opacity: 0.6, fontSize: "0.9em" }}>
            Details are in the cluster frame log. Switching to another page and back resets this page.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
