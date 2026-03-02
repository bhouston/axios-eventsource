import { describe, expect, it, vi } from "vitest";
import { parseSseStream } from "./parseSseStream.js";

function streamFromLines(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const payload = encoder.encode(lines.join("\n"));
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(payload);
      controller.close();
    },
  });
}

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe("parseSseStream", () => {
  it("parses default message events", async () => {
    const stream = streamFromLines(['data: {"ok":true}', "", ""]);
    const events = [];
    for await (const event of parseSseStream(stream)) {
      events.push(event);
    }
    expect(events).toEqual([{ type: "message", data: '{"ok":true}', lastEventId: "" }]);
  });

  it("parses custom event names and multi-line data", async () => {
    const stream = streamFromLines(["event: ping", "id: 42", "data: hello", "data: world", "", ""]);
    const events = [];
    for await (const event of parseSseStream(stream)) {
      events.push(event);
    }
    expect(events).toEqual([{ type: "ping", data: "hello\nworld", lastEventId: "42" }]);
  });

  it("ignores comments and yields valid events", async () => {
    const stream = streamFromLines([": keepalive", "", "data: payload", "", ""]);
    const events = [];
    for await (const event of parseSseStream(stream)) {
      events.push(event);
    }
    expect(events).toEqual([{ type: "message", data: "payload", lastEventId: "" }]);
  });

  it("ignores unrecognized fields and continues yielding subsequent events", async () => {
    const stream = streamFromLines(["unknown-field: ignored-value", "data: valid", "", ""]);
    const events = [];
    for await (const event of parseSseStream(stream)) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "message", data: "valid" });
  });

  it("parses events split across multiple chunks", async () => {
    const stream = streamFromChunks(["event: up", "date\ndata: split", "\n\n"]);
    const events = [];
    for await (const event of parseSseStream(stream)) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "update", data: "split" });
  });

  it("yields multiple events from a single chunk", async () => {
    const stream = streamFromLines(["data: first", "", "data: second", "", "data: third", "", ""]);
    const events = [];
    for await (const event of parseSseStream(stream)) {
      events.push(event);
    }
    expect(events.map((e) => e.data)).toEqual(["first", "second", "third"]);
  });

  it("lastEventId is always a string, defaulting to empty string when not set", async () => {
    const stream = streamFromLines(["data: no-id", "", ""]);
    const events = [];
    for await (const event of parseSseStream(stream)) {
      events.push(event);
    }
    expect(events[0]?.lastEventId).toBe("");
    expect(typeof events[0]?.lastEventId).toBe("string");
  });

  it("accumulates lastEventId across multiple events", async () => {
    const stream = streamFromLines([
      "id: 1",
      "data: first",
      "",
      "data: second",
      "",
      "id: 3",
      "data: third",
      "",
      "",
    ]);
    const events = [];
    for await (const event of parseSseStream(stream)) {
      events.push(event);
    }
    expect(events[0]?.lastEventId).toBe("1");
    expect(events[1]?.lastEventId).toBe("1");
    expect(events[2]?.lastEventId).toBe("3");
  });

  it("invokes onRetry callback when retry: frame is received", async () => {
    const stream = streamFromLines(["retry: 5000", "data: after-retry", "", ""]);
    const onRetry = vi.fn();
    const events = [];
    for await (const event of parseSseStream(stream, { onRetry })) {
      events.push(event);
    }
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledWith(5000);
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toBe("after-retry");
  });

  it("invokes onRetry for retry-only frames with no events", async () => {
    const stream = streamFromLines(["retry: 2500", "", ""]);
    const onRetry = vi.fn();
    const events = [];
    for await (const event of parseSseStream(stream, { onRetry })) {
      events.push(event);
    }
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledWith(2500);
    expect(events).toHaveLength(0);
  });

  it("does not invoke onRetry when no retry: frame is present", async () => {
    const stream = streamFromLines(["data: hello", "", ""]);
    const onRetry = vi.fn();
    for await (const _event of parseSseStream(stream, { onRetry })) {
      // consume
    }
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("handles multiple retry: frames, invoking callback for each", async () => {
    const stream = streamFromChunks(["retry: 1000\n\nretry: 2000\ndata: hello\n\n"]);
    const onRetry = vi.fn();
    const events = [];
    for await (const event of parseSseStream(stream, { onRetry })) {
      events.push(event);
    }
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1000);
    expect(onRetry).toHaveBeenNthCalledWith(2, 2000);
  });
});
