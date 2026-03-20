import { createFileRoute } from '@tanstack/react-router';
import axios from 'axios';
import {
  type AxiosEventSourceLike,
  axiosEventSource,
  type SseErrorEventPayload,
  type SseEvent,
  type SseMessageEvent,
} from 'axios-eventsource';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';

type AuthKind = 'none' | 'basic' | 'bearer';
type MethodKind = 'GET' | 'POST';
type ScenarioKind = 'standard' | 'recovery' | 'retry';

export const Route = createFileRoute('/')({
  component: IndexPage,
});

const SCENARIO_LABELS: Record<ScenarioKind, string> = {
  standard: 'Standard (ticks with ids)',
  recovery: 'Last-Event-ID Recovery',
  retry: 'Server-Driven Retry',
};

const SCENARIO_ENDPOINTS: Record<ScenarioKind, { express: string; fastify: string }> = {
  standard: {
    express: 'http://localhost:4001/sse',
    fastify: 'http://localhost:4002/api/events/stream',
  },
  recovery: {
    express: 'http://localhost:4001/sse/recovery',
    fastify: 'http://localhost:4002/api/events/recovery',
  },
  retry: {
    express: 'http://localhost:4001/sse/retry',
    fastify: 'http://localhost:4002/api/events/retry',
  },
};

type SourceInfo = {
  readyState: number;
  url: string;
  withCredentials: boolean;
  lastEventId: string;
};

const tickPayloadSchema = z.object({
  count: z.number().int().optional(),
  kind: z.string().optional(),
  id: z.number().int().optional(),
  resumedFrom: z.string().nullable().optional(),
  retrySetByServer: z.number().int().optional(),
});

type TickPayload = z.infer<typeof tickPayloadSchema>;

function IndexPage() {
  const [auth, setAuth] = useState<AuthKind>('none');
  const [method, setMethod] = useState<MethodKind>('GET');
  const [scenario, setScenario] = useState<ScenarioKind>('standard');
  const [status, setStatus] = useState<{ express: boolean; fastify: boolean }>({
    express: false,
    fastify: false,
  });
  const [sourceInfo, setSourceInfo] = useState<{
    express: SourceInfo | null;
    fastify: SourceInfo | null;
  }>({ express: null, fastify: null });
  const [logs, setLogs] = useState<string[]>([]);
  const subscriptionsRef = useRef<Record<'express' | 'fastify', AxiosEventSourceLike | null>>({
    express: null,
    fastify: null,
  });

  const addLog = (line: string) => {
    setLogs((prev) => [`[${new Date().toISOString()}] ${line}`, ...prev].slice(0, 150));
  };

  const applyAuth = (client: ReturnType<typeof axios.create>) => {
    if (auth === 'bearer') {
      client.interceptors.request.use((config) => {
        config.headers = config.headers ?? {};
        config.headers.Authorization = 'Bearer demo-token';
        return config;
      });
      return;
    }
    if (auth === 'basic') {
      const token = btoa('demo:secret');
      client.interceptors.request.use((config) => {
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Basic ${token}`;
        return config;
      });
    }
  };

  const connectOne = (source: 'express' | 'fastify') => {
    subscriptionsRef.current[source]?.close();
    const client = axios.create();
    applyAuth(client);

    const endpoints = SCENARIO_ENDPOINTS[scenario];
    const baseEndpoint = source === 'express' ? endpoints.express : endpoints.fastify;
    const endpoint = scenario === 'standard' ? `${baseEndpoint}?auth=${auth}` : baseEndpoint;

    // AxiosInstance typing can diverge under strict checking when interceptors are used; runtime is fine.
    const sse = axiosEventSource(client as never, endpoint, {
      method: scenario === 'standard' ? method : 'GET',
      ...(scenario === 'standard' && method === 'POST' ? { data: { demo: true, auth } } : {}),
      reconnect: { initialDelayMs: 500, maxDelayMs: 8_000 },
      onopen: (event: SseEvent) => {
        setStatus((prev) => ({ ...prev, [source]: true }));
        setSourceInfo((prev) => ({
          ...prev,
          [source]: {
            readyState: sse.readyState,
            url: sse.url,
            withCredentials: sse.withCredentials,
            lastEventId: '',
          },
        }));
        addLog(`${source} connected [url=${sse.url}] [event.type=${event.type}]`);
      },
      onerror: (event: SseErrorEventPayload) => {
        setStatus((prev) => ({ ...prev, [source]: false }));
        addLog(
          `${source} error, reconnecting... [${event.error instanceof Error ? event.error.message : String(event.error)}]`,
        );
      },
    });

    sse.addEventListener(
      'tick',
      ((event: Event) => {
        const msg = event as unknown as SseMessageEvent<TickPayload>;
        setSourceInfo((prev) => ({
          ...prev,
          [source]: prev[source] ? { ...prev[source], lastEventId: msg.lastEventId } : null,
        }));
        const parsed = msg.data;
        let logLine = `${source} tick`;
        if (parsed.count !== undefined) logLine += ` count=${parsed.count}`;
        if (parsed.id !== undefined) logLine += ` id=${parsed.id}`;
        if (parsed.resumedFrom !== undefined) logLine += ` resumedFrom=${parsed.resumedFrom ?? 'none'}`;
        if (parsed.retrySetByServer !== undefined) logLine += ` serverRetry=${parsed.retrySetByServer}ms`;
        if (parsed.kind) logLine += ` [${parsed.kind}]`;
        if (msg.lastEventId) logLine += ` lastEventId=${msg.lastEventId}`;
        if (msg.origin) logLine += ` origin=${msg.origin}`;
        addLog(logLine);
      }) as never,
      {
        schema: tickPayloadSchema,
        onParseError: (_error: unknown, rawEvent: SseMessageEvent) => {
          addLog(`${source} tick parse error: ${rawEvent.data}`);
        },
      },
    );

    sse.addEventListener('edge-case', ((event: Event) => {
      const msg = event as unknown as SseMessageEvent;
      addLog(`${source} edge-case event: ${msg.data}`);
    }) as never);

    sse.addEventListener('open', (_event: SseEvent) => {
      addLog(`${source} open event via addEventListener`);
    });

    subscriptionsRef.current[source] = sse;
  };

  const connectAll = () => {
    connectOne('express');
    connectOne('fastify');
  };

  const disconnectAll = (silent = false) => {
    subscriptionsRef.current.express?.close();
    subscriptionsRef.current.fastify?.close();
    subscriptionsRef.current = { express: null, fastify: null };
    setStatus({ express: false, fastify: false });
    setSourceInfo({ express: null, fastify: null });
    if (!silent) {
      addLog('disconnected all sources');
    }
  };

  // Reconnect when auth, method, or scenario changes.
  // connectAll and disconnectAll are defined inline and recreated each render;
  // including them in deps would cause an infinite loop, so we suppress the lint warning.
  // biome-ignore lint/correctness/useExhaustiveDependencies: connectAll/disconnectAll reference stable refs
  useEffect(() => {
    connectAll();
    return () => disconnectAll(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, method, scenario]);

  const readyStateLabel = (n: number | undefined) => {
    if (n === 0) return 'CONNECTING';
    if (n === 1) return 'OPEN';
    if (n === 2) return 'CLOSED';
    return '—';
  };

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: 960, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>axios-eventsource demo (TanStack Start)</h1>
      <p>
        Auto-connects to both SSE producers. Choose a scenario to explore <strong>Last-Event-ID recovery</strong>,{' '}
        <strong>server-driven retry</strong>, or standard tick streaming.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <label>
          Scenario:{' '}
          <select value={scenario} onChange={(e) => setScenario(e.target.value as ScenarioKind)}>
            {(Object.keys(SCENARIO_LABELS) as ScenarioKind[]).map((k) => (
              <option key={k} value={k}>
                {SCENARIO_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        {scenario === 'standard' && (
          <>
            <label>
              Auth:{' '}
              <select value={auth} onChange={(e) => setAuth(e.target.value as AuthKind)}>
                <option value="none">None</option>
                <option value="basic">Basic</option>
                <option value="bearer">Bearer</option>
              </select>
            </label>
            <label>
              Method:{' '}
              <select value={method} onChange={(e) => setMethod(e.target.value as MethodKind)}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </label>
          </>
        )}
        <button type="button" onClick={connectAll}>
          Reconnect Both
        </button>
        <button type="button" onClick={() => disconnectAll(false)}>
          Disconnect Both
        </button>
      </div>

      {/* Connection status table */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          marginBottom: 16,
          fontSize: 13,
        }}
      >
        <thead>
          <tr style={{ background: '#f0f0f0', textAlign: 'left' }}>
            <th style={{ padding: '6px 10px' }}>Source</th>
            <th style={{ padding: '6px 10px' }}>Connected</th>
            <th style={{ padding: '6px 10px' }}>readyState</th>
            <th style={{ padding: '6px 10px' }}>url</th>
            <th style={{ padding: '6px 10px' }}>withCredentials</th>
            <th style={{ padding: '6px 10px' }}>lastEventId</th>
          </tr>
        </thead>
        <tbody>
          {(['express', 'fastify'] as const).map((s) => (
            <tr key={s} style={{ borderTop: '1px solid #ddd' }}>
              <td style={{ padding: '6px 10px', fontWeight: 'bold' }}>{s}</td>
              <td style={{ padding: '6px 10px', color: status[s] ? 'green' : 'gray' }}>{status[s] ? 'yes' : 'no'}</td>
              <td style={{ padding: '6px 10px' }}>{readyStateLabel(sourceInfo[s]?.readyState)}</td>
              <td
                style={{
                  padding: '6px 10px',
                  maxWidth: 260,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {sourceInfo[s]?.url ?? '—'}
              </td>
              <td style={{ padding: '6px 10px' }}>{sourceInfo[s] ? String(sourceInfo[s]?.withCredentials) : '—'}</td>
              <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>
                {sourceInfo[s]?.lastEventId !== undefined ? `"${sourceInfo[s]?.lastEventId}"` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Scenario description */}
      {scenario === 'recovery' && (
        <p
          style={{
            background: '#fffbe6',
            border: '1px solid #ffe58f',
            padding: '8px 12px',
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          <strong>Recovery scenario:</strong> The server emits 3 events with monotonic <code>id:</code> fields then
          disconnects. On each reconnect the client automatically sends <code>Last-Event-ID</code> so the server resumes
          from the next unseen id. Watch the <em>lastEventId</em> column increment without gaps.
        </p>
      )}
      {scenario === 'retry' && (
        <p
          style={{
            background: '#fffbe6',
            border: '1px solid #ffe58f',
            padding: '8px 12px',
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          <strong>Server-driven retry scenario:</strong> The server sends <code>retry: 3000</code> on connect,
          overriding the client&apos;s configured reconnect delay. After 3 events it disconnects. The client waits 3
          seconds before reconnecting, regardless of the <code>reconnect.initialDelayMs</code> option.
        </p>
      )}

      <pre
        style={{
          background: '#111',
          color: '#0f0',
          padding: 12,
          borderRadius: 8,
          minHeight: 260,
          overflow: 'auto',
          fontSize: 12,
        }}
      >
        {logs.length === 0 ? 'No events yet.' : logs.join('\n')}
      </pre>
    </main>
  );
}
