import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useProjects, useCreateProject, useDeleteProject, type ProjectWithCounts } from '../api/hooks';
import { Modal, EmptyState, Field, ConfirmButton, CopyButton, ErrorBanner } from '../components/common/Modal';
import { ApiError } from '../api/client';

export function ProjectListPage() {
  const { data: projects, isLoading, error } = useProjects();
  const create = useCreateProject();
  const del = useDeleteProject();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);

  if (isLoading) return <div className="p-6 text-slate-400 text-sm">加载中…</div>;
  if (error) return <div className="p-6 text-red-600 text-sm">{(error as Error).message}</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">项目</h1>
          <p className="text-xs text-slate-400 mt-0.5">每个项目可包含多个环境与 API，通过路径前缀暴露 Mock 地址</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          + 新建项目
        </button>
      </div>

      {!projects?.length ? (
        <EmptyState
          title="还没有项目"
          hint="创建第一个 Mock 项目开始使用"
          action={
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              + 新建项目
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onDelete={() => {
                if (window.confirm(`确定删除项目「${p.name}」？`)) {
                  del.mutate(p.id, { onSuccess: () => navigate(0) });
                }
              }}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <ProjectFormModal
          onClose={() => setShowCreate(false)}
          onSubmit={(body) =>
            create.mutate(body, {
              onSuccess: (project) => {
                setShowCreate(false);
                navigate(`/projects/${project.id}`);
              },
            })
          }
          error={create.error instanceof ApiError ? create.error.message : null}
          pending={create.isPending}
        />
      )}
    </div>
  );
}

function ProjectCard({ project, onDelete }: { project: ProjectWithCounts; onDelete: () => void }) {
  const mockBase = `${window.location.origin}/mock/${project.slug}/{envSlug}`;
  return (
    <div className="card p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/projects/${project.id}`} className="group">
          <h2 className="font-semibold text-slate-900 group-hover:text-blue-600">{project.name}</h2>
          <p className="text-xs text-slate-400 mt-0.5 font-mono">{project.slug}</p>
        </Link>
        <ConfirmButton onConfirm={onDelete}>删除</ConfirmButton>
      </div>
      <div className="mt-3 flex gap-4 text-xs text-slate-500">
        <span>
          <b className="text-slate-700">{project.apiCount}</b> 个 API
        </span>
        <span>
          <b className="text-slate-700">{project.envCount}</b> 个环境
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 truncate text-xs bg-slate-100 rounded px-2 py-1 font-mono text-slate-500">
          {mockBase}
        </code>
        <CopyButton text={mockBase} />
      </div>
    </div>
  );
}

function ProjectFormModal({
  onClose,
  onSubmit,
  error,
  pending,
}: {
  onClose: () => void;
  onSubmit: (body: { slug: string; name: string; description?: string }) => void;
  error: string | null;
  pending: boolean;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');

  // mirror slugSchema / name rules from shared so invalid input is caught
  // before the round-trip (server would only answer a generic 400)
  const nameValid = name.length >= 1 && name.length <= 255;
  const slugValid = /^[a-z0-9][a-z0-9-]*$/.test(slug) && slug.length <= 64;
  const showSlugHint = slug.length > 0 && !slugValid;

  return (
    <Modal title="新建项目" onClose={onClose}>
      <ErrorBanner message={error} />
      <Field label="名称 *">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="订单服务" />
      </Field>
      <Field label="Slug *（用于 Mock URL：/mock/{slug}/...）">
        <input
          className="input font-mono"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          placeholder="orders"
        />
        {showSlugHint && (
          <p className="text-[11px] text-red-600 mt-1">
            只能包含小写字母、数字和连字符，且以字母或数字开头（≤64 字符）
          </p>
        )}
      </Field>
      <Field label="描述">
        <textarea
          className="input"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-secondary" onClick={onClose}>
          取消
        </button>
        <button
          className="btn-primary"
          disabled={!nameValid || !slugValid || pending}
          onClick={() => onSubmit({ slug, name, description: description || undefined })}
        >
          {pending ? '创建中…' : '创建'}
        </button>
      </div>
    </Modal>
  );
}
