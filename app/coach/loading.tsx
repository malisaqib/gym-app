import { Screen } from "@/components/ui/Screen";
import { Skeleton } from "@/components/ui/Skeleton";
import BottomNav from "@/components/BottomNav";

export default function CoachLoading() {
  return (
    <>
      <Screen>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-24 w-full rounded-field" />
        <Skeleton className="h-11 w-24 rounded-field" />
      </Screen>
      <BottomNav />
    </>
  );
}
