import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js runs this on every request that matches the `matcher` below.
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Run on all routes EXCEPT static assets and image files, where auth work
  // would just be wasted effort.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
