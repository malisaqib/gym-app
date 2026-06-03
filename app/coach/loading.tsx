import { Screen } from "@/components/ui/Screen";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import BottomNav from "@/components/BottomNav";

// Instant skeleton while /coach server-renders. Mirrors the dashboard shell.
export default function CoachLoading() {
  return (
    <>
      <Screen>
        <Card className="space-y-2 p-5">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
        </Card>
        <Card className="space-y-2 p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </Card>
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 rounded-card" />
          ))}
        </div>
        <div className="space-y-2 pt-1">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-[88px] w-full rounded-field" />
          <Skeleton className="ml-auto h-11 w-24 rounded-field" />
        </div>
      </Screen>
      <BottomNav />
    </>
  );
}
