import { NextRequest, NextResponse } from "next/server";

import { contactSchema } from "@/lib/marketing/schemas";
import {
  checkPublicRateLimit,
  extractIP,
  rateLimitedResponse,
  rateLimitSuccessHeaders,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/public/contact
 * Valida payload con Zod (name ≤100, email, message ≤2000) + rate limit por IP.
 * v0.1: sin persistencia ni envío de email.
 */
export async function POST(request: NextRequest) {
  const ip = extractIP(request);
  const rate = checkPublicRateLimit(ip);
  if (!rate.allowed) {
    return rateLimitedResponse(rate.resetTime);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        ...rateLimitSuccessHeaders(rate.remaining, rate.resetTime),
      },
    }
  );
}
