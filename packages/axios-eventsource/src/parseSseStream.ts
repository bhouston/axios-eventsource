import { createParser, type EventSourceMessage } from 'eventsource-parser';

export type ParsedSseEvent = {
  type: string;
  data: string;
  lastEventId: string;
};

export type ParseSseStreamCallbacks = {
  onRetry?: (delayMs: number) => void;
};

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
  callbacks?: ParseSseStreamCallbacks,
  encoding?: string,
): AsyncGenerator<ParsedSseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder(encoding ?? 'utf-8');
  const queue: ParsedSseEvent[] = [];
  // lastEventId accumulates across events per the SSE spec: if no id: is present
  // in an event block, the event inherits the most recently seen id.
  let accumulatedLastEventId = '';
  const parser = createParser({
    onEvent(event: EventSourceMessage) {
      if (event.id !== undefined) {
        accumulatedLastEventId = event.id;
      }
      // Default to "message" only when event field is absent (undefined). Empty string is passed through.
      const type = event.event === undefined ? 'message' : event.event;
      queue.push({
        type,
        data: event.data,
        lastEventId: accumulatedLastEventId,
      });
    },
    onRetry(interval) {
      callbacks?.onRetry?.(interval);
    },
    onError() {
      // Ignore malformed chunks and continue parsing.
    },
  });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      parser.feed(decoder.decode(value, { stream: true }));
      while (queue.length > 0) {
        const nextEvent = queue.shift();
        if (nextEvent) {
          yield nextEvent;
        }
      }
    }

    parser.feed(decoder.decode());
    while (queue.length > 0) {
      const nextEvent = queue.shift();
      if (nextEvent) {
        yield nextEvent;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
