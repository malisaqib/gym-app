"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Last-resort error boundary: catches crashes in the ROOT layout itself, where
 * app/error.tsx can't render (so it must provide its own <html>/<body> and use
 * no app components). Styled inline for the same reason.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ background: "#000", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: 24,
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, opacity: 0.7 }}>A hiccup on our end — your data is safe.</p>
          <a
            href="/dashboard"
            style={{
              marginTop: 8,
              padding: "10px 20px",
              borderRadius: 999,
              background: "#22c55e",
              color: "#04150a",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Reload app
          </a>
        </main>
      </body>
    </html>
  );
}
