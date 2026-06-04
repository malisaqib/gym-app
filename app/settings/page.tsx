import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { Screen } from "@/components/ui/Screen";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { SupportResources } from "@/components/SupportResources";
import BudgetFitnessMode from "@/app/coach/BudgetFitnessMode";
import BottomNav from "@/components/BottomNav";
import type { Lang } from "@/lib/database.types";

// Protected by its own auth check (same pattern as other pages).
export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferred_language")
    .eq("id", user.id)
    .single();
  const lang = (profile?.preferred_language as Lang) ?? "en";

  return (
    <>
      <Screen>
        <PageHeader title="Settings" />
        {/* Budget set once here; editable anytime (self-contained, localStorage). */}
        <BudgetFitnessMode lang={lang} />
        <SupportResources />
        <form action={signOut}>
          <Button type="submit" variant="secondary" fullWidth>
            Sign out
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground break-all">{user.email}</p>
      </Screen>
      <BottomNav />
    </>
  );
}
