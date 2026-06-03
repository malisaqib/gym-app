import { Screen } from "@/components/ui/Screen";
import { Skeleton } from "@/components/ui/Skeleton";
import BottomNav from "@/components/BottomNav";

// Instant skeleton while /coach server-renders. Mirrors MealCoach's layout.
export default function CoachLoading() {
  return (
    <>
      <Screen>
        <div className="space-y-2">
          <Skeleton className="h-9 w-52" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-[88px] w-full rounded-field" />
        <Skeleton className="ml-auto h-11 w-24 rounded-field" />
        <div className="space-y-2 pt-1">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-12 w-full rounded-field" />
          <Skeleton className="h-12 w-full rounded-field" />
          <Skeleton className="h-12 w-full rounded-field" />
        </div>
      </Screen>
      <BottomNav />
    </>
  );
}
