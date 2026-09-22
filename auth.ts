import NextAuth, { type NextAuthConfig } from "next-auth";
import { skipCSRFCheck } from "@auth/core";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { db } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { emailSchema } from "@/lib/auth/schemas";
import { isBcryptHash, comparePassword } from "@/lib/auth/password";
import { requiresTermsAcceptance } from "@/lib/db/queries/terms";
import { getSessionConfig } from "@/lib/db/queries/session-config";

// During Vercel build, env vars from project settings are NOT available (only at runtime).
// So we always generate an ephemeral secret if NEXTAUTH_SECRET is missing. NextAuth will
// use the runtime-injected secret from Vercel env vars in production.
if (!process.env.NEXTAUTH_SECRET) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  process.env.NEXTAUTH_SECRET = require('crypto').randomBytes(32).toString('hex')
}

export const runtime = "nodejs";

const credentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(6),
});

// Función separada que importa dinámicamente módulos que necesitan Node.js
async function validateCredentials(email: string, password: string) {
  try {
    const normalizedEmail = email.toLowerCase();
    console.log("[auth] Validando credenciales para:", normalizedEmail);

    const user = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });

    if (!user) {
      return null;
    }

    // P1 (fix): el authorize es el punto único de verdad del login. Un usuario
    // LOCKED no debe poder autenticarse por credenciales (el route /api/auth/signin
    // lo bloqueaba antes; ahora también se bloquea aquí).
    if (user.status === 'LOCKED') {
      return null;
    }

    // F3 (fix CredentialsSignin): validar que el hash sea bcrypt antes de compare.
    // bcrypt.compare() lanza con hashes inválidos/corruptos; el guard permite
    // distinguir "contraseña incorrecta" de "hash corrupto en DB".
    if (!isBcryptHash(user.passwordHash)) {
      console.error("[auth] Hash de contraseña inválido para usuario:", normalizedEmail,
        "- prefix:", user.passwordHash ? user.passwordHash.slice(0, 4) : "(null)");
      return null;
    }

    // F4 (fix CredentialsSignin): comparePassword loggea errores de bcrypt en
    // lugar de tragar silenciosamente, y nunca lanza (false → CredentialsSignin).
    const passwordsMatch = await comparePassword(password, user.passwordHash);

    if (!passwordsMatch) {
      console.log("[auth] Contraseña no coincide para:", normalizedEmail);
      return null;
    }

    const sessionToken = randomUUID();
    // TTL configurable vía session_config (DB) o env SESSION_ACCESS_TOKEN_TTL.
    // Fallback 15 min si la tabla no existe o la query falla.
    let sessionTtlMinutes = 15;
    try {
      const config = await getSessionConfig();
      sessionTtlMinutes = config.accessTokenTtl;
    } catch { /* default 15min */ }
    const SESSION_TIMEOUT = sessionTtlMinutes * 60 * 1000;
    const expiresAt = new Date(Date.now() + SESSION_TIMEOUT);

    await db.insert(sessions).values({
      userId: user.id,
      token: sessionToken,
      expiresAt: expiresAt,
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      phone: user.phone || "",
      status: user.status,
      role: user.role,
      avatarUrl: user.avatarUrl || null,
      sessionToken: sessionToken,
    };
  } catch (error) {
    // F4 (fix CredentialsSignin): no tragar errores silenciosamente. Se loggea
    // el error (incluye stack) pero NUNCA la contraseña — solo el email.
    console.error("[auth] Error validando credenciales para:", email, error);
    return null;
  }
}

// Función para obtener usuario actualizado por ID
async function getUserById(id: string) {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, id),
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      phone: user.phone || "",
      status: user.status,
      role: user.role,
      avatarUrl: user.avatarUrl || null,
    };
  } catch (error) {
    console.error("[auth] Error obteniendo usuario por ID:", error);
    return null;
  }
}

export const authConfig = {
  providers: [
    Credentials({
      async authorize(credentials) {
        console.log("[auth] Auth authorize called with credentials:", {
          email: credentials?.email,
          hasPassword: !!credentials?.password
        });
        const parsedCredentials = credentialsSchema.safeParse(credentials);

        if (!parsedCredentials.success) {
          console.log("[auth] Credenciales no válidas según schema:", parsedCredentials.error);
          return null;
        }

        const { email, password } = parsedCredentials.data;

        const user = await validateCredentials(email, password);

        if (user) {
          console.log("[auth] Usuario encontrado y autenticado:", user.email, "status:", user.status);
        } else {
          console.log("[auth] Usuario no encontrado o contraseña incorrecta para:", email);
        }

        return user;
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    // JWT cookie lives long (30 days). Real expiry is controlled by the DB session
    // sliding window + session_config TTL. This is the standard pattern for
    // persistent sessions with NextAuth: long-lived JWT + DB session as the real gate.
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  trustHost: true,
  // CSRF check: Solo desactivar en desarrollo
  skipCSRFCheck: (process.env.NODE_ENV === "development" ? skipCSRFCheck : undefined) as any,
  callbacks: {
    async jwt({ token, user }) {
      // Si es un login inicial, usar los datos del user
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.firstName = user.firstName;
        token.lastName = user.lastName;
        token.status = user.status;
        token.role = user.role;
        token.avatarUrl = user.avatarUrl || null;
        // @ts-expect-error - sessionToken added to JWT for session management, not in base type
        token.sessionToken = user.sessionToken;
        return token;
      }

      // Si ya hay un token, intentar obtener datos frescos desde la BD.
      if (token?.id) {
        const freshUser = await getUserById(token.id as string);
        if (freshUser) {
          token.email = freshUser.email;
          token.firstName = freshUser.firstName;
          token.lastName = freshUser.lastName;
          token.status = freshUser.status;
          token.role = freshUser.role;
          token.avatarUrl = freshUser.avatarUrl || null;
        }

        // Terms & Conditions check: set flag if ACTIVE user hasn't accepted current terms
        // Wrapped in try-catch: if terms_versions table or is_blocking column doesn't exist yet
        // (migration pending), degrade gracefully — don't break login.
        if (freshUser?.status === 'ACTIVE') {
          try {
            const needsTerms = await requiresTermsAcceptance(token.id as string);
            token.requiresTermsAcceptance = needsTerms;
          } catch {
            token.requiresTermsAcceptance = false;
          }
        } else {
          token.requiresTermsAcceptance = false;
        }

        // Validate session token dynamically
        if (token.sessionToken) {
           const activeSession = await db.query.sessions.findFirst({
             where: eq(sessions.token, token.sessionToken as string)
           });

           if (!activeSession) {
             return null; // Kill JWT Session immediately
           }

           // Sliding Session Logic: Update last activity AND extend expiresAt
           let sessionTtlMs = 15 * 60 * 1000; // 15 min default
           try {
             const config = await getSessionConfig();
             sessionTtlMs = config.accessTokenTtl * 60 * 1000;
           } catch { /* use default */ }
           const newExpiresAt = new Date(Date.now() + sessionTtlMs);

           await db.update(sessions)
             .set({
               lastActivityAt: new Date(),
               expiresAt: newExpiresAt
             })
             .where(eq(sessions.token, token.sessionToken as string));
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (!session.user) return session;

      session.user.id = token.id as string;
      session.user.email = token.email as string;
      session.user.firstName = token.firstName as string;
      session.user.lastName = token.lastName as string;
      session.user.status = token.status as string;
      session.user.role = token.role as string;
      session.user.avatarUrl = (token.avatarUrl as string | null | undefined) ?? null;
      session.user.requiresTermsAcceptance = (token.requiresTermsAcceptance as boolean) ?? false;

      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
