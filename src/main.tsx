import { createRoot } from "react-dom/client";
import React, { Component, type ReactNode } from "react";
import App from "./App";
import "./themes.css";
import "./styles.css";
import { applyThemeToDocument, loadTheme } from "./themes";
import { applyFontToDocument, loadFont } from "./fonts";

window.addEventListener("error", (e) => {
  console.error("CRITICAL RENDERER ERROR:", e.error || e.message);
  try {
    localStorage.setItem("datastuff_last_error", String(e.error?.stack || e.message));
  } catch {}
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("UNHANDLED REJECTION:", e.reason);
  try {
    localStorage.setItem("datastuff_last_rejection", String(e.reason?.stack || e.reason));
  } catch {}
});

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class GlobalErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("GlobalErrorBoundary caught error:", error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 40,
            color: "#ffffff",
            background: "#14161a",
            height: "100vh",
            fontFamily: "system-ui, sans-serif",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <h2 style={{ color: "#ef4444", marginBottom: 12 }}>DataStuff Startup Notice</h2>
          <p style={{ maxWidth: 600, textAlign: "center", color: "#94a3b8", lineHeight: 1.6 }}>
            {this.state.error?.message || "An initialization error occurred."}
          </p>
          <button
            type="button"
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
            style={{
              marginTop: 20,
              padding: "10px 20px",
              background: "#3d8bfd",
              color: "#ffffff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Reset App Cache & Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

try {
  applyThemeToDocument(loadTheme());
  applyFontToDocument(loadFont());
} catch {}

createRoot(document.getElementById("root")!).render(
  <GlobalErrorBoundary>
    <App />
  </GlobalErrorBoundary>,
);
