import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js runs this on every request that matches the `matcher` below.
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Run on all routes EXCEPT static assets, image files, and the public SEO
  // metadata routes (sitemap.xml / robots.txt), where auth/session work would
  // just be wasted effort on crawler traffic.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
