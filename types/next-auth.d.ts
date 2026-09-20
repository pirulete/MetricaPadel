import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      firstName: string
      lastName: string
      status: string
      role: string
      phone?: string
      avatarUrl?: string | null
      requiresTermsAcceptance?: boolean
    } & DefaultSession["user"]
  }

  interface User {
    id?: string
    firstName?: string
    lastName?: string
    phone?: string
    status?: string
    role?: string
    avatarUrl?: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    firstName?: string
    lastName?: string
    status?: string
    role?: string
    avatarUrl?: string | null
    requiresTermsAcceptance?: boolean
  }
}
