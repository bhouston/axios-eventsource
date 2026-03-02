import express from "express";

const app = express();
app.use(express.json());
const port = Number(process.env.PORT ?? 4001);

function isAuthorized(header: string | undefined, mode: string): boolean {
  if (mode === "none") {
    return true;
  }
  if (mode === "bearer") {
    return header === "Bearer demo-token";
  }
  if (mode === "basic") {
    return header === `Basic ${Buffer.from("demo:secret").toString("base64")}`;
  }
  return false;
}

function handleSseStream(
  req: express.Request,
  res: express.Response,
  mode: string,
  extra?: Record<string, unknown>,
): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let count = 0;
  const timer = setInterval(() => {
    count += 1;
    const basePayload = {
      source: "express",
      count,
      mode,
      timestamp: new Date().toISOString(),
      ...extra,
    };

    // Mostly valid events, occasionally edge-cases to stress parser/reconnect behavior.
    if (count % 11 === 0) {
      res.write(": ping edge-case comment\n\n");
      return;
    }
    if (count % 17 === 0) {
      res.write('event: tick\ndata: {"source":"express","count":\n\n');
      return;
    }
    if (count % 23 === 0) {
      res.write(
        `event: edge-case\ndata: ${JSON.stringify({ ...basePayload, kind: "unknown-event" })}\n\n`,
      );
      return;
    }
    if (count % 29 === 0) {
      res.write(
        `event: tick\nid: ${count}\ndata: ${JSON.stringify({ ...basePayload, kind: "server-forced-disconnect" })}\n\n`,
      );
      clearInterval(timer);
      res.end();
      return;
    }

    res.write(": ping\n\n");
    res.write(`event: tick\nid: ${count}\ndata: ${JSON.stringify(basePayload)}\n\n`);
  }, 1_000);

  req.on("close", () => {
    clearInterval(timer);
    res.end();
  });
}

/**
 * Last-Event-ID recovery demo:
 * - Server reads Last-Event-ID request header (if present) to resume from that event.
 * - Emits events with explicit ids and disconnects after a few events.
 * - On reconnect the client sends Last-Event-ID so the server can skip already-seen events.
 */
function handleRecoveryStream(req: express.Request, res: express.Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const lastEventIdHeader = req.header("last-event-id");
  const startFrom = lastEventIdHeader ? Number.parseInt(lastEventIdHeader, 10) + 1 : 1;

  let count = startFrom;
  const maxEventsPerConnection = 3;
  let emitted = 0;

  const timer = setInterval(() => {
    emitted += 1;
    const payload = {
      source: "express",
      id: count,
      timestamp: new Date().toISOString(),
      resumedFrom: lastEventIdHeader ?? null,
    };
    res.write(`event: tick\nid: ${count}\ndata: ${JSON.stringify(payload)}\n\n`);
    count += 1;

    if (emitted >= maxEventsPerConnection) {
      clearInterval(timer);
      res.end();
    }
  }, 500);

  req.on("close", () => {
    clearInterval(timer);
    res.end();
  });
}

/**
 * Server-driven retry demo:
 * - Emits retry: <ms> at the start to tell the client how long to wait before reconnecting.
 * - Disconnects quickly so the client is forced to reconnect using the server-supplied delay.
 */
function handleRetryStream(req: express.Request, res: express.Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Instruct clients to wait 3 seconds before reconnecting.
  res.write("retry: 3000\n\n");

  let count = 0;
  const timer = setInterval(() => {
    count += 1;
    const payload = {
      source: "express",
      count,
      retrySetByServer: 3000,
      timestamp: new Date().toISOString(),
    };
    res.write(`event: tick\nid: ${count}\ndata: ${JSON.stringify(payload)}\n\n`);

    // Disconnect after 3 events to let the retry delay take effect.
    if (count >= 3) {
      clearInterval(timer);
      res.end();
    }
  }, 500);

  req.on("close", () => {
    clearInterval(timer);
    res.end();
  });
}

app.get("/sse", (req, res) => {
  const mode = String(req.query.auth ?? "none");
  if (!isAuthorized(req.header("authorization"), mode)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  handleSseStream(req, res, mode);
});

app.post("/sse", (req, res) => {
  const mode = String(req.query.auth ?? "none");
  if (!isAuthorized(req.header("authorization"), mode)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const body = req.body as Record<string, unknown> | undefined;
  handleSseStream(req, res, mode, body ? { requestBody: body } : undefined);
});

app.get("/sse/recovery", (req, res) => {
  handleRecoveryStream(req, res);
});

app.get("/sse/retry", (req, res) => {
  handleRetryStream(req, res);
});

app.listen(port, () => {
  process.stdout.write(
    `Express SSE server running on http://localhost:${port}\n` +
      `  GET /sse              — standard tick stream with ids\n` +
      `  GET /sse/recovery     — Last-Event-ID recovery demo\n` +
      `  GET /sse/retry        — server-driven retry: demo\n`,
  );
});
