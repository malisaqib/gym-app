import { Screen } from "@/components/ui/Screen";
import { Skeleton } from "@/components/ui/Skeleton";
import BottomNav from "@/components/BottomNav";

export default function WeightLoading() {
  return (
    <div className="fitness min-h-screen bg-background">
      <Screen>
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>

        {/* Hero: ring + current weight */}
        <div className="flex items-center gap-5 rounded-card-xl border border-border p-5">
          <Skeleton className="h-[104px] w-[104px] rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>

        <Skeleton className="h-44 w-full rounded-card-lg" />
        <Skeleton className="h-11 w-full rounded-field" />
        <div className="space-y-2.5">
          <Skeleton className="h-11 w-full rounded-card-lg" />
          <Skeleton className="h-11 w-full rounded-card-lg" />
        </div>
      </Screen>
      <BottomNav />
    </div>
  );
}
