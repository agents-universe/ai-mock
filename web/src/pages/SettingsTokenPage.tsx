import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, getAuthToken, setAuthToken } from '../api/client';
import { ErrorBanner, Field } from '../components/common/Modal';

interface TokenView {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  source: 'env' | 'file';
}

interface CreatedToken extends TokenView {
  token: string;
}

/**
 *访问 Token 管理：
 * - 服务端 token 列表（创建/吊销）—— 创建后 /api 与 /mcp 开始要求鉴权
 * - 本浏览器使用的 token（localStorage）—— 由 fetch 自动附加
 */
export function SettingsTokenPage() {
  const qc = useQueryClient();
  const tokens = useQuery({
    queryKey: ['tokens'],
    queryFn: () => api.get<TokenView[]>('/api/tokens'),
  });

  const [name, setName] = useState('');
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [browserToken, setBrowserToken] = useState(getAuthToken() ?? '');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setBrowserToken(getAuthToken() ?? '');
  }, []);

  const create = useMutation({
    mutationFn: (n: string) => api.post<CreatedToken>('/api/tokens', { name: n }),
    onSuccess: (t) => {
      setCreated(t);
      setName('');
      setMessage({ ok: true, text: `已创建「${t.name}」，明文仅显示一次` });
      qc.invalidateQueries({ queryKey: ['tokens'] });
    },
    onError: (e) =>
      setMessage({ ok: false, text: e instanceof ApiError ? e.message : String(e) }),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/api/tokens/${id}`),
    onSuccess: () => {
      setMessage({ ok: true, text: '已吊销' });
      qc.invalidateQueries({ queryKey: ['tokens'] });
    },
    onError: (e) =>
      setMessage({ ok: false, text: e instanceof ApiError ? e.message : String(e) }),
  });

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-slate-900 mb-1">访问 Token</h1>
      <p className="text-xs text-slate-400 mb-5">
        配置任意一个 token 后，<code>/api</code> 与 <code>/mcp</code> 端点即要求
        <code> Authorization: Bearer &lt;token&gt;</code>；<code>/mock</code> 默认仍开放。
        未配置任何 token 时全部开放（仅限本机开发）。
      </p>

      {message && (
        <div
          className={`mb-4 rounded-md border px-3 py-2 text-sm ${
            message.ok
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {created && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 font-mono break-all">
          {created.token}
        </div>
      )}

      <div className="card p-5 mb-4">
        <h2 className="font-semibold text-sm text-slate-800 mb-3">服务端 token</h2>
        <ErrorBanner message={tokens.error instanceof ApiError ? tokens.error.message : null} />
        <div className="flex gap-2 mb-3">
          <input
            className="input flex-1"
            placeholder="名称，如 mcp-agent / ci-runner"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="btn-primary"
            disabled={!name || create.isPending}
            onClick={() => create.mutate(name)}
          >
            {create.isPending ? '创建中…' : '创建'}
          </button>
        </div>
        <ul className="divide-y divide-slate-100">
          {(tokens.data ?? []).map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="font-mono text-slate-500">{t.prefix}</span>
              <span className="text-slate-800">{t.name}</span>
              <span className="text-xs text-slate-400">
                {t.source === 'env' ? 'AIMOCK_TOKEN' : t.createdAt.slice(0, 19).replace('T', ' ')}
              </span>
              {t.source === 'file' && (
                <button
                  className="ml-auto text-xs text-red-600 hover:underline"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(t.id)}
                >
                  吊销
                </button>
              )}
              {t.source === 'env' && (
                <span className="ml-auto text-xs text-slate-400">环境变量管理</span>
              )}
            </li>
          ))}
          {(tokens.data ?? []).length === 0 && !tokens.isLoading && (
            <li className="py-2 text-sm text-slate-400">暂无 token（当前未启用鉴权）</li>
          )}
        </ul>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-sm text-slate-800 mb-1">本浏览器使用的 token</h2>
        <p className="text-xs text-slate-400 mb-3">
          保存后所有管理请求会自动附加 Authorization 头。
        </p>
        <Field label="Bearer token">
          <input
            className="input font-mono"
            type="password"
            value={browserToken}
            onChange={(e) => setBrowserToken(e.target.value)}
            placeholder="留空表示不携带（鉴权关闭时可用）"
          />
        </Field>
        <div className="flex gap-2 mt-3">
          <button
            className="btn-primary"
            onClick={() => {
              setAuthToken(browserToken.trim() || null);
              setMessage({
                ok: true,
                text: browserToken.trim() ? '已保存到 localStorage' : '已清除',
              });
            }}
          >
            保存
          </button>
          <button
            className="btn-secondary"
            onClick={() => {
              setAuthToken(null);
              setBrowserToken('');
              setMessage({ ok: true, text: '已清除' });
            }}
          >
            清除
          </button>
        </div>
      </div>
    </div>
  );
}
