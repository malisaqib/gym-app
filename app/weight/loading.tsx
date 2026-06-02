import { Screen } from "@/components/ui/Screen";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import BottomNav from "@/components/BottomNav";

export default function WeightLoading() {
  return (
    <>
      <Screen>
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-9 w-32" />
        <Card className="p-4">
          <Skeleton className="h-32 w-full" />
        </Card>
        <Skeleton className="h-11 w-full rounded-field" />
        <div className="space-y-2">
          <Skeleton className="h-10 w-full rounded-card" />
          <Skeleton className="h-10 w-full rounded-card" />
        </div>
      </Screen>
      <BottomNav />
    </>
  );
}
