import { ErrorComponent } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';

export default function DefaultCatchBoundary({ error }: ErrorComponentProps): React.JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
        <ErrorComponent error={error} />
      </div>
    </div>
  );
}
