"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface ClientErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ClientErrorBoundaryState {
  hasError: boolean;
}

// Distinguishes "stale HTML pointing at a chunk the server no longer ships
// after a deploy" from a genuine application error. Webpack sets
// `name === "ChunkLoadError"`, but some wrappers preserve only the message.
function isChunkLoadError(error: Error | null | undefined): boolean {
  if (!error) return false;
  if (error.name === "ChunkLoadError") return true;
  const msg = error.message ?? "";
  return /Loading (CSS )?chunk [\w-]+ failed/i.test(msg) || /ChunkLoadError/i.test(msg);
}

const CHUNK_RELOAD_KEY = "civic:chunk-reload";
const CHUNK_RELOAD_TTL_MS = 10_000;

export default class ClientErrorBoundary extends Component<
  ClientErrorBoundaryProps,
  ClientErrorBoundaryState
> {
  state: ClientErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ClientErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Client UI boundary caught an error", error, errorInfo);

    if (isChunkLoadError(error) && typeof window !== "undefined") {
      // Recover transparently from post-deploy stale-HTML chunk 404s. The TTL
      // guard prevents an infinite reload loop if the server is genuinely
      // broken — after one attempt within 10s we fall through to the fallback.
      try {
        const last = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0);
        if (Date.now() - last > CHUNK_RELOAD_TTL_MS) {
          window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
          window.location.reload();
        }
      } catch {
        // sessionStorage can throw in some sandboxed contexts — fall through.
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }

    return this.props.children;
  }
}
