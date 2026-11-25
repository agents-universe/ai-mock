import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ResponseBranch } from '@ai-mock/shared';
import {
  useApiDetail,
  useProject,
  useUpdateApi,
  useUpdateBranch,
  useCreateBranch,
  useDeleteBranch,
  useReorderBranches,
  useEnvironments,
} from '../api/hooks';
import { MethodBadge } from './ProjectDetailPage';
import { BranchFlowList } from '../components/branches/BranchFlowList';
import { ConditionEditor } from '../components/branches/ConditionEditor';
import { ScriptEditor } from '../components/script/ScriptEditor';
import { ScriptTestPanel } from '../components/script/ScriptTestPanel';
import { CopyButton, ErrorBanner, Field } from '../components/common/Modal';
import { ApiError } from '../api/client';

export function ApiEditorPage() {
  const { projectId = '', apiId = '' } = useParams();
  const navigate = useNavigate();
  const { data: api, isLoading, error } = useApiDetail(apiId);
  const { data: project } = useProject(projectId);
  const { data: envs } = useEnvironments(projectId);
  const updateApi = useUpdateApi(apiId);
  const updateBranch = useUpdateBranch(apiId);
  const createBranch = useCreateBranch(apiId);
  const deleteBranch = useDeleteBranch(apiId);
  const reorderBranches = useReorderBranches(apiId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ResponseBranch | null>(null);
  const [branchDirty, setBranchDirty] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [envId, setEnvId] = useState('');

  // top-level API fields
  const [name, setName] = useState('');
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [apiDirty, setApiDirty] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // initialize top-level form fields only when the API identity changes —
  // re-running on every refetch would silently discard unsaved edits
  // (e.g. saving a branch invalidates the query and used to reset the path)
  useEffect(() => {
    if (!api) return;
    setName(api.name);
    setMethod(api.method);
    setPath(api.path);
    setEnabled(api.enabled);
    setApiDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api?.id]);

  // keep the branch selection valid as branches come and go
  useEffect(() => {
    if (!api) return;
    if (selectedId && !api.branches.some((b) => b.id === selectedId)) {
      // the selected branch vanished (deleted in another tab) — jumping to
      // another branch would silently discard unsaved edits, so confirm
      if (
        branchDirty &&
        !window.confirm('当前分支已不存在（可能已被删除），切换到第一个分支？未保存的修改将丢失。')
      ) {
        return; // keep the stale id; the draft stays visible until the user decides
      }
      setSelectedId(api.branches[0]?.id ?? null);
      return;
    }
    if (!selectedId && api.branches.length > 0) {
      setSelectedId(api.branches[0].id);
    }
  }, [api, selectedId, branchDirty]);

  useEffect(() => {
    if (!envs?.length) return;
    setEnvId((cur) => (cur && envs.some((e) => e.id === cur) ? cur : envs[0].id));
  }, [envs]);

  const selected = useMemo(
    () => api?.branches.find((b) => b.id === selectedId) ?? null,
    [api, selectedId]
  );

  // reset the draft when switching to another branch
  useEffect(() => {
    if (selected) {
      // same branch already on screen (e.g. onAdd race: draft set before
      // the refetch populated the cache) — never clobber local edits here;
      // server-side resync of the same id is the second effect's job
      if (draft && draft.id === selected.id) return;
      setDraft(structuredClone(selected));
      setBranchDirty(false);
      setBranchError(null);
    } else if (!selectedId) {
      // only clear when nothing is selected — after onAdd the new branch
      // isn't in the cache yet (selectedId set, selected still null), and
      // clearing here would flash the empty panel and remount Monaco
      setDraft(null);
    }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // refresh the draft from the server copy when the *same* branch changed
  // server-side (e.g. toggled from the list) and there are no local edits,
  // so the detail panel never shows stale data
  useEffect(() => {
    if (!selected || branchDirty) return;
    setDraft(structuredClone(selected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  function selectBranch(id: string) {
    if (branchDirty && !window.confirm('当前分支有未保存的修改，切换将丢弃。继续？')) return;
    setSelectedId(id);
  }

  async function saveBranch(): Promise<void> {
    if (!draft) return;
    setBranchError(null);
    try {
      await updateBranch.mutateAsync({
        id: draft.id,
        name: draft.name,
        enabled: draft.enabled,
        conditionType: draft.conditionType,
        conditionRules: draft.conditionRules,
        conditionExpression: draft.conditionExpression,
        statusCode: draft.statusCode,
        headers: draft.headers,
        delayMs: draft.delayMs,
        contentType: draft.contentType,
        bodyType: draft.bodyType,
        staticBody: draft.staticBody,
        script: draft.script,
      });
      setBranchDirty(false);
    } catch (e) {
      setBranchError(e instanceof ApiError ? e.message : String(e));
      throw e;
    }
  }

  function patchDraft(patch: Partial<ResponseBranch>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setBranchDirty(true);
  }

  async function saveApi() {
    setApiError(null);
    try {
      await updateApi.mutateAsync({ name, method, path, enabled });
      setApiDirty(false);
    } catch (e) {
      setApiError(e instanceof ApiError ? e.message : String(e));
      // rethrow so callers (e.g. 保存并测试) don't proceed on stale data
      throw e;
    }
  }

  if (isLoading) return <div className="p-6 text-slate-400 text-sm">加载中…</div>;
  if (error) return <div className="p-6 text-red-600 text-sm">{(error as Error).message}</div>;
  if (!api) return null;

  const selectedEnv = envs?.find((e) => e.id === envId);
  const projectKey = project?.slug ?? projectId;
  const mockUrl = selectedEnv
    ? `${window.location.origin}/mock/${projectKey}/${selectedEnv.slug}${path}`
    : '';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
        <Link to="/" className="hover:text-blue-600">项目</Link>
        <span>/</span>
        <Link to={`/projects/${projectId}`} className="hover:text-blue-600">
          {projectId.slice(0, 8)}…
        </Link>
        <span>/</span>
        <span className="text-slate-600">API 编辑器</span>
      </div>

      {/* top bar */}
      <div className="card p-4 mb-4">
        <ErrorBanner message={apiError} />
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-28">
            <label className="label">方法</label>
            <select
              className="input font-mono"
              value={method}
              onChange={(e) => {
                setMethod(e.target.value);
                setApiDirty(true);
              }}
            >
              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-64">
            <label className="label">路径</label>
            <input
              className="input font-mono"
              value={path}
              onChange={(e) => {
                setPath(e.target.value);
                setApiDirty(true);
              }}
            />
          </div>
          <div className="w-52">
            <label className="label">名称</label>
            <input
              className="input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setApiDirty(true);
              }}
            />
          </div>
          <label className="flex items-center gap-1.5 text-sm text-slate-600 pb-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked);
                setApiDirty(true);
              }}
            />
            启用
          </label>
          <button className="btn-primary" disabled={!apiDirty || updateApi.isPending} onClick={() => void saveApi().catch(() => {})}>
            {updateApi.isPending ? '保存中…' : apiDirty ? '保存 *' : '已保存'}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-slate-400">Mock 地址：</span>
          {envs && envs.length > 0 ? (
            <>
              <select className="input w-32! py-1! text-xs" value={envId} onChange={(e) => setEnvId(e.target.value)}>
                {envs.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <code className="flex-1 truncate text-xs bg-slate-100 rounded px-2 py-1.5 font-mono text-slate-600">
                {mockUrl}
              </code>
              <CopyButton text={mockUrl} label="复制" />
            </>
          ) : (
            <span className="text-xs text-amber-600">该项目还没有环境，先到项目页创建环境</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-start">
        {/* left: branch flow */}
        <div className="card p-3 lg:sticky lg:top-16">
          <BranchFlowList
            branches={api.branches}
            selectedId={selectedId}
            onSelect={selectBranch}
            onReorder={(ids) => reorderBranches.mutate(ids)}
            onToggle={(b) =>
              updateBranch.mutate(
                { id: b.id, enabled: !b.enabled },
                {
                  onSuccess: (updated) => {
                    // keep the open draft in sync for this field so a later
                    // save doesn't overwrite the toggle with a stale value
                    setDraft((d) =>
                      d && d.id === updated.id ? { ...d, enabled: updated.enabled } : d
                    );
                  },
                }
              )
            }
            onDelete={(b) =>
              deleteBranch.mutate(b.id, {
                onSuccess: () => {
                  if (selectedId === b.id) setSelectedId(null);
                },
              })
            }
            onAdd={() => {
              // same dirty check as selectBranch — don't silently discard edits
              if (branchDirty && !window.confirm('当前分支有未保存的修改，添加将丢弃。继续？')) return;
              createBranch.mutate(
                { name: `分支 ${api.branches.length + 1}`, conditionType: 'always', statusCode: 200, bodyType: 'static', staticBody: '{}' },
                {
                  onSuccess: (b) => {
                    setSelectedId(b.id);
                    setDraft(structuredClone(b));
                    setBranchDirty(false);
                  },
                }
              );
            }}
          />
          <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
            请求按顺序匹配分支，第一条命中即返回；全部不命中时走 ★ 默认分支。
          </p>
        </div>

        {/* right: branch detail */}
        <div className="space-y-4">
          {!draft ? (
            <div className="card p-8 text-center text-sm text-slate-400">选择左侧的一个分支开始编辑</div>
          ) : (
            <>
              <div className="card p-4">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-sm font-semibold text-slate-700">分支详情</h3>
                  {draft.isDefault && (
                    <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      默认兜底（不参与顺序求值，最后生效）
                    </span>
                  )}
                  <button
                    className="btn-primary ml-auto"
                    disabled={!branchDirty || updateBranch.isPending}
                    onClick={() => void saveBranch().catch(() => {})}
                  >
                    {updateBranch.isPending ? '保存中…' : branchDirty ? '保存分支 *' : '分支已保存'}
                  </button>
                </div>
                <ErrorBanner message={branchError} />

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <Field label="分支名称">
                    <input className="input" value={draft.name} onChange={(e) => patchDraft({ name: e.target.value })} />
                  </Field>
                  <Field label="启用">
                    <select
                      className="input"
                      value={draft.enabled ? '1' : '0'}
                      onChange={(e) => patchDraft({ enabled: e.target.value === '1' })}
                    >
                      <option value="1">启用</option>
                      <option value="0">停用</option>
                    </select>
                  </Field>
                </div>

                <label className="label">匹配条件</label>
                <ConditionEditor
                  conditionType={draft.conditionType}
                  rules={draft.conditionRules}
                  expression={draft.conditionExpression ?? ''}
                  onChange={(patch) =>
                    patchDraft({
                      conditionType: patch.conditionType ?? draft.conditionType,
                      conditionRules: patch.conditionRules !== undefined ? patch.conditionRules : draft.conditionRules,
                      conditionExpression:
                        patch.conditionExpression !== undefined ? patch.conditionExpression : draft.conditionExpression,
                    })
                  }
                />
              </div>

              {/* response config */}
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">响应配置</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Field label="状态码">
                    <NumberInput
                      className="input font-mono"
                      value={draft.statusCode}
                      min={100}
                      max={599}
                      onCommit={(n) => patchDraft({ statusCode: n })}
                    />
                  </Field>
                  <Field label="延迟 (ms)">
                    <NumberInput
                      className="input font-mono"
                      value={draft.delayMs}
                      min={0}
                      max={60000}
                      onCommit={(n) => patchDraft({ delayMs: n })}
                    />
                  </Field>
                  <Field label="Content-Type">
                    <input
                      className="input font-mono"
                      value={draft.contentType}
                      onChange={(e) => patchDraft({ contentType: e.target.value })}
                    />
                  </Field>
                  <Field label="返回体类型">
                    <select
                      className="input"
                      value={draft.bodyType}
                      onChange={(e) => patchDraft({ bodyType: e.target.value as ResponseBranch['bodyType'] })}
                    >
                      <option value="static">静态内容</option>
                      <option value="script">JS 脚本</option>
                    </select>
                  </Field>
                </div>

                <HeadersEditor
                  key={draft.id}
                  headers={draft.headers}
                  onChange={(headers) => patchDraft({ headers })}
                />
              </div>

              {/* body editor */}
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">
                  {draft.bodyType === 'script' ? '响应脚本（return 的值作为返回体）' : '静态返回体'}
                </h3>
                {draft.bodyType === 'script' ? (
                  <>
                    <ScriptEditor
                      key={draft.id}
                      value={draft.script ?? ''}
                      onChange={(v) => patchDraft({ script: v })}
                      height="300px"
                    />
                    <div className="mt-2 text-[11px] text-slate-400 leading-relaxed bg-slate-50 rounded p-2">
                      脚本在独立沙箱中异步执行（超时 2s），可用：
                      <code className="mx-1">req</code>·<code className="mx-1">env</code>·
                      <code className="mx-1">faker</code>·
                      <code className="mx-1">helpers.uuid()/randomInt()/pick()/sleep()…</code>
                      以及 <code>setStatus(code)</code>、<code>setHeader(k,v)</code>、<code>delay(ms)</code>。
                      示例：<code className="mx-1">{'return { id: helpers.uuid(), email: faker.internet.email() };'}</code>
                    </div>
                  </>
                ) : (
                  <ScriptEditor
                    key={draft.id}
                    language="json"
                    value={draft.staticBody ?? ''}
                    onChange={(v) => patchDraft({ staticBody: v })}
                    height="300px"
                  />
                )}
              </div>

              <ScriptTestPanel
                apiId={apiId}
                apiPath={path}
                apiMethod={method}
                onSaveFirst={branchDirty || apiDirty ? async () => { if (apiDirty) await saveApi(); if (branchDirty) await saveBranch(); } : undefined}
                savePending={updateApi.isPending || updateBranch.isPending}
              />
            </>
          )}
        </div>
      </div>

      <div className="mt-6">
        <button className="btn-secondary text-xs" onClick={() => navigate(`/projects/${projectId}`)}>
          ← 返回 API 列表
        </button>
      </div>
    </div>
  );
}

/**
 * Numeric input that allows clearing while typing: an empty box does not
 * commit 0 (or NaN) to the draft — the last valid value is kept until a new
 * valid number is typed, and blurring an empty box restores the display.
 */
function NumberInput({
  value,
  min,
  max,
  className,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  className?: string;
  onCommit: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const lastCommitted = useRef(value);

  // resync when the value changes from the outside (e.g. draft switch)
  useEffect(() => {
    if (value !== lastCommitted.current) {
      lastCommitted.current = value;
      setText(String(value));
    }
  }, [value]);

  return (
    <input
      className={className}
      type="number"
      min={min}
      max={max}
      value={text}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t === '') return; // clearing is fine — don't commit anything yet
        const n = Number(t);
        if (!Number.isNaN(n) && n >= min && n <= max) {
          lastCommitted.current = n;
          onCommit(n);
        }
      }}
      onBlur={() => {
        // restore the committed value for BOTH empty and out-of-range text —
        // otherwise the box keeps showing 650 while draft still holds 200
        const n = Number(text);
        if (text === '' || Number.isNaN(n) || n < min || n > max) {
          setText(String(lastCommitted.current));
        }
      }}
    />
  );
}

function HeadersEditor({
  headers,
  onChange,
}: {
  headers: Record<string, string>;
  onChange: (headers: Record<string, string>) => void;
}) {
  // local row list: allows adding rows even when an empty-key row exists
  // (the Record alone can't represent two rows with the same key)
  const [rows, setRows] = useState<[string, string][]>(() => Object.entries(headers));

  function push(next: [string, string][]) {
    setRows(next);
    // empty-key rows are in-progress edits only — they can't be persisted
    // (server rejects empty header names) and must not block saving
    const entries = next.filter(([k]) => k.trim() !== '');
    // last-wins on duplicate keys (JSON objects can't hold duplicates);
    // duplicate non-empty keys are highlighted below so it's not silent
    onChange(Object.fromEntries(entries));
  }

  const duplicateKeys = new Set(
    rows.map(([k]) => k.trim()).filter((k, i, arr) => k !== '' && arr.indexOf(k) !== i)
  );

  return (
    <div className="mt-1">
      <label className="label">自定义响应头</label>
      <div className="space-y-1.5 mb-2">
        {rows.map(([k, v], i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              className={`input flex-1 font-mono text-xs ${duplicateKeys.has(k.trim()) ? 'border-red-400' : ''}`}
              value={k}
              onChange={(e) => {
                const next = rows.map((r, j) => (j === i ? ([e.target.value, r[1]] as [string, string]) : r));
                push(next);
              }}
            />
            <input
              className="input flex-1 font-mono text-xs"
              value={v}
              onChange={(e) => {
                const next = rows.map((r, j) => (j === i ? ([r[0], e.target.value] as [string, string]) : r));
                push(next);
              }}
            />
            <button
              className="btn-danger px-2"
              onClick={() => push(rows.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
        {duplicateKeys.size > 0 && (
          <p className="text-[11px] text-red-600">存在重复的响应头名称，保存时同名头只会保留最后一个。</p>
        )}
      </div>
      <button className="btn-secondary text-xs" onClick={() => push([...rows, ['', '']])}>
        + 添加响应头
      </button>
    </div>
  );
}
