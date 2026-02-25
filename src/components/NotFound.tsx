import { Link } from "@tanstack/react-router";
import { Button } from "src/components/ui/button";

export default function NotFound(): React.JSX.Element {
  return (
    <div className="flex flex-1 min-h-[50vh] items-center justify-center p-4">
      <div className="max-w-md text-center">
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <p className="text-muted-foreground mb-4">Page not found</p>
        <Button asChild>
          <Link to="/">Go Home</Link>
        </Button>
      </div>
    </div>
  );
}
