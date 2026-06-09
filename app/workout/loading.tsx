import { Screen } from "@/components/ui/Screen";
import { Skeleton } from "@/components/ui/Skeleton";
import BottomNav from "@/components/BottomNav";

export default function WorkoutLoading() {
  return (
    <div className="fitness min-h-screen bg-background">
      <Screen>
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-40 w-full rounded-card-xl" />
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-3 rounded-card-lg border border-border p-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-52" />
              <Skeleton className="h-11 w-full rounded-field" />
            </div>
          ))}
        </div>
      </Screen>
      <BottomNav />
    </div>
  );
}
