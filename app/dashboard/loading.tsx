import { Screen } from "@/components/ui/Screen";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import BottomNav from "@/components/BottomNav";

// Shown instantly while the dashboard server-renders. Mirrors the real layout.
export default function DashboardLoading() {
  return (
    <>
      <Screen>
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-9 w-20 rounded-field" />
        </div>

        <Card className="p-5">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col items-center gap-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-32 w-32 rounded-full" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="flex flex-col items-center gap-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-32 w-32 rounded-full" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        </Card>

        <div className="space-y-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-11 w-full rounded-field" />
        </div>

        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-card" />
          <Skeleton className="h-16 w-full rounded-card" />
        </div>
      </Screen>
      <BottomNav />
    </>
  );
}
