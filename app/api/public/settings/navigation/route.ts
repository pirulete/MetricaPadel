import { NextResponse } from "next/server";

import { getCachedNavigation, PUBLIC_CACHE_HEADERS } from "@/lib/marketing/cache";

export const runtime = "nodejs";

/** GET /api/public/settings/navigation — siteName, logo, navLinks, footerLinks (caché tag `navigation`). */
export async function GET() {
  const navigation = await getCachedNavigation();
  return NextResponse.json(navigation, { headers: PUBLIC_CACHE_HEADERS });
}
