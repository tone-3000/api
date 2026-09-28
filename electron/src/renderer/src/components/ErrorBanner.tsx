// src/components/ErrorBanner.tsx
interface Props {
  message: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: Props) {
  return (
    <div className="error-banner" role="alert">
      <span className="error-banner-icon">⚠️</span>
      <span className="error-banner-message">{message}</span>
      {onDismiss && (
        <button className="error-banner-dismiss" onClick={onDismiss} aria-label="Dismiss">×</button>
      )}
    </div>
  );
}
