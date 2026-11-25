import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  useProject,
  useApis,
  useCreateApi,
  useDeleteApi,
  useUpdateApi,
  useEnvironments,
  useCreateEnvironment,
  useUpdateEnvironment,
  useDeleteEnvironment,
} from '../api/hooks';
import type { Environment, MockApi } from '@ai-mock/shared';
import { Modal, Field, EmptyState, ConfirmButton, CopyButton, ErrorBanner } from '../components/common/Modal';
import { ApiError } from '../api/client';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

export function ProjectDetailPage() {
  const { projectId = '' } = useParams();
  const { data: project, isLoading, error } = useProject(projectId);
  const [tab, setTab] = useState<'apis' | 'envs'>('apis');

  if (isLoading) return <div className="p-6 text-slate-400 text-sm">加载中…</div>;
  if (error)
    return (
      <div className="p-6 text-red-600 text-sm">
        加载失败：{error instanceof Error ? error.message : String(error)}
      </div>
    );
  if (!project) return null;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
        <Link to="/" className="hover:text-blue-600">
          项目
        </Link>
        <span>/</span>
        <span className="text-slate-600">{project.name}</span>
        <Link to={`/projects/${projectId}/logs`} className="ml-auto btn-secondary text-xs">
          查看日志
        </Link>
      </div>
      <div className="flex items-baseline gap-3">
        <h1 className="text-xl font-bold text-slate-900">{project.name}</h1>
        <code className="text-xs text-slate-400 font-mono">{project.slug}</code>
      </div>

      <div className="flex gap-1 mt-4 border-b border-slate-200">
        <Tab active={tab === 'apis'} onClick={() => setTab('apis')}>
          API 列表 ({project.apiCount})
        </Tab>
        <Tab active={tab === 'envs'} onClick={() => setTab('envs')}>
          环境 ({project.envCount})
        </Tab>
      </div>

      <div className="mt-4">{tab === 'apis' ? <ApisTab projectId={projectId} /> : <EnvsTab projectId={projectId} projectSlug={project.slug} />}</div>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
        active
          ? 'border-blue-600 text-blue-700 font-medium'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

// ---------- APIs tab ----------

function ApisTab({ projectId }: { projectId: string }) {
  const { data: apis, isLoading } = useApis(projectId);
  const create = useCreateApi(projectId);
  const del = useDeleteApi(projectId);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          + 新建 API
        </button>
      </div>
      {isLoading ? (
        <div className="text-slate-400 text-sm">加载中…</div>
      ) : !apis?.length ? (
        <EmptyState title="还没有 API" hint="创建一个 API 并配置它的响应分支" />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">方法</th>
                <th className="text-left px-3 py-2 font-medium">路径</th>
                <th className="text-left px-3 py-2 font-medium">名称</th>
                <th className="text-left px-3 py-2 font-medium">分支数</th>
                <th className="text-left px-3 py-2 font-medium">状态</th>
                <th className="text-right px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {apis.map((api) => (
                <ApiRow key={api.id} api={api} projectId={projectId} onDelete={() => del.mutate(api.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <ApiFormModal
          onClose={() => setShowCreate(false)}
          pending={create.isPending}
          error={create.error instanceof ApiError ? create.error.message : null}
          onSubmit={(body) => create.mutate(body, { onSuccess: () => setShowCreate(false) })}
        />
      )}
    </div>
  );
}

function ApiRow({
  api,
  projectId,
  onDelete,
}: {
  api: MockApi;
  projectId: string;
  onDelete: () => void;
}) {
  // hook must be called during render, not inside the toggle handler
  const update = useUpdateApi(api.id);
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/60">
      <td className="px-3 py-2">
        <MethodBadge method={api.method} />
      </td>
      <td className="px-3 py-2">
        <Link to={`/projects/${projectId}/apis/${api.id}`} className="font-mono text-blue-700 hover:underline">
          {api.path}
        </Link>
      </td>
      <td className="px-3 py-2 text-slate-700">{api.name}</td>
      <td className="px-3 py-2 text-slate-500">{api.branchCount ?? '-'}</td>
      <td className="px-3 py-2">
        <button
          onClick={() => update.mutate({ enabled: !api.enabled })}
          className={`text-xs px-2 py-0.5 rounded-full border ${
            api.enabled ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-100 border-slate-200 text-slate-400'
          }`}
        >
          {api.enabled ? '启用' : '停用'}
        </button>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="inline-flex gap-1.5">
          <Link to={`/projects/${projectId}/apis/${api.id}`} className="btn-secondary text-xs">
            编辑
          </Link>
          <ConfirmButton onConfirm={onDelete} className="btn-danger text-xs">
            删除
          </ConfirmButton>
        </div>
      </td>
    </tr>
  );
}

export function MethodBadge({ method }: { method: string }) {
  const color: Record<string, string> = {
    GET: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    POST: 'bg-blue-100 text-blue-700 border-blue-200',
    PUT: 'bg-amber-100 text-amber-700 border-amber-200',
    PATCH: 'bg-purple-100 text-purple-700 border-purple-200',
    DELETE: 'bg-red-100 text-red-700 border-red-200',
    HEAD: 'bg-slate-100 text-slate-600 border-slate-200',
    OPTIONS: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded border text-[11px] font-bold font-mono ${color[method] ?? color.HEAD}`}>
      {method}
    </span>
  );
}

function ApiFormModal({
  onClose,
  onSubmit,
  error,
  pending,
}: {
  onClose: () => void;
  onSubmit: (body: { name: string; method: string; path: string }) => void;
  error: string | null;
  pending: boolean;
}) {
  const [name, setName] = useState('');
  const [method, setMethod] = useState<string>('GET');
  const [path, setPath] = useState('/api/');
  return (
    <Modal title="新建 API" onClose={onClose}>
      <ErrorBanner message={error} />
      <Field label="名称 *">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="用户详情" />
      </Field>
      <div className="grid grid-cols-[110px_1fr] gap-3">
        <Field label="方法 *">
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="路径 *（支持 :参数 与 * 通配）">
          <input className="input font-mono" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/api/users/:id" />
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-secondary" onClick={onClose}>
          取消
        </button>
        <button
          className="btn-primary"
          disabled={!name || !path.startsWith('/') || pending}
          onClick={() => onSubmit({ name, method, path })}
        >
          {pending ? '创建中…' : '创建'}
        </button>
      </div>
    </Modal>
  );
}

// ---------- Environments tab ----------

function EnvsTab({ projectId, projectSlug }: { projectId: string; projectSlug: string }) {
  const { data: envs, isLoading } = useEnvironments(projectId);
  const create = useCreateEnvironment(projectId);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          + 新建环境
        </button>
      </div>
      {isLoading ? (
        <div className="text-slate-400 text-sm">加载中…</div>
      ) : !envs?.length ? (
        <EmptyState title="还没有环境" hint="环境用于区分 dev/test 等，变量可被响应脚本读取" />
      ) : (
        <div className="space-y-3">
          {envs.map((env) => (
            <EnvCard key={env.id} env={env} projectId={projectId} projectSlug={projectSlug} />
          ))}
        </div>
      )}
      {showCreate && (
        <EnvFormModal
          onClose={() => setShowCreate(false)}
          pending={create.isPending}
          error={create.error instanceof ApiError ? create.error.message : null}
          onSubmit={(body) => create.mutate(body, { onSuccess: () => setShowCreate(false) })}
        />
      )}
    </div>
  );
}

function EnvCard({ env, projectId, projectSlug }: { env: Environment; projectId: string; projectSlug: string }) {
  const update = useUpdateEnvironment(projectId);
  const del = useDeleteEnvironment(projectId);
  const [editing, setEditing] = useState(false);
  const mockBase = `${window.location.origin}/mock/${projectSlug}/${env.slug}`;
  const varCount = Object.keys(env.variables).length;

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <span className="font-semibold text-slate-800">{env.name}</span>
          <code className="ml-2 text-xs text-slate-400 font-mono">{env.slug}</code>
          <span className="ml-3 text-xs text-slate-400">{varCount} 个变量</span>
        </div>
        <button className="btn-secondary text-xs" onClick={() => setEditing(true)}>
          编辑
        </button>
        <ConfirmButton onConfirm={() => del.mutate(env.id)} className="btn-danger text-xs">
          删除
        </ConfirmButton>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 truncate text-xs bg-slate-100 rounded px-2 py-1 font-mono text-slate-500">
          {mockBase}/
        </code>
        <CopyButton text={`${mockBase}/`} label="复制基址" />
      </div>
      {varCount > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(env.variables).map(([k, v]) => (
            <span key={k} className="text-[11px] bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 font-mono text-slate-600">
              {k}={v}
            </span>
          ))}
        </div>
      )}
      {editing && (
        <EnvFormModal
          env={env}
          onClose={() => setEditing(false)}
          pending={update.isPending}
          error={update.error instanceof ApiError ? update.error.message : null}
          onSubmit={(body) => update.mutate({ id: env.id, ...body }, { onSuccess: () => setEditing(false) })}
        />
      )}
    </div>
  );
}

function EnvFormModal({
  env,
  onClose,
  onSubmit,
  error,
  pending,
}: {
  env?: Environment;
  onClose: () => void;
  onSubmit: (body: { slug: string; name: string; variables: Record<string, string> }) => void;
  error: string | null;
  pending: boolean;
}) {
  const [name, setName] = useState(env?.name ?? '');
  const [slug, setSlug] = useState(env?.slug ?? '');
  const [vars, setVars] = useState<{ k: string; v: string }[]>(
    Object.entries(env?.variables ?? {}).map(([k, v]) => ({ k, v }))
  );

  const variables = Object.fromEntries(vars.filter((r) => r.k.trim()).map((r) => [r.k.trim(), r.v]));
  // mirror slugSchema from shared — catch invalid slugs before the round-trip
  const nameValid = name.length >= 1 && name.length <= 255;
  const slugValid = /^[a-z0-9][a-z0-9-]*$/.test(slug) && slug.length <= 64;
  const showSlugHint = slug.length > 0 && !slugValid;

  return (
    <Modal title={env ? '编辑环境' : '新建环境'} onClose={onClose}>
      <ErrorBanner message={error} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="名称 *">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="开发环境" />
        </Field>
        <Field label="Slug *">
          <input className="input font-mono" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="dev" />
          {showSlugHint && (
            <p className="text-[11px] text-red-600 mt-1">
              只能包含小写字母、数字和连字符，且以字母或数字开头（≤64 字符）
            </p>
          )}
        </Field>
      </div>
      <label className="label">环境变量（脚本中通过 env.KEY 读取）</label>
      <div className="space-y-1.5 mb-2">
        {vars.map((row, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="input flex-1 font-mono"
              placeholder="KEY"
              value={row.k}
              onChange={(e) => setVars(vars.map((r, j) => (j === i ? { ...r, k: e.target.value } : r)))}
            />
            <input
              className="input flex-1 font-mono"
              placeholder="value"
              value={row.v}
              onChange={(e) => setVars(vars.map((r, j) => (j === i ? { ...r, v: e.target.value } : r)))}
            />
            <button className="btn-danger px-2" onClick={() => setVars(vars.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        ))}
      </div>
      <button className="btn-secondary text-xs" onClick={() => setVars([...vars, { k: '', v: '' }])}>
        + 添加变量
      </button>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-secondary" onClick={onClose}>
          取消
        </button>
        <button
          className="btn-primary"
          disabled={!nameValid || !slugValid || pending}
          onClick={() => onSubmit({ slug, name, variables })}
        >
          {pending ? '保存中…' : '保存'}
        </button>
      </div>
    </Modal>
  );
}
