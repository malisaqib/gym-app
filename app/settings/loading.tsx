import { Screen } from "@/components/ui/Screen";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import BottomNav from "@/components/BottomNav";

// Instant skeleton while /settings server-renders the profile.
export default function SettingsLoading() {
  return (
    <>
      <Screen>
        <Skeleton className="h-8 w-32" />
        <Card className="space-y-3 p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-44" />
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 rounded-field" />
            ))}
          </div>
          <Skeleton className="h-10 w-full rounded-field" />
        </Card>
        <Card className="space-y-2 p-5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-full rounded-field" />
        </Card>
      </Screen>
      <BottomNav />
    </>
  );
}
