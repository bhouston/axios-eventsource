import http from "node:http";
import axios from "axios";
import type { SseErrorEvent, SseMessageEvent } from "axios-eventsource";
import { axiosEventSource } from "axios-eventsource";
import { afterEach, describe, expect, it } from "vitest";

type ServerHandle = {
  baseUrl: string;
  close: () => Promise<void>;
};

async function startSseServer(): Promise<ServerHandle> {
  let connectionCount = 0;

  const server = http.createServer((req, res) => {
    if (!req.url || !req.url.startsWith("/sse")) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }

    const bearer = req.headers.authorization;
    const url = new URL(req.url, "http://localhost");
    const mode = url.searchParams.get("auth") ?? "none";
    const scenario = url.searchParams.get("scenario") ?? "default";

    if (mode === "bearer" && bearer !== "Bearer valid-token") {
      res.statusCode = 401;
      res.end("unauthorized");
      return;
    }
    if (mode === "basic" && bearer !== `Basic ${Buffer.from("demo:secret").toString("base64")}`) {
      res.statusCode = 401;
      res.end("unauthorized");
      return;
    }

    const isPost = req.method === "POST";

    if (isPost) {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(body) as Record<string, unknown>;
        } catch {
          // ignore malformed body
        }
        connectionCount += 1;
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.write(
          `event: tick\ndata: ${JSON.stringify({ count: connectionCount, method: "POST", body: parsed })}\n\n`,
        );
        setTimeout(() => res.end(), 25);
      });
      return;
    }

    // Last-Event-ID recovery scenario: server reads the header and resumes from that id
    if (scenario === "last-event-id") {
      const lastEventIdRaw = req.headers["last-event-id"];
      const lastEventId = Array.isArray(lastEventIdRaw) ? lastEventIdRaw[0] : lastEventIdRaw;
      const startFrom = lastEventId ? Number.parseInt(lastEventId, 10) + 1 : 1;

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      // Send two events then disconnect
      res.write(`id: ${startFrom}\nevent: tick\ndata: ${JSON.stringify({ id: startFrom })}\n\n`);
      res.write(
        `id: ${startFrom + 1}\nevent: tick\ndata: ${JSON.stringify({ id: startFrom + 1 })}\n\n`,
      );
      setTimeout(() => res.end(), 25);
      return;
    }

    // Server-driven retry scenario: server sends retry: then disconnects
    if (scenario === "retry") {
      connectionCount += 1;
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("retry: 30\n\n");
      res.write(`event: tick\ndata: ${JSON.stringify({ count: connectionCount })}\n\n`);
      setTimeout(() => res.end(), 25);
      return;
    }

    connectionCount += 1;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    if (connectionCount === 1) {
      res.write(": ping\n\n");
      res.write('event: tick\ndata: {"count":1}\n\n');
      res.end();
      return;
    }

    res.write('event: tick\ndata: {"count":2}\n\n');
    setTimeout(() => res.end(), 25);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to determine server address");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanup.length > 0) {
    const close = cleanup.pop();
    if (close) {
      await close();
    }
  }
});

describe("axios-eventsource integration", () => {
  it("reconnects after disconnect and continues delivering events", async () => {
    const server = await startSseServer();
    cleanup.push(server.close);

    const client = axios.create();
    const received: string[] = [];
    const source = axiosEventSource(client, `${server.baseUrl}/sse`, {
      reconnect: { initialDelayMs: 10, maxDelayMs: 20 },
    });

    source.addEventListener("tick", (event) => {
      received.push(event.data);
    });

    await delay(220);
    source.close();

    expect(received).toContain('{"count":1}');
    expect(received).toContain('{"count":2}');
  });

  it("supports bearer auth via provided axios instance interceptors", async () => {
    const server = await startSseServer();
    cleanup.push(server.close);

    const client = axios.create();
    client.interceptors.request.use((config) => {
      config.headers = config.headers ?? {};
      config.headers.Authorization = "Bearer valid-token";
      return config;
    });

    const received: string[] = [];
    const source = axiosEventSource(client, `${server.baseUrl}/sse?auth=bearer`, {
      reconnect: { initialDelayMs: 10, maxDelayMs: 20 },
    });
    source.addEventListener("tick", (event) => {
      received.push(event.data);
    });

    await delay(80);
    source.close();

    expect(received.length).toBeGreaterThan(0);
  });

  it("aborts cleanly without leaking reconnect attempts", async () => {
    const server = await startSseServer();
    cleanup.push(server.close);

    const client = axios.create();
    let errorCount = 0;
    const source = axiosEventSource(client, `${server.baseUrl}/sse?auth=bearer`, {
      auth: { type: "bearer", token: "wrong-token" },
      reconnect: { initialDelayMs: 10, maxDelayMs: 20 },
      onerror: () => {
        errorCount += 1;
      },
    });

    await delay(50);
    source.close();
    const snapshot = errorCount;
    await delay(50);

    expect(snapshot).toBeGreaterThan(0);
    expect(errorCount).toBe(snapshot);
    expect(source.readyState).toBe(2);
  });

  it("supports POST method and delivers events", async () => {
    const server = await startSseServer();
    cleanup.push(server.close);

    const client = axios.create();
    const received: Array<{ count: number; method: string; body: Record<string, unknown> }> = [];

    const source = axiosEventSource(client, `${server.baseUrl}/sse`, {
      method: "POST",
      data: { prompt: "hello world" },
      reconnect: { initialDelayMs: 10, maxDelayMs: 20 },
    });

    source.addEventListener("tick", (event) => {
      received.push(
        JSON.parse(event.data) as { count: number; method: string; body: Record<string, unknown> },
      );
    });

    await delay(100);
    source.close();

    expect(received.length).toBeGreaterThan(0);
    expect(received[0]?.method).toBe("POST");
    expect(received[0]?.body).toEqual({ prompt: "hello world" });
  });

  it("supports POST method with bearer auth", async () => {
    const server = await startSseServer();
    cleanup.push(server.close);

    const client = axios.create();
    client.interceptors.request.use((config) => {
      config.headers = config.headers ?? {};
      config.headers.Authorization = "Bearer valid-token";
      return config;
    });

    const received: Array<{ method: string }> = [];
    const source = axiosEventSource(client, `${server.baseUrl}/sse?auth=bearer`, {
      method: "POST",
      data: { query: "test" },
      reconnect: { initialDelayMs: 10, maxDelayMs: 20 },
    });

    source.addEventListener("tick", (event) => {
      received.push(JSON.parse(event.data) as { method: string });
    });

    await delay(100);
    source.close();

    expect(received.length).toBeGreaterThan(0);
    expect(received[0]?.method).toBe("POST");
  });

  it("sends Last-Event-ID header on reconnect after receiving events with ids", async () => {
    const server = await startSseServer();
    cleanup.push(server.close);

    const client = axios.create();
    const received: Array<{ id: number }> = [];

    const source = axiosEventSource(client, `${server.baseUrl}/sse?scenario=last-event-id`, {
      reconnect: { initialDelayMs: 30, maxDelayMs: 50 },
    });

    source.addEventListener("tick", (event) => {
      received.push(JSON.parse(event.data) as { id: number });
    });

    await delay(300);
    source.close();

    expect(received.length).toBeGreaterThanOrEqual(4);

    const ids = received.map((e) => e.id);

    // First connection: ids 1 and 2
    expect(ids[0]).toBe(1);
    expect(ids[1]).toBe(2);
    // On reconnect with Last-Event-ID: 2, server resumes at 3 and 4
    expect(ids[2]).toBe(3);
    expect(ids[3]).toBe(4);
  });

  it("exposes url and withCredentials on the returned source object", async () => {
    const server = await startSseServer();
    cleanup.push(server.close);

    const client = axios.create();
    const url = `${server.baseUrl}/sse`;
    const source = axiosEventSource(client, url, {
      withCredentials: true,
      reconnect: { initialDelayMs: 10_000, maxDelayMs: 10_000 },
    });

    expect(source.url).toBe(url);
    expect(source.withCredentials).toBe(true);
    source.close();
  });

  it("fires onopen and addEventListener(open) on successful connection", async () => {
    const server = await startSseServer();
    cleanup.push(server.close);

    const client = axios.create();
    const openCallbacks: unknown[] = [];

    const source = axiosEventSource(client, `${server.baseUrl}/sse`, {
      onopen: (event) => openCallbacks.push({ via: "onopen", event }),
      reconnect: { initialDelayMs: 10_000, maxDelayMs: 10_000 },
    });
    source.addEventListener("open", (event) => openCallbacks.push({ via: "listener", event }));

    await delay(80);
    source.close();

    const viaCounts = openCallbacks.reduce<Record<string, number>>((acc, c) => {
      const via = (c as { via: string }).via;
      acc[via] = (acc[via] ?? 0) + 1;
      return acc;
    }, {});

    expect(viaCounts.onopen).toBeGreaterThanOrEqual(1);
    expect(viaCounts.listener).toBeGreaterThanOrEqual(1);
  });

  it("fires onerror and addEventListener(error) on transport failure", async () => {
    const server = await startSseServer();
    cleanup.push(server.close);

    const client = axios.create();
    const errorCallbacks: Array<SseErrorEvent> = [];

    const source = axiosEventSource(client, `${server.baseUrl}/sse?auth=bearer`, {
      auth: { type: "bearer", token: "wrong" },
      onerror: (event) => errorCallbacks.push(event),
      reconnect: { initialDelayMs: 10_000, maxDelayMs: 10_000 },
    });
    source.addEventListener("error", (event) => errorCallbacks.push(event));

    await delay(80);
    source.close();

    expect(errorCallbacks.length).toBeGreaterThanOrEqual(2);
    for (const e of errorCallbacks) {
      expect(e.type).toBe("error");
      expect(e.error).toBeDefined();
    }
  });

  it("SseMessageEvent has correct shape with origin, source, ports", async () => {
    const server = await startSseServer();
    cleanup.push(server.close);

    const client = axios.create();
    const received: SseMessageEvent[] = [];

    const source = axiosEventSource(client, `${server.baseUrl}/sse?scenario=last-event-id`, {
      reconnect: { initialDelayMs: 10_000, maxDelayMs: 10_000 },
    });
    source.addEventListener("tick", (event) => received.push(event));

    await delay(80);
    source.close();

    expect(received.length).toBeGreaterThan(0);
    expect(received[0]?.origin).toBe(`http://127.0.0.1:${new URL(server.baseUrl).port}`);
    expect(received[0]?.source).toBeNull();
    expect(received[0]?.ports).toEqual([]);
    expect(typeof received[0]?.lastEventId).toBe("string");
  });

  it("respects server-sent retry: interval for reconnect timing", async () => {
    const server = await startSseServer();
    cleanup.push(server.close);

    const client = axios.create();
    const received: Array<{ count: number }> = [];

    // Use a very large initial delay so we know only the server retry drives reconnect
    const source = axiosEventSource(client, `${server.baseUrl}/sse?scenario=retry`, {
      reconnect: { initialDelayMs: 60_000, maxDelayMs: 60_000 },
    });
    source.addEventListener("tick", (event) => {
      received.push(JSON.parse(event.data) as { count: number });
    });

    await delay(300);
    source.close();

    // With server retry: 30ms, should reconnect multiple times in 300ms
    expect(received.length).toBeGreaterThanOrEqual(2);
  });
});
