"use client";

import { useEffect } from "react";
import { describeError, reportError, sourceForPath } from "@/lib/system/errors";

/** Quando até o layout quebra: tela simples (sem os estilos do site) e o erro registrado. */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    const { message, stack } = describeError(error);
    const path = window.location.pathname;
    void reportError({
      source: sourceForPath(path),
      message,
      stack,
      path,
      userAgent: navigator.userAgent,
    });
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
        }}
      >
        <title>Algo deu errado | T1 Express</title>
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Algo deu errado</h1>
          <p style={{ color: "#475569", margin: "0 0 20px", lineHeight: 1.5 }}>
            A página não carregou. Nossa equipe já foi avisada. Tente de novo ou volte
            para o início.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => retry()}
              style={{
                background: "#1d4ed8",
                color: "#fff",
                border: 0,
                borderRadius: 8,
                padding: "10px 16px",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Tentar de novo
            </button>
            {/* Recarrega a página inteira: o app quebrou, então não usa navegação do React. */}
            <button
              type="button"
              onClick={() => window.location.assign(window.location.origin)}
              style={{
                background: "#fff",
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                padding: "10px 16px",
                fontSize: 14,
                color: "#0f172a",
                cursor: "pointer",
              }}
            >
              Ir para o início
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
