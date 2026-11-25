import { useState } from 'react';
import { usePreviewMatch, type PreviewResult } from '../../api/hooks';

export function ScriptTestPanel({
  apiId,
  apiPath,
  apiMethod,
  onSaveFirst,
  savePending,
}: {
  apiId: string;
  apiPath: string;
  apiMethod: string;
  onSaveFirst?: () => Promise<void>;
  savePending?: boolean;
}) {
  const preview = usePreviewMatch();
  const [method, setMethod] = useState(apiMethod);
  const [path, setPath] = useState(apiPath);
  const [query, setQuery] = useState('');
  const [headers, setHeaders] = useState('');
  const [body, setBody] = useState('');
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  async function run() {
    setRunError(null);
    try {
      if (onSaveFirst) await onSaveFirst();

      let parsedQuery: Record<string, unknown> = {};
      for (const pair of query.split('&')) {
        if (!pair.trim()) continue;
        const eq = pair.indexOf('=');
        const k = eq >= 0 ? pair.slice(0, eq) : pair;
        const v = eq >= 0 ? pair.slice(eq + 1) : '';
        parsedQuery[safeDecode(k)] = safeDecode(v);
      }
      let parsedHeaders: Record<string, string> = {};
      for (const line of headers.split('\n')) {
        const idx = line.indexOf(':');
        if (idx > 0) parsedHeaders[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
      }
      let parsedBody: unknown = undefined;
      if (body.trim()) {
        try {
          parsedBody = JSON.parse(body);
        } catch {
          parsedBody = body;
        }
      }
      preview.mutate(
        {
          apiId,
          request: { method, path, query: parsedQuery, headers: parsedHeaders, body: parsedBody },
        },
        { onSuccess: setResult, onError: (e) => setRunError(e instanceof Error ? e.message : String(e)) }
      );
    } catch (e) {
      // save failures (or malformed input) must surface inside the panel,
      // not vanish as an unhandled rejection
      setRunError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="border border-slate-200 rounded-md overflow-hidden">
      <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-600">🧪 测试面板（干跑匹配管线）</span>
        <button className="btn-primary text-xs ml-auto" onClick={() => void run()} disabled={preview.isPending || savePending}>
          {preview.isPending ? '运行中…' : onSaveFirst ? '保存并测试' : '运行测试'}
        </button>
      </div>
      <div className="p-3 grid grid-cols-2 gap-3">
        <div>
          <label className="label">方法</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">路径</label>
          <input className="input font-mono text-xs" value={path} onChange={(e) => setPath(e.target.value)} />
        </div>
        <div>
          <label className="label">Query（k=v&k2=v2）</label>
          <input className="input font-mono text-xs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="status=active" />
        </div>
        <div>
          <label className="label">Headers（每行 Name: value）</label>
          <textarea
            className="input font-mono text-xs"
            rows={2}
            value={headers}
            onChange={(e) => setHeaders(e.target.value)}
            placeholder={'x-api-key: 123\nx-tenant: acme'}
          />
        </div>
        <div className="col-span-2">
          <label className="label">Body（JSON）</label>
          <textarea className="input font-mono text-xs" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder='{"amount": 150}' />
        </div>
      </div>

      {runError && (
        <div className="border-t border-slate-200 p-3 bg-red-50 text-xs text-red-600">
          运行失败：{runError}
        </div>
      )}

      {result && (
        <div className="border-t border-slate-200 p-3 bg-slate-50/60 text-xs space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded font-bold ${
                result.matched ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}
            >
              {result.matched ? `命中: ${result.branch?.name}` : `未命中 (${result.reason})`}
            </span>
            <span className="text-slate-500">HTTP {result.status}</span>
            <span className="text-slate-400">{result.durationMs}ms</span>
            {result.delayMs > 0 && <span className="text-slate-400">延迟 {result.delayMs}ms</span>}
            {result.branch?.isDefault && <span className="text-amber-600">默认兜底</span>}
          </div>
          {result.errorMessage && <div className="text-red-600">{result.errorMessage}</div>}
          {result.warnings.length > 0 && (
            <div className="text-amber-600">⚠ {result.warnings.join('；')}</div>
          )}
          <div>
            <div className="text-slate-500 mb-1">响应头</div>
            <pre className="bg-white border border-slate-200 rounded p-2 overflow-auto max-h-24 text-[11px]">
              {JSON.stringify(result.headers, null, 2)}
            </pre>
          </div>
          <div>
            <div className="text-slate-500 mb-1">响应体</div>
            <pre className="bg-white border border-slate-200 rounded p-2 overflow-auto max-h-56 text-[11px] whitespace-pre-wrap break-all">
              {pretty(result.body)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function pretty(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body || '(空)';
  }
}

/** decodeURIComponent that never throws on malformed `%` sequences */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}
