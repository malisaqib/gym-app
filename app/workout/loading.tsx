import { Screen } from "@/components/ui/Screen";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import BottomNav from "@/components/BottomNav";

export default function WorkoutLoading() {
  return (
    <>
      <Screen>
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-10 w-full rounded-field" />
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="space-y-3 p-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-52" />
              <Skeleton className="h-11 w-full rounded-field" />
            </Card>
          ))}
        </div>
      </Screen>
      <BottomNav />
    </>
  );
}
