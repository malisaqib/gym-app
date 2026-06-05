import { Screen } from "@/components/ui/Screen";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import BottomNav from "@/components/BottomNav";

// Instant skeleton while /diet server-renders + loads the saved plan.
export default function DietLoading() {
  return (
    <>
      <Screen>
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Card className="space-y-3 p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-11 w-full rounded-field" />
          <Skeleton className="h-9 w-32 rounded-field" />
        </Card>
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="space-y-2 p-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-10 w-full rounded-field" />
            <Skeleton className="h-10 w-3/4 rounded-field" />
          </Card>
        ))}
      </Screen>
      <BottomNav />
    </>
  );
}
