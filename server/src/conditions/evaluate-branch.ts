import type { RequestContext, ResponseBranch } from '@ai-mock/shared';
import { evaluateRules } from '@ai-mock/shared';
import { runExpression } from './run-expression.js';
import { testRegexSafe } from './regex-safe.js';

export interface BranchEvalResult {
  matched: boolean;
  warning?: string;
}

export async function evaluateBranch(
  branch: ResponseBranch,
  ctx: RequestContext
): Promise<BranchEvalResult> {
  if (!branch.enabled) return { matched: false };
  switch (branch.conditionType) {
    case 'always':
      return { matched: true };
    case 'rules': {
      if (!branch.conditionRules) return { matched: true };
      const result = evaluateRules(branch.conditionRules, ctx, {
        testRegex: testRegexSafe,
      });
      return result.warning
        ? { matched: result.matched, warning: result.warning }
        : { matched: result.matched };
    }
    case 'expression': {
      if (!branch.conditionExpression?.trim()) return { matched: true };
      const result = await runExpression(
        branch.conditionExpression,
        ctx,
        ctx.env
      );
      if (result.error) {
        return { matched: false, warning: `分支 "${branch.name}" 表达式错误: ${result.error}` };
      }
      return { matched: result.value };
    }
    default:
      return { matched: false };
  }
}
