export type RuleOp =
  | 'eq'
  | 'ne'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'exists'
  | 'not_exists'
  | 'matches';

export type RuleSource = 'query' | 'header' | 'body' | 'params' | 'method' | 'env';

export interface RuleLeaf {
  type: 'rule';
  source: RuleSource;
  field: string;
  op: RuleOp;
  value?: unknown;
}

export interface RuleGroup {
  type: 'group';
  combinator: 'and' | 'or';
  children: ConditionRule[];
  not?: boolean;
}

export type ConditionRule = RuleGroup | RuleLeaf;

export interface RequestContext {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, unknown>;
  headers: Record<string, string>;
  body: unknown;
  env: Record<string, string>;
}
