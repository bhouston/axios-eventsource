import axios, { type AxiosInstance } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SseErrorEvent, SseMessageEvent } from "./index.js";
import { axiosEventSource } from "./index.js";

function streamFromSsePayload(payload: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

// Helper to create a mock that accepts a config argument so mock.calls[0]?.[0] is well-typed.
function makeRequestMock(result: () => Promise<{ status: number; data: unknown }>) {
  return vi.fn((_config: unknown) => result());
}

describe("axiosEventSource", () => {
  it("supports a provided axios instance", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload("data: hello\n\n"),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const received: string[] = [];
    const source = axiosEventSource(client, "/sse");
    source.onmessage = (event) => received.push(event.data);

    await new Promise((resolve) => setTimeout(resolve, 5));
    source.close();

    expect(requestMock).toHaveBeenCalled();
    expect(received).toContain("hello");
  });

  it("exposes url as a readonly property", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload(""),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const source = axiosEventSource(client, "/sse");
    expect(source.url).toBe("/sse");
    source.close();
  });

  it("exposes withCredentials as false by default", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload(""),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const source = axiosEventSource(client, "/sse");
    expect(source.withCredentials).toBe(false);
    source.close();
  });

  it("exposes withCredentials as true when set in options", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload(""),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const source = axiosEventSource(client, "/sse", { withCredentials: true });
    expect(source.withCredentials).toBe(true);
    source.close();
  });

  it("sends bearer auth from options", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload("event: ping\ndata: ok\n\n"),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;
    const source = axiosEventSource(client, "/sse", {
      auth: { type: "bearer", token: "abc123" },
    });

    await new Promise((resolve) => setTimeout(resolve, 5));
    source.close();

    const config = requestMock.mock.calls[0]?.[0] as
      | { headers?: { Authorization?: string } }
      | undefined;
    expect(config?.headers?.Authorization).toBe("Bearer abc123");
  });

  it("uses GET by default", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload("data: ok\n\n"),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;
    const source = axiosEventSource(client, "/sse");

    await new Promise((resolve) => setTimeout(resolve, 5));
    source.close();

    const config = requestMock.mock.calls[0]?.[0] as { method?: string } | undefined;
    expect(config?.method).toBe("GET");
  });

  it("uses POST and passes body when method is POST", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload("data: hello\n\n"),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const received: string[] = [];
    const source = axiosEventSource(client, "/sse", {
      method: "POST",
      data: { prompt: "hello" },
    });
    source.onmessage = (event) => received.push(event.data);

    await new Promise((resolve) => setTimeout(resolve, 5));
    source.close();

    expect(requestMock).toHaveBeenCalled();
    const config = requestMock.mock.calls[0]?.[0] as
      | { method?: string; data?: unknown }
      | undefined;
    expect(config?.method).toBe("POST");
    expect(config?.data).toEqual({ prompt: "hello" });
    expect(received).toContain("hello");
  });

  it("sends basic auth header", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload("data: ok\n\n"),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;
    const source = axiosEventSource(client, "/sse", {
      auth: { type: "basic", username: "demo", password: "secret" },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    source.close();

    const config = requestMock.mock.calls[0]?.[0] as
      | { headers?: { Authorization?: string } }
      | undefined;
    expect(config?.headers?.Authorization).toBe(`Basic ${btoa("demo:secret")}`);
  });

  it("uses Buffer.from for base64 when btoa is unavailable", async () => {
    vi.stubGlobal("btoa", undefined);
    try {
      const requestMock = makeRequestMock(async () => ({
        status: 200,
        data: streamFromSsePayload("data: ok\n\n"),
      }));
      const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;
      const source = axiosEventSource(client, "/sse", {
        auth: { type: "basic", username: "user", password: "pass" },
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      source.close();

      const config = requestMock.mock.calls[0]?.[0] as
        | { headers?: { Authorization?: string } }
        | undefined;
      const expected = Buffer.from("user:pass").toString("base64");
      expect(config?.headers?.Authorization).toBe(`Basic ${expected}`);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("URL-only overload creates its own axios instance", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload("data: hi\n\n"),
    }));
    const mockClient = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;
    const createSpy = vi
      .spyOn(axios, "create")
      .mockReturnValue(mockClient as unknown as ReturnType<typeof axios.create>);

    try {
      const source = axiosEventSource("http://localhost/sse", {
        reconnect: { initialDelayMs: 10_000, maxDelayMs: 10_000 },
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      source.close();

      expect(createSpy).toHaveBeenCalled();
      expect(requestMock).toHaveBeenCalled();
    } finally {
      createSpy.mockRestore();
    }
  });

  it("calls onopen and transitions readyState to OPEN on success", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload("data: hello\n\n"),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    let openCalled = false;
    const source = axiosEventSource(client, "/sse", {
      onopen: () => {
        openCalled = true;
      },
    });

    expect(source.readyState).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 20));
    source.close();

    expect(openCalled).toBe(true);
    expect(source.readyState).toBe(2);
  });

  it("onopen receives an SseEvent with type 'open'", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload("data: hello\n\n"),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const openEvents: unknown[] = [];
    const source = axiosEventSource(client, "/sse", {
      onopen: (event) => openEvents.push(event),
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    source.close();

    expect(openEvents).toHaveLength(1);
    expect(openEvents[0]).toEqual({ type: "open" });
  });

  it("addEventListener('open', ...) fires when connection opens", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload("data: hello\n\n"),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const openEvents: unknown[] = [];
    const source = axiosEventSource(client, "/sse");
    source.addEventListener("open", (event) => openEvents.push(event));

    await new Promise((resolve) => setTimeout(resolve, 20));
    source.close();

    expect(openEvents).toHaveLength(1);
    expect((openEvents[0] as { type: string }).type).toBe("open");
  });

  it("calls onerror for non-200 response status", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 503,
      data: null,
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const errorEvents: SseErrorEvent[] = [];
    const source = axiosEventSource(client, "/sse", {
      onerror: (err) => errorEvents.push(err),
      reconnect: { initialDelayMs: 10_000, maxDelayMs: 10_000 },
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    source.close();

    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0]?.type).toBe("error");
    expect(errorEvents[0]?.error).toBeInstanceOf(Error);
    expect((errorEvents[0]?.error as Error).message).toContain("503");
  });

  it("onerror receives SseErrorEvent with type 'error' and error field", async () => {
    const networkError = new Error("network failure");
    const requestMock = vi.fn((_config: unknown) => Promise.reject(networkError));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const errorEvents: SseErrorEvent[] = [];
    const source = axiosEventSource(client, "/sse", {
      onerror: (event) => errorEvents.push(event),
      reconnect: { initialDelayMs: 10_000, maxDelayMs: 10_000 },
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    source.close();

    expect(errorEvents.length).toBeGreaterThan(0);
    expect(errorEvents[0]?.type).toBe("error");
    expect(errorEvents[0]?.error).toBe(networkError);
  });

  it("addEventListener('error', ...) fires on transport failures", async () => {
    const requestMock = vi.fn((_config: unknown) => Promise.reject(new Error("fail")));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const errorEvents: unknown[] = [];
    const source = axiosEventSource(client, "/sse", {
      reconnect: { initialDelayMs: 10_000, maxDelayMs: 10_000 },
    });
    source.addEventListener("error", (event) => errorEvents.push(event));

    await new Promise((resolve) => setTimeout(resolve, 30));
    source.close();

    expect(errorEvents.length).toBeGreaterThan(0);
    expect((errorEvents[0] as SseErrorEvent).type).toBe("error");
    expect((errorEvents[0] as SseErrorEvent).error).toBeInstanceOf(Error);
  });

  it("stops reconnecting when close() is called inside onerror", async () => {
    const networkError = new Error("network failure");
    const requestMock = vi.fn((_config: unknown) => Promise.reject(networkError));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    let source: ReturnType<typeof axiosEventSource>;
    source = axiosEventSource(client, "/sse", {
      onerror: () => source.close(),
      reconnect: { initialDelayMs: 10_000, maxDelayMs: 10_000 },
    });

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(source.readyState).toBe(2);
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("onmessage receives SseMessageEvent with origin, source, ports, lastEventId", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload("id: 7\ndata: hello\n\n"),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const received: SseMessageEvent[] = [];
    const source = axiosEventSource(client, "http://example.com/sse");
    source.onmessage = (event) => received.push(event);

    await new Promise((resolve) => setTimeout(resolve, 20));
    source.close();

    expect(received).toHaveLength(1);
    const event = received[0];
    expect(event?.type).toBe("message");
    expect(event?.data).toBe("hello");
    expect(event?.lastEventId).toBe("7");
    expect(event?.origin).toBe("http://example.com");
    expect(event?.source).toBeNull();
    expect(Array.from(event?.ports ?? [])).toEqual([]);
  });

  it("onmessage lastEventId is empty string when no id field is sent", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload("data: no-id\n\n"),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const received: SseMessageEvent[] = [];
    const source = axiosEventSource(client, "/sse");
    source.onmessage = (event) => received.push(event);

    await new Promise((resolve) => setTimeout(resolve, 20));
    source.close();

    expect(received[0]?.lastEventId).toBe("");
  });

  it("sends Last-Event-ID header on reconnect after receiving an id", async () => {
    const receivedIds: (string | undefined)[] = [];
    let callCount = 0;

    const requestMock = vi.fn((_config: unknown) => {
      callCount += 1;
      const config = requestMock.mock.calls[callCount - 1]?.[0] as
        | { headers?: Record<string, string> }
        | undefined;
      receivedIds.push(config?.headers?.["Last-Event-ID"]);
      if (callCount === 1) {
        return Promise.resolve({
          status: 200,
          data: streamFromSsePayload("id: 42\ndata: first\n\n"),
        });
      }
      return Promise.resolve({
        status: 200,
        data: streamFromSsePayload("data: second\n\n"),
      });
    });
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const source = axiosEventSource(client, "/sse", {
      reconnect: { initialDelayMs: 5, maxDelayMs: 5 },
    });

    await new Promise((resolve) => setTimeout(resolve, 80));
    source.close();

    expect(receivedIds[0]).toBeUndefined();
    expect(receivedIds[1]).toBe("42");
  });

  it("does not send Last-Event-ID header on first connection", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload("data: ok\n\n"),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const source = axiosEventSource(client, "/sse", {
      reconnect: { initialDelayMs: 10_000, maxDelayMs: 10_000 },
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    source.close();

    const config = requestMock.mock.calls[0]?.[0] as
      | { headers?: Record<string, string> }
      | undefined;
    expect(config?.headers?.["Last-Event-ID"]).toBeUndefined();
  });

  it("stops processing events when closed inside onmessage", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload("data: first\n\ndata: second\n\n"),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const received: string[] = [];
    let source: ReturnType<typeof axiosEventSource>;
    source = axiosEventSource(client, "/sse");
    source.onmessage = (event) => {
      received.push(event.data);
      source.close();
    };

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(received).toHaveLength(1);
    expect(received[0]).toBe("first");
  });

  it("respects external AbortSignal passed via options.signal", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload("data: hi\n\n"),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const controller = new AbortController();
    const source = axiosEventSource(client, "/sse", {
      signal: controller.signal,
      reconnect: { initialDelayMs: 10_000, maxDelayMs: 10_000 },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(source.readyState).toBe(2);
  });

  it("addEventListener dispatches named events to registered listener", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload("event: ping\ndata: pong\n\n"),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const received: string[] = [];
    const source = axiosEventSource(client, "/sse");
    source.addEventListener("ping", (event) => received.push(event.data));

    await new Promise((resolve) => setTimeout(resolve, 20));
    source.close();

    expect(received).toContain("pong");
  });

  it("addEventListener dispatches 'message' type via named listener", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload("data: hello\n\n"),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const received: SseMessageEvent[] = [];
    const source = axiosEventSource(client, "/sse");
    source.addEventListener("message", (event) => received.push(event));

    await new Promise((resolve) => setTimeout(resolve, 20));
    source.close();

    expect(received).toHaveLength(1);
    expect(received[0]?.data).toBe("hello");
  });

  it("addEventListener with once:true fires only once", async () => {
    let callCount = 0;
    const requestMock = vi.fn((_config: unknown) => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve({
          status: 200,
          data: streamFromSsePayload("event: ping\ndata: first\n\nevent: ping\ndata: second\n\n"),
        });
      }
      return Promise.resolve({
        status: 200,
        data: streamFromSsePayload("event: ping\ndata: third\n\n"),
      });
    });
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const received: string[] = [];
    const source = axiosEventSource(client, "/sse", {
      reconnect: { initialDelayMs: 5, maxDelayMs: 5 },
    });
    source.addEventListener("ping", (event) => received.push(event.data), { once: true });

    await new Promise((resolve) => setTimeout(resolve, 80));
    source.close();

    expect(received).toHaveLength(1);
    expect(received[0]).toBe("first");
  });

  it("addEventListener with handleEvent object listener", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload("data: hello\n\n"),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const received: string[] = [];
    const listenerObj = {
      handleEvent(event: SseMessageEvent) {
        received.push(event.data);
      },
    };
    const source = axiosEventSource(client, "/sse");
    source.addEventListener("message", listenerObj);

    await new Promise((resolve) => setTimeout(resolve, 20));
    source.close();

    expect(received).toContain("hello");
  });

  it("addEventListener does not register the same listener twice", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload("event: ping\ndata: pong\n\n"),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const received: string[] = [];
    const listener = (event: SseMessageEvent) => received.push(event.data);
    const source = axiosEventSource(client, "/sse");
    source.addEventListener("ping", listener);
    source.addEventListener("ping", listener);

    await new Promise((resolve) => setTimeout(resolve, 20));
    source.close();

    expect(received).toHaveLength(1);
  });

  it("removeEventListener prevents listener from receiving further events", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload("event: ping\ndata: pong\n\n"),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const received: string[] = [];
    const listener = (event: SseMessageEvent) => received.push(event.data);
    const source = axiosEventSource(client, "/sse");
    source.addEventListener("ping", listener);
    source.removeEventListener("ping", listener);

    await new Promise((resolve) => setTimeout(resolve, 20));
    source.close();

    expect(received).toHaveLength(0);
  });

  it("removeEventListener is a no-op when type has no listeners", () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload(""),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const source = axiosEventSource(client, "/sse");
    expect(() => source.removeEventListener("nonexistent", () => {})).not.toThrow();
    source.close();
  });

  it("onopen, onmessage, and onerror getters return the assigned values", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload(""),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const source = axiosEventSource(client, "/sse");

    const openFn = () => {};
    const messageFn = (_event: SseMessageEvent) => {};
    const errorFn = (_event: SseErrorEvent) => {};

    source.onopen = openFn;
    source.onmessage = messageFn;
    source.onerror = errorFn;

    expect(source.onopen).toBe(openFn);
    expect(source.onmessage).toBe(messageFn);
    expect(source.onerror).toBe(errorFn);

    source.close();
  });

  it("close() before first response sets readyState to CLOSED", async () => {
    const requestMock = vi.fn((_config: unknown) => new Promise(() => {}));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const source = axiosEventSource(client, "/sse");
    expect(source.readyState).toBe(0);

    source.close();
    expect(source.readyState).toBe(2);

    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it("applies server retry: interval as the reconnect delay", async () => {
    let callCount = 0;
    const requestMock = vi.fn((_config: unknown) => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve({
          status: 200,
          data: streamFromSsePayload("retry: 50\ndata: first\n\n"),
        });
      }
      return Promise.resolve({
        status: 200,
        data: streamFromSsePayload("data: second\n\n"),
      });
    });
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const received: string[] = [];
    const source = axiosEventSource(client, "/sse", {
      reconnect: { initialDelayMs: 10_000, maxDelayMs: 10_000 },
    });
    source.onmessage = (event) => received.push(event.data);

    await new Promise((resolve) => setTimeout(resolve, 200));
    source.close();

    expect(received).toContain("second");
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it("origin is extracted from absolute URL", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload("data: hello\n\n"),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const received: SseMessageEvent[] = [];
    const source = axiosEventSource(client, "https://api.example.com/events");
    source.onmessage = (event) => received.push(event);

    await new Promise((resolve) => setTimeout(resolve, 20));
    source.close();

    expect(received[0]?.origin).toBe("https://api.example.com");
  });

  it("origin is empty string for relative URL", async () => {
    const requestMock = makeRequestMock(async () => ({
      status: 200,
      data: streamFromSsePayload("data: hello\n\n"),
    }));
    const client = { get: vi.fn(), request: requestMock } as unknown as AxiosInstance;

    const received: SseMessageEvent[] = [];
    const source = axiosEventSource(client, "/sse");
    source.onmessage = (event) => received.push(event);

    await new Promise((resolve) => setTimeout(resolve, 20));
    source.close();

    expect(received[0]?.origin).toBe("");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});
