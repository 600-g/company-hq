"use client";

import React from "react";

interface State { error: Error | null; }

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ background: "#1a1a2e", color: "#ff6b6b", padding: 40, minHeight: "100vh", fontFamily: "monospace" }}>
          <h1 style={{ fontSize: 18 }}>Client Error</h1>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 16, color: "#ffa07a" }}>
            {this.state.error.message}
          </pre>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 10, marginTop: 12, color: "#888" }}>
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 20, padding: "8px 16px", background: "#333", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
          >
            새로고침
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
