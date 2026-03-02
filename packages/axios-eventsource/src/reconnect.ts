import type { ReconnectOptions } from "./types.js";

export const DEFAULT_RECONNECT_INITIAL_DELAY_MS = 1_000;
export const DEFAULT_RECONNECT_MAX_DELAY_MS = 30_000;

export function getReconnectConfig(options?: ReconnectOptions): Required<
  Pick<ReconnectOptions, "initialDelayMs" | "maxDelayMs">
> & {
  maxRetries?: number;
} {
  const initialDelayMs = Math.max(0, options?.initialDelayMs ?? DEFAULT_RECONNECT_INITIAL_DELAY_MS);
  const maxDelayMs = Math.max(
    initialDelayMs,
    options?.maxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS,
  );
  const maxRetries = options?.maxRetries;

  return { initialDelayMs, maxDelayMs, ...(maxRetries !== undefined && { maxRetries }) };
}

export function getNextDelay(currentDelayMs: number, maxDelayMs: number): number {
  return Math.min(currentDelayMs * 2, maxDelayMs);
}

export async function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted || ms <= 0) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}
