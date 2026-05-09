import { fmtCurrency } from "../lib/format";
import type { Preferences } from "../data/types";

interface BudgetBarProps {
  total: number;
  spent: number;
  currency: Preferences["currency"];
}

export function BudgetBar({ total, spent, currency }: BudgetBarProps) {
  const ratio = total > 0 ? Math.min(1, spent / total) : 0;
  const overspent = spent > total;
  return (
    <div className="budget-bar" aria-label="Budget">
      <div className="track">
        <div
          className="fill"
          style={{
            width: `${ratio * 100}%`,
            background: overspent ? "var(--danger)" : undefined,
          }}
        />
      </div>
      <div className="totals">
        <span>{fmtCurrency(spent, currency)} spent</span>
        <span>{fmtCurrency(total, currency)} budget</span>
      </div>
    </div>
  );
}
