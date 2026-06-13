import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoMark } from "@/components/brand/Logo";

// Public landing page at "/". Signed-in users skip straight to the app.
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-12">
      <div className="space-y-3 text-center">
        {/* App logo (vector). The matching raster icons in /public are generated
            from the same mark via scripts/gen-icons.ts. */}
        <LogoMark size={88} className="mx-auto rounded-[22%] shadow-elevated" title="Zorfit logo" />
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Zorfit
        </h1>
        <p className="text-muted-foreground">
          Fitness made simple for beginners. Get your daily calorie and protein
          targets, then log food in plain language — roti, daal, or a burger.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Link
          href="/signup"
          className="rounded-field bg-primary px-4 py-3 text-center font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.98]"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="rounded-field border border-border px-4 py-3 text-center font-medium text-foreground transition hover:bg-muted active:scale-[0.98]"
        >
          I already have an account
        </Link>
      </div>
    </main>
  );
}
