import { Screen } from "@/components/ui/Screen";
import { Skeleton } from "@/components/ui/Skeleton";
import BottomNav from "@/components/BottomNav";

// Shown instantly while the dashboard server-renders. Mirrors the new layout
// (deep-black theme, ring hero + macro tiles).
export default function DashboardLoading() {
  return (
    <div className="fitness min-h-screen bg-background">
      <Screen>
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-9 w-20 rounded-field" />
        </div>

        {/* Week strip */}
        <div className="flex justify-between gap-1.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-14 flex-1 rounded-card-lg" />
          ))}
        </div>

        {/* Ring hero */}
        <div className="flex flex-col items-center gap-6">
          <Skeleton className="h-[248px] w-[248px] rounded-full" />
          <div className="grid w-full grid-cols-3 gap-3">
            <Skeleton className="h-20 rounded-card-lg" />
            <Skeleton className="h-20 rounded-card-lg" />
            <Skeleton className="h-20 rounded-card-lg" />
          </div>
        </div>

        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-11 w-full rounded-field" />
        </div>

        <div className="space-y-2.5">
          <Skeleton className="h-16 w-full rounded-card-lg" />
          <Skeleton className="h-16 w-full rounded-card-lg" />
        </div>
      </Screen>
      <BottomNav />
    </div>
  );
}
