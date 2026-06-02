import Link from "next/link";

// Public landing page at "/". No auth required.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-12">
      <div className="space-y-3 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          Desi Fitness Coach
        </h1>
        <p className="text-slate-600">
          Fitness made simple for beginners. Get your daily calorie and protein
          targets, then log food in plain language — roti, daal, or a burger.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Link
          href="/signup"
          className="rounded-lg bg-emerald-600 px-4 py-3 text-center font-medium text-white transition hover:bg-emerald-700"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-slate-300 px-4 py-3 text-center font-medium text-slate-700 transition hover:bg-slate-100"
        >
          I already have an account
        </Link>
      </div>
    </main>
  );
}
