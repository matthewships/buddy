/** The web stand-in for React Native's `ActivityIndicator`. */
export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent align-[-0.125em]"
      style={{ width: size, height: size }}
    />
  );
}

/** A full-height centred spinner, as used while the session or a screen loads. */
export function LoadingScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-muted text-ink-subtle">
      <Spinner size={24} />
    </div>
  );
}
