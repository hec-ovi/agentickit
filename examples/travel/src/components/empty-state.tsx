import type { ReactNode } from "react";

interface EmptyStateProps {
  glyph?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ glyph = "?", title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="glyph" aria-hidden="true">
        {glyph}
      </span>
      <strong>{title}</strong>
      {description ? <p className="muted" style={{ margin: 0 }}>{description}</p> : null}
      {action}
    </div>
  );
}
