import type { ConditionRule, RuleLeaf, RuleOp } from '@ai-mock/shared';

const OPS: { value: RuleOp; label: string }[] = [
  { value: 'eq', label: '等于' },
  { value: 'ne', label: '不等于' },
  { value: 'contains', label: '包含' },
  { value: 'not_contains', label: '不包含' },
  { value: 'starts_with', label: '前缀匹配' },
  { value: 'ends_with', label: '后缀匹配' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '小于等于' },
  { value: 'in', label: '属于(逗号分隔)' },
  { value: 'exists', label: '存在' },
  { value: 'not_exists', label: '不存在' },
  { value: 'matches', label: '正则匹配' },
];

const SOURCES = [
  { value: 'query', label: 'Query' },
  { value: 'header', label: 'Header' },
  { value: 'body', label: 'Body' },
  { value: 'params', label: '路径参数' },
  { value: 'method', label: 'Method' },
  { value: 'env', label: '环境变量' },
] as const;

const NO_VALUE_OPS: RuleOp[] = ['exists', 'not_exists'];

export function ConditionEditor({
  conditionType,
  rules,
  expression,
  onChange,
}: {
  conditionType: 'always' | 'rules' | 'expression';
  rules: ConditionRule | null;
  expression: string;
  onChange: (patch: { conditionType?: 'always' | 'rules' | 'expression'; conditionRules?: ConditionRule | null; conditionExpression?: string }) => void;
}) {
  return (
    <div>
      <div className="flex gap-1 mb-2">
        {(
          [
            { v: 'always', label: '始终匹配' },
            { v: 'rules', label: '规则条件' },
            { v: 'expression', label: 'JS 表达式' },
          ] as const
        ).map((t) => (
          <button
            key={t.v}
            className={`px-2.5 py-1 rounded text-xs border transition-colors ${
              conditionType === t.v
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
            onClick={() => onChange({ conditionType: t.v })}
          >
            {t.label}
          </button>
        ))}
      </div>

      {conditionType === 'always' && (
        <p className="text-xs text-slate-400">该分支对所有请求匹配（仍按分支顺序求值）。</p>
      )}

      {conditionType === 'rules' && (
        <RuleBuilder
          rule={
            rules ?? { type: 'group', combinator: 'and', children: [] }
          }
          onChange={(r) => onChange({ conditionRules: r })}
        />
      )}

      {conditionType === 'expression' && (
        <div>
          <textarea
            className="input font-mono text-xs"
            rows={3}
            value={expression}
            placeholder="req.query.status === 'active' && req.body.amount > 100"
            onChange={(e) => onChange({ conditionExpression: e.target.value })}
          />
          <p className="text-[11px] text-slate-400 mt-1">
            返回真值则命中该分支。可用 <code>req</code>（method/path/params/query/headers/body）、
            <code> env</code>、<code>helpers</code>、<code>faker</code>。执行出错时跳过该分支继续向下求值。
          </p>
        </div>
      )}
    </div>
  );
}

function RuleBuilder({ rule, onChange }: { rule: ConditionRule; onChange: (r: ConditionRule) => void }) {
  if (rule.type === 'rule') {
    // wrap single leaf in a group for consistent editing
    return (
      <RuleGroupEditor
        rule={{ type: 'group', combinator: 'and', children: [rule] }}
        onChange={(g) => onChange(g.type === 'group' ? g.children[0] ?? g : g)}
      />
    );
  }
  return <RuleGroupEditor rule={rule} onChange={onChange} />;
}

function RuleGroupEditor({ rule, onChange }: { rule: Extract<ConditionRule, { type: 'group' }>; onChange: (r: ConditionRule) => void }) {
  const children = rule.children ?? [];

  function updateChild(i: number, child: ConditionRule) {
    onChange({ ...rule, children: children.map((c, j) => (j === i ? child : c)) });
  }

  return (
    <div className={`rounded-md border p-2.5 ${rule.combinator === 'or' ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-slate-50/50'}`}>
      <div className="flex items-center gap-2 mb-2">
        <button
          className={`text-[11px] px-2 py-0.5 rounded border font-medium ${
            rule.combinator === 'and' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-300 text-slate-600'
          }`}
          onClick={() => onChange({ ...rule, combinator: 'and' })}
          title="所有条件都要满足"
        >
          且 AND
        </button>
        <button
          className={`text-[11px] px-2 py-0.5 rounded border font-medium ${
            rule.combinator === 'or' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white border-slate-300 text-slate-600'
          }`}
          onClick={() => onChange({ ...rule, combinator: 'or' })}
          title="任一条件满足"
        >
          或 OR
        </button>
        <label className="flex items-center gap-1 text-[11px] text-slate-500 ml-1">
          <input
            type="checkbox"
            checked={!!rule.not}
            onChange={(e) => onChange({ ...rule, not: e.target.checked || undefined })}
          />
          取反 NOT
        </label>
        <span className="ml-auto text-[11px] text-slate-400">{children.length} 条</span>
      </div>

      <div className="space-y-1.5">
        {children.map((child, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <div className="flex-1">
              {child.type === 'rule' ? (
                <RuleRow
                  leaf={child}
                  onChange={(leaf) => updateChild(i, leaf)}
                  onDelete={() => onChange({ ...rule, children: children.filter((_, j) => j !== i) })}
                />
              ) : (
                <RuleGroupEditor
                  rule={child}
                  onChange={(g) => updateChild(i, g)}
                />
              )}
            </div>
            {child.type === 'group' && (
              <button
                className="btn-danger px-2 py-1 text-xs mt-0.5"
                onClick={() => onChange({ ...rule, children: children.filter((_, j) => j !== i) })}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {!children.length && (
          <p className="text-[11px] text-slate-400 py-1">
            没有条件 —— {rule.combinator === 'and' ? '视为匹配' : '视为不匹配'}
            {rule.not ? '，取反后相反' : ''}
          </p>
        )}
      </div>

      <div className="flex gap-1.5 mt-2">
        <button
          className="btn-secondary text-[11px] py-1"
          onClick={() =>
            onChange({
              ...rule,
              children: [
                ...children,
                { type: 'rule', source: 'query', field: '', op: 'eq', value: '' },
              ],
            })
          }
        >
          + 条件
        </button>
        <button
          className="btn-secondary text-[11px] py-1"
          onClick={() =>
            onChange({
              ...rule,
              children: [...children, { type: 'group', combinator: 'and', children: [] }],
            })
          }
        >
          + 嵌套组
        </button>
      </div>
    </div>
  );
}

function RuleRow({
  leaf,
  onChange,
  onDelete,
}: {
  leaf: RuleLeaf;
  onChange: (leaf: RuleLeaf) => void;
  onDelete: () => void;
}) {
  const noValue = NO_VALUE_OPS.includes(leaf.op);
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded border border-slate-200 bg-white px-2 py-1.5">
      <select
        className="input w-auto! py-1! text-xs"
        value={leaf.source}
        onChange={(e) => onChange({ ...leaf, source: e.target.value as RuleLeaf['source'] })}
      >
        {SOURCES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <input
        className="input w-32! py-1! text-xs font-mono"
        placeholder={leaf.source === 'method' ? '(无需字段)' : '字段名'}
        value={leaf.field}
        disabled={leaf.source === 'method'}
        onChange={(e) => onChange({ ...leaf, field: e.target.value })}
      />
      <select
        className="input w-auto! py-1! text-xs"
        value={leaf.op}
        onChange={(e) => onChange({ ...leaf, op: e.target.value as RuleOp })}
      >
        {OPS.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>
      {!noValue && (
        <input
          className="input w-36! py-1! text-xs font-mono"
          placeholder="值"
          value={leaf.value === undefined || leaf.value === null ? '' : String(leaf.value)}
          onChange={(e) => {
            // keep the value as typed: coercing '007' → 7 or '200' → 200 breaks
            // eq (String compare) and in (non-string expected → empty list);
            // numeric operators coerce to number at evaluation time anyway
            onChange({ ...leaf, value: e.target.value });
          }}
        />
      )}
      <button className="text-slate-300 hover:text-red-500 ml-auto px-1" title="删除条件" onClick={onDelete}>
        ×
      </button>
    </div>
  );
}
