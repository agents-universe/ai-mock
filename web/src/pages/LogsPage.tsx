import { Link, useParams } from 'react-router-dom';
import { useLogs, useProject } from '../api/hooks';
import { EmptyState } from '../components/common/Modal';
import { MethodBadge } from './ProjectDetailPage';

/** time-only for today's entries, full date+time once the log crosses midnight */
function formatLogTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay ? d.toLocaleTimeString() : d.toLocaleString();
}

export function LogsPage() {
  const { projectId = '' } = useParams();
  const { data: project } = useProject(projectId);
  const { data: logs, isLoading, error } = useLogs(projectId);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
        <Link to="/" className="hover:text-blue-600">项目</Link>
        <span>/</span>
        <Link to={`/projects/${projectId}`} className="hover:text-blue-600">
          {project?.name ?? '项目'}
        </Link>
        <span>/</span>
        <span className="text-slate-600">请求日志</span>
      </div>
      <h1 className="text-xl font-bold text-slate-900 mb-4">请求日志</h1>

      {isLoading ? (
        <div className="text-slate-400 text-sm">加载中…</div>
      ) : error ? (
        // a failed query must not masquerade as "no traffic yet"
        <div className="card p-6 text-sm text-red-600">
          日志加载失败：{error instanceof Error ? error.message : String(error)}
        </div>
      ) : !logs?.length ? (
        <EmptyState title="暂无请求记录" hint="访问该项目的 Mock 地址后这里会出现日志（每 5 秒自动刷新）" />
      ) : (
        <div>
          {logs.length >= 200 && (
            <p className="text-[11px] text-slate-400 mb-2">
              仅显示最近 {logs.length} 条请求（服务端单次返回上限200 条）。
            </p>
          )}
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">时间</th>
                <th className="text-left px-3 py-2 font-medium">方法</th>
                <th className="text-left px-3 py-2 font-medium">路径</th>
                <th className="text-left px-3 py-2 font-medium">状态</th>
                <th className="text-left px-3 py-2 font-medium">耗时</th>
                <th className="text-left px-3 py-2 font-medium">结果</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-3 py-1.5 text-xs text-slate-400 font-mono">
                    {formatLogTime(log.createdAt)}
                  </td>
                  <td className="px-3 py-1.5">
                    <MethodBadge method={log.method} />
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs text-slate-600">{log.path}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">
                    {log.statusCode ?? '-'}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-slate-400">{log.durationMs ?? '-'}ms</td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`text-[11px] px-1.5 py-0.5 rounded border ${
                        log.matched
                          ? 'bg-green-50 border-green-200 text-green-700'
                          : 'bg-red-50 border-red-200 text-red-600'
                      }`}
                    >
                      {log.reason}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
