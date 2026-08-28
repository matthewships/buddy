/** Renders a submission error, or nothing. */
export function ErrorText({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="text-sm text-danger" aria-live="polite">
      {message}
    </p>
  );
}
