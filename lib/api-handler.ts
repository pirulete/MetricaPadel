import * as Sentry from "@sentry/nextjs"
import { NextResponse } from "next/server"

export async function apiHandler<T>(
  handler: () => Promise<NextResponse<T>>,
  tag: string
): Promise<NextResponse> {
  try {
    return await handler()
  } catch (error) {
    Sentry.captureException(error)
    console.error(`[${tag}]`, error) // nosemgrep: unsafe-formatstring — console.error no usa printf
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}
