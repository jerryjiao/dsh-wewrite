import { Button, DisclosureRow } from '@deepseek-ai/dsh-client-ui-primitives';
import { useState } from 'react';
import { CodeChip, EmptyState } from './bits';
import { Icon } from './Icon';

/**
 * 门禁报告（DESIGN §4.2 GateReport）：
 * 3xl 分数（唯一 32px 场景）+ 失败规则行（中文名 + 等宽内部 ID + 定位 + 单项修复）。
 * 报告数据源：契约 v0.1 的 RunSummary 无 steps/report 明细——report 为 undefined 时
 * 呈现真实空态（不伪造分数/规则）；契约扩展 runs 明细后此组件直接点亮（见回传 verdict）。
 */

/** 门禁报告规则行（中文名 + 等宽内部 ID + 定位 + 明细）。 */
export interface GateRuleView {
  ruleId: string;
  name: string;
  status: 'passed' | 'failed';
  detail?: string;
  location?: string;
}

/** 门禁报告视图（gates 步产物投影）。 */
export interface GateReportView {
  score: number;
  passed: boolean;
  rules: GateRuleView[];
}

export function GateReport({
  report,
  onLocate,
  onFixOne,
  onFixAll,
  fixing,
}: {
  report: GateReportView | undefined;
  onLocate: (ruleId: string) => void;
  onFixOne: (ruleId: string) => void;
  onFixAll: () => void;
  fixing: boolean;
}) {
  const [passedOpen, setPassedOpen] = useState(false);

  if (!report) {
    return (
      <EmptyState
        icon={<Icon name="shield" size={20} />}
        title="门禁明细（分数与逐条规则）将随运行记录回传后出现在这里；推送阻断已按最近一次运行状态生效。"
      />
    );
  }

  const failed = report.rules.filter((rule) => rule.status === 'failed');
  const passed = report.rules.filter((rule) => rule.status !== 'failed');
  const passedLabel = passed.map((rule) => rule.name).join(' / ');

  return (
    <div className="ww-gate">
      <div className="ww-gate__head">
        <span className={report.passed ? 'ww-gate__score ww-gate__score--pass' : 'ww-gate__score ww-gate__score--fail'}>
          {report.score}
          <span className="ww-gate__denominator">/100</span>
        </span>
        <div className="ww-gate__verdict">
          {report.passed ? (
            <p className="ww-gate__pass-line">
              <Icon name="shield-check" size={16} /> 门禁通过，可直接推送。
            </p>
          ) : (
            <p className="ww-gate__fail-line">
              <Icon name="shield-alert" size={16} /> {failed.length} 项未过
            </p>
          )}
          {passed.length > 0 ? (
            <div className="ww-gate__passed">
              <DisclosureRow
                icon={<Icon name="list-checks" size={16} />}
                title={`已过 ${passed.length} 项`}
                open={passedOpen}
                expandable
                onToggle={() => setPassedOpen((open) => !open)}
              >
                <p className="ww-gate__passed-list">{passedLabel}</p>
              </DisclosureRow>
            </div>
          ) : null}
        </div>
      </div>
      {failed.length > 0 ? (
        <ul className="ww-gate__rules">
          {failed.map((rule) => (
            <li key={rule.ruleId} className="ww-gate__rule">
              <div className="ww-gate__rule-head">
                <Icon name="triangle-alert" size={16} />
                <span className="ww-gate__rule-name">{rule.name}</span>
                <CodeChip className="ww-gate__rule-id">{rule.ruleId}</CodeChip>
              </div>
              {rule.detail ? <p className="ww-gate__rule-detail">{rule.detail}</p> : null}
              {rule.location ? <p className="ww-gate__rule-location">{rule.location}</p> : null}
              <div className="ww-gate__rule-actions">
                {rule.location ? (
                  <Button variant="ghost" size="sm" onClick={() => onLocate(rule.ruleId)}>
                    定位到段落
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" icon={<Icon name="wand-sparkles" size={16} />} onClick={() => onFixOne(rule.ruleId)}>
                  AI 修这稿
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {failed.length > 0 ? (
        <div className="ww-gate__foot">
          <Button variant="primary" size="sm" className="ww-btn-accent" icon={<Icon name="wand-sparkles" size={16} />} onClick={onFixAll} disabled={fixing}>
            AI 修这稿（全部）
          </Button>
          <span className="ww-gate__foot-hint">只重写问题段落，已通过部分保留，改动以 diff 展示。</span>
        </div>
      ) : null}
    </div>
  );
}
