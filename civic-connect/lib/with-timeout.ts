let dataCircuitOpenUntil = 0;

function openDataCircuit(durationMs = 60_000) {
  dataCircuitOpenUntil = Math.max(dataCircuitOpenUntil, Date.now() + durationMs);
}

export function isDataCircuitOpen() {
  return Date.now() < dataCircuitOpenUntil;
}

export async function withTimeout<T>(
  load: () => Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  if (isDataCircuitOpen()) {
    return fallback;
  }

  let timer: NodeJS.Timeout | undefined;
  let didTimeout = false;

  try {
    return await Promise.race([
      load().catch(() => {
        openDataCircuit(15_000);
        return fallback;
      }),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          didTimeout = true;
          openDataCircuit();
          resolve(fallback);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }

    if (didTimeout) {
      openDataCircuit();
    }
  }
}
