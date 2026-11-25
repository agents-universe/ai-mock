import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ResponseBranch } from '@ai-mock/shared';

interface Props {
  branches: ResponseBranch[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onToggle: (branch: ResponseBranch) => void;
  onDelete: (branch: ResponseBranch) => void;
  onAdd: () => void;
}

export function BranchFlowList({ branches, selectedId, onSelect, onReorder, onToggle, onDelete, onAdd }: Props) {
  // passing `sensors` explicitly REPLACES dnd-kit's defaults, so
  // KeyboardSensor must be registered here or the handle's aria promise
  // ("press space to pick up") is a lie
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // snap keyboard moves per sortable item — the default getter only
    // shifts 25px per keypress, which never reaches closestCenter on
    // tall cards
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  // display order: non-default by sort_order, default pinned last
  const ordered = [...branches].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? 1 : -1;
    return a.sortOrder - b.sortOrder;
  });
  const movable = ordered.filter((b) => !b.isDefault);
  const defaultBranch = ordered.find((b) => b.isDefault);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = movable.findIndex((b) => b.id === active.id);
    const newIndex = movable.findIndex((b) => b.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const ids = arrayMove(movable, oldIndex, newIndex).map((b) => b.id);
    if (defaultBranch) ids.push(defaultBranch.id);
    onReorder(ids);
  }

  function move(branch: ResponseBranch, dir: -1 | 1) {
    const ids = movable.map((b) => b.id);
    const i = ids.indexOf(branch.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    ids.splice(j, 0, ids.splice(i, 1)[0]);
    if (defaultBranch) ids.push(defaultBranch.id);
    onReorder(ids);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          响应分支（按顺序求值）
        </h3>
        <button className="btn-secondary text-xs" onClick={onAdd}>
          + 添加分支
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={movable.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-0">
            {movable.map((branch, idx) => (
              <div key={branch.id}>
                <SortableBranchCard
                  branch={branch}
                  index={idx + 1}
                  selected={branch.id === selectedId}
                  onSelect={() => onSelect(branch.id)}
                  onToggle={() => onToggle(branch)}
                  onDelete={() => onDelete(branch)}
                  onMove={(dir) => move(branch, dir)}
                />
                <div className="flex items-center gap-2 pl-4 py-1 text-[11px] text-slate-400">
                  <span className="w-px h-4 bg-slate-200 ml-3.5" />
                  不匹配 ↓
                </div>
              </div>
            ))}
          </div>
        </SortableContext>

        {defaultBranch && (
          <div>
            <BranchCardBody
              branch={defaultBranch}
              index={null}
              selected={defaultBranch.id === selectedId}
              onSelect={() => onSelect(defaultBranch.id)}
              onToggle={() => onToggle(defaultBranch)}
              onDelete={() => onDelete(defaultBranch)}
              onMove={null}
              isDefault
            />
          </div>
        )}
      </DndContext>

      {!branches.length && <p className="text-xs text-slate-400 py-3">暂无分支</p>}
    </div>
  );
}

function SortableBranchCard(props: {
  branch: ResponseBranch;
  index: number | null;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onMove: ((dir: -1 | 1) => void) | null;
  isDefault?: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id: props.branch.id,
    });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'relative z-10 shadow-lg' : undefined}
    >
      {/* dnd-kit's listeners must be spread as real DOM props — nesting
          them under {attributes, listeners} left onPointerDown unbound
          and drag-to-reorder completely dead */}
      <BranchCardBody
        {...props}
        dragHandle={{ ...attributes, ...listeners }}
        activatorRef={setActivatorNodeRef}
      />
    </div>
  );
}

function BranchCardBody({
  branch,
  index,
  selected,
  onSelect,
  onToggle,
  onDelete,
  onMove,
  isDefault,
  dragHandle,
  activatorRef,
}: {
  branch: ResponseBranch;
  index: number | null;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onMove: ((dir: -1 | 1) => void) | null;
  isDefault?: boolean;
  dragHandle?: Record<string, unknown>;
  activatorRef?: (el: HTMLElement | null) => void;
}) {
  return (
    <div
      className={`rounded-lg border p-3 cursor-pointer transition-shadow ${
        selected
          ? 'border-blue-500 ring-2 ring-blue-100 bg-blue-50/40'
          : 'border-slate-200 bg-white hover:border-slate-300'
      } ${!branch.enabled ? 'opacity-50' : ''}`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        {onMove && dragHandle && (
          <span
            {...dragHandle}
            ref={activatorRef}
            style={{ touchAction: 'none' }}
            className="cursor-grab text-slate-300 hover:text-slate-500 select-none text-sm"
            title="拖拽排序"
            onClick={(e) => e.stopPropagation()}
          >
            ⠿
          </span>
        )}
        <span className="text-[11px] font-mono text-slate-400 w-4">{isDefault ? '★' : index}</span>

        <span
          className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
            branch.conditionType === 'always'
              ? 'bg-slate-100 border-slate-200 text-slate-500'
              : branch.conditionType === 'rules'
                ? 'bg-cyan-50 border-cyan-200 text-cyan-700'
                : 'bg-indigo-50 border-indigo-200 text-indigo-700'
          }`}
          title={branch.conditionType}
        >
          {branch.conditionType === 'always' ? '始终' : branch.conditionType === 'rules' ? '规则' : 'JS 表达式'}
        </span>

        <span className="flex-1 min-w-16 text-sm font-medium text-slate-700 truncate">
          {branch.name}
        </span>

        {isDefault && (
          <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 font-medium">
            默认兜底
          </span>
        )}

        <button
          className="text-sm hover:opacity-70"
          title={branch.enabled ? '点击停用' : '点击启用'}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {branch.enabled ? '👁' : '🚫'}
        </button>
        {!isDefault && (
          <>
            {onMove && (
              <span className="flex flex-col leading-none text-slate-300">
                <button
                  className="hover:text-slate-600 px-0.5"
                  title="上移"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMove(-1);
                  }}
                >
                  ▲
                </button>
                <button
                  className="hover:text-slate-600 px-0.5"
                  title="下移"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMove(1);
                  }}
                >
                  ▼
                </button>
              </span>
            )}
            <button
              className="text-slate-300 hover:text-red-500 px-1"
              title="删除分支"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`确定删除分支「${branch.name}」？`)) onDelete();
              }}
            >
              ×
            </button>
          </>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-2 pl-7 text-[11px] text-slate-400">
        <span className="font-mono text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
          {branch.statusCode}
        </span>
        <span className="px-1.5 py-0.5 rounded border border-slate-200" title="返回体类型">
          {branch.bodyType === 'script' ? '⚡ 脚本返回体' : '{} 静态返回体'}
        </span>
        {branch.delayMs > 0 && <span>延迟 {branch.delayMs}ms</span>}
      </div>
    </div>
  );
}
