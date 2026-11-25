import { useEffect, useState } from 'react';
import type { DatabaseConnectionSettings } from '@ai-mock/shared';
import {
  useDatabaseSettings,
  useTestDatabaseConnection,
  useSaveDatabaseConnection,
} from '../api/hooks';
import { ErrorBanner, Field } from '../components/common/Modal';
import { ApiError } from '../api/client';

type Client = DatabaseConnectionSettings['client'];

export function SettingsDatabasePage() {
  const { data, isLoading } = useDatabaseSettings();
  const test = useTestDatabaseConnection();
  const save = useSaveDatabaseConnection();
  const envManaged = data?.source === 'env';

  const [client, setClient] = useState<Client>('sqlite');
  const [sqliteFile, setSqliteFile] = useState('./data/ai-mock.sqlite');
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState(3306);
  const [user, setUser] = useState('root');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('ai_mock');
  const [encrypt, setEncrypt] = useState(false);
  const [trust, setTrust] = useState(true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const s = data?.settings;
    if (!s) return;
    setClient(s.client);
    if (s.client === 'sqlite') {
      setSqliteFile(s.connection.filename);
    } else {
      setHost(s.connection.host);
      setPort(s.connection.port);
      setUser(s.connection.user);
      setPassword(s.connection.password);
      setDatabase(s.connection.database);
      if (s.client === 'mssql') {
        setEncrypt(s.connection.options?.encrypt ?? false);
        setTrust(s.connection.options?.trustServerCertificate ?? true);
      }
    }
  }, [data]);

  function build(): DatabaseConnectionSettings {
    if (client === 'sqlite') return { client: 'sqlite', connection: { filename: sqliteFile } };
    if (client === 'mysql') {
      return {
        client: 'mysql',
        connection: { host, port, user, password, database },
      };
    }
    return {
      client: 'mssql',
      connection: {
        host,
        port: port || 1433,
        user,
        password,
        database,
        options: { encrypt, trustServerCertificate: trust },
      },
    };
  }

  function pickClient(c: Client) {
    if (c !== client) {
      // never carry a masked password ('******') across engines — the server
      // only un-masks when the client stays the same, so a stale mask would
      // be submitted as the literal password
      setPassword('');
    }
    setClient(c);
    if (c === 'mysql') setPort(3306);
    if (c === 'mssql') setPort(1433);
    setMessage(null);
  }

  if (isLoading) return <div className="p-6 text-slate-400 text-sm">加载中…</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-slate-900 mb-1">数据库设置</h1>
      <p className="text-xs text-slate-400 mb-5">
        配置存储项目/环境/API/分支数据的数据库，支持 SQLite、MySQL、SQL Server (2021+)。切换引擎后会自动执行表结构迁移，但
        <b className="text-amber-600"> 不会迁移已有数据</b>。
      </p>

      <div className="grid grid-cols-3 gap-3 mb-5">
        {(
          [
            { v: 'sqlite', label: 'SQLite', desc: '单文件，零依赖' },
            { v: 'mysql', label: 'MySQL', desc: '独立数据库服务' },
            { v: 'mssql', label: 'SQL Server', desc: '2016+ (含 2021)' },
          ] as const
        ).map((c) => (
          <button
            key={c.v}
            className={`card p-4 text-left transition-colors ${
              client === c.v ? 'border-blue-500 ring-2 ring-blue-100' : 'hover:border-slate-300'
            }`}
            onClick={() => pickClient(c.v)}
          >
            <div className="font-semibold text-sm text-slate-800">{c.label}</div>
            <div className="text-xs text-slate-400 mt-0.5">{c.desc}</div>
          </button>
        ))}
      </div>

      <div className="card p-5">
        <ErrorBanner message={save.error instanceof ApiError ? save.error.message : null} />
        {envManaged && (
          <div className="mb-3 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-sm px-3 py-2">
            当前数据库配置由 <code>AIMOCK_DB_*</code> 环境变量接管：界面保存会在运行期间生效，但
            <b>重启后会被环境变量覆盖</b>。如需持久生效请调整环境变量或移除后再保存。
          </div>
        )}

        {client === 'sqlite' && (
          <Field label="数据库文件路径">
            <input className="input font-mono" value={sqliteFile} onChange={(e) => setSqliteFile(e.target.value)} />
          </Field>
        )}

        {client !== 'sqlite' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="主机">
              <input className="input font-mono" value={host} onChange={(e) => setHost(e.target.value)} />
            </Field>
            <Field label="端口">
              <input
                className="input font-mono"
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
              />
            </Field>
            <Field label="用户名">
              <input className="input font-mono" value={user} onChange={(e) => setUser(e.target.value)} />
            </Field>
            <Field label="密码">
              <input
                className="input font-mono"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="未修改时保持不变"
              />
            </Field>
            <Field label="数据库名">
              <input className="input font-mono" value={database} onChange={(e) => setDatabase(e.target.value)} />
            </Field>
            {client === 'mssql' && (
              <div className="flex items-end gap-4 pb-2">
                <label className="flex items-center gap-1.5 text-sm text-slate-600">
                  <input type="checkbox" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} />
                  加密 (encrypt)
                </label>
                <label className="flex items-center gap-1.5 text-sm text-slate-600">
                  <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} />
                  信任服务器证书
                </label>
              </div>
            )}
          </div>
        )}

        {message && (
          <div
            className={`mt-2 rounded-md border px-3 py-2 text-sm ${
              message.ok
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button
            className="btn-secondary"
            disabled={test.isPending}
            onClick={() =>
              test.mutate(build(), {
                onSuccess: (r) => setMessage({ ok: r.ok, text: `${r.message} (${r.latencyMs}ms)` }),
                onError: (e) => setMessage({ ok: false, text: String(e.message) }),
              })
            }
          >
            {test.isPending ? '测试中…' : '测试连接'}
          </button>
          <button
            className="btn-primary"
            disabled={save.isPending}
            onClick={() =>
              save.mutate(build(), {
                onSuccess: () => setMessage({ ok: true, text: '已保存并应用，迁移执行完成' }),
                onError: (e) =>
                  setMessage({ ok: false, text: e instanceof ApiError ? e.message : String(e) }),
              })
            }
          >
            {save.isPending ? '保存并迁移中…' : '保存并应用'}
          </button>
        </div>
      </div>
    </div>
  );
}
