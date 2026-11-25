import type { BodyType, ConditionType } from '../constants.js';
import type { ConditionRule } from '../conditions/types.js';

export interface ResponseBranch {
  id: string;
  apiId: string;
  name: string;
  sortOrder: number;
  enabled: boolean;
  conditionType: ConditionType;
  conditionRules: ConditionRule | null;
  conditionExpression: string | null;
  isDefault: boolean;
  statusCode: number;
  headers: Record<string, string>;
  delayMs: number;
  contentType: string;
  bodyType: BodyType;
  staticBody: string | null;
  script: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResponseBranchCreateInput {
  name: string;
  enabled?: boolean;
  conditionType?: ConditionType;
  conditionRules?: ConditionRule | null;
  conditionExpression?: string | null;
  isDefault?: boolean;
  statusCode?: number;
  headers?: Record<string, string>;
  delayMs?: number;
  contentType?: string;
  bodyType?: BodyType;
  staticBody?: string | null;
  script?: string | null;
}

export type ResponseBranchUpdateInput = Partial<ResponseBranchCreateInput>;
