import { Skeleton } from "@/components/ui/Skeleton";

export default function OnboardingLoading() {
  return (
    <main className="mx-auto flex h-screen max-w-md flex-col gap-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-7 w-40 rounded-pill" />
      </div>
      <Skeleton className="h-16 w-3/4 self-start rounded-2xl" />
      <Skeleton className="h-12 w-2/3 self-start rounded-2xl" />
      <div className="mt-auto flex gap-2">
        <Skeleton className="h-11 flex-1 rounded-field" />
      </div>
    </main>
  );
}
