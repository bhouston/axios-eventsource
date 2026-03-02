import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECONNECT_INITIAL_DELAY_MS,
  DEFAULT_RECONNECT_MAX_DELAY_MS,
  getNextDelay,
  getReconnectConfig,
  sleepWithAbort,
} from "./reconnect.js";

describe("reconnect", () => {
  it("uses safe defaults", () => {
    expect(getReconnectConfig()).toEqual({
      initialDelayMs: DEFAULT_RECONNECT_INITIAL_DELAY_MS,
      maxDelayMs: DEFAULT_RECONNECT_MAX_DELAY_MS,
    });
  });

  it("clamps max delay so it cannot be below initial delay", () => {
    expect(getReconnectConfig({ initialDelayMs: 200, maxDelayMs: 50 })).toEqual({
      initialDelayMs: 200,
      maxDelayMs: 200,
    });
  });

  it("passes through maxRetries when provided", () => {
    expect(getReconnectConfig({ maxRetries: 5 })).toMatchObject({ maxRetries: 5 });
    expect(getReconnectConfig({ initialDelayMs: 100, maxRetries: 3 })).toMatchObject({
      initialDelayMs: 100,
      maxRetries: 3,
    });
  });

  it("applies exponential backoff with cap", () => {
    expect(getNextDelay(100, 500)).toBe(200);
    expect(getNextDelay(400, 500)).toBe(500);
  });
});

describe("sleepWithAbort", () => {
  it("resolves immediately when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const start = Date.now();
    await sleepWithAbort(10_000, controller.signal);
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("resolves immediately when ms is 0", async () => {
    const controller = new AbortController();
    const start = Date.now();
    await sleepWithAbort(0, controller.signal);
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("resolves early when signal is aborted mid-sleep", async () => {
    const controller = new AbortController();
    const start = Date.now();
    setTimeout(() => controller.abort(), 20);
    await sleepWithAbort(10_000, controller.signal);
    expect(Date.now() - start).toBeLessThan(200);
  });
});
