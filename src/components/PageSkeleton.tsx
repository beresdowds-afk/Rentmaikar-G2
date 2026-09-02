import { Skeleton } from "@/components/ui/skeleton";

interface PageSkeletonProps {
  variant?: "default" | "dashboard" | "form" | "list";
}

const PageSkeleton = ({ variant = "default" }: PageSkeletonProps) => {
  if (variant === "dashboard") {
    return (
      <div className="min-h-screen bg-background">
        <Skeleton className="h-16 w-full" />
        <div className="container mx-auto px-4 py-8 space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-lg" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (variant === "form") {
    return (
      <div className="min-h-screen bg-background">
        <Skeleton className="h-16 w-full" />
        <div className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-4 w-80" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div className="min-h-screen bg-background">
        <Skeleton className="h-16 w-full" />
        <div className="container mx-auto px-4 py-8 space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-full max-w-md" />
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // Default
  return (
    <div className="min-h-screen bg-background">
      <Skeleton className="h-16 w-full" />
      <div className="container mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
};

export default PageSkeleton;
