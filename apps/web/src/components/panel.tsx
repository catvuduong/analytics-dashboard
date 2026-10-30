import { ReactNode } from 'react';

interface PanelProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  testId?: string;
  className?: string;
  children: ReactNode;
}

export function Panel({ title, subtitle, actions, testId, className, children }: PanelProps) {
  return (
    <section className={`panel ${className ?? ''}`} data-testid={testId}>
      <header className="panel-header">
        <div>
          <h2 className="panel-title">{title}</h2>
          {subtitle && <p className="panel-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="panel-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

// Shared loading / error / empty states so every panel fails the same way.
export function PanelState({
  loading,
  error,
  empty,
  onRetry,
  children,
}: {
  loading: boolean;
  error?: string;
  empty: boolean;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (error) {
    return (
      <div className="state state-error" role="alert">
        <span>Could not load data: {error}</span>
        <button type="button" className="ghost-button" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  if (loading) return <div className="skeleton" aria-busy="true" aria-label="Loading" />;
  if (empty) return <div className="state">No data for this range yet.</div>;
  return <>{children}</>;
}
