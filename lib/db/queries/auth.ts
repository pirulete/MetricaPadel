import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { users, emailVerifications } from "@/lib/db/schema";
import bcrypt from "bcryptjs";

export async function getUserByEmail(email: string) {
  return await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });
}

export async function getUserById(id: string) {
  return await db.query.users.findFirst({
    where: eq(users.id, id),
  });
}

export async function updateUserAvatar(userId: string, avatarUrl: string | null) {
  return await db
    .update(users)
    .set({
      avatarUrl,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

// Crea usuario con estado TEMPORARY (requiere verificación de email)
export async function createUser(
  email: string,
  firstName: string,
  lastName: string,
  password: string,
  status: string = "TEMPORARY"
) {
  // Defensa en profundidad: los emails siempre se persisten en minúscula
  const normalizedEmail = email.toLowerCase();
  const passwordHash = await bcrypt.hash(password, 10);

  return await db.insert(users).values({
    email: normalizedEmail,
    firstName,
    lastName,
    passwordHash,
    status,
  });
}

export async function updateUserPassword(email: string, passwordHash: string) {
  return await db
    .update(users)
    .set({
      passwordHash,
      updatedAt: new Date(),
    })
    .where(eq(users.email, email.toLowerCase()));
}

export async function verifyAndUpdatePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean }> {
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) {
    throw new Error("Usuario no encontrado");
  }

  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) {
    throw new Error("La contraseña actual no es correcta");
  }

  const newHash = await bcrypt.hash(newPassword, 10);

  await db
    .update(users)
    .set({ passwordHash: newHash, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return { success: true };
}

export async function updateUserProfile(
  id: string,
  data: {
    firstName?: string;
    lastName?: string;
    phone?: string;
  }
) {
  return await db
    .update(users)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(users.id, id));
}

export async function verifyUserEmail(id: string) {
  return await db
    .update(users)
    .set({
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, id));
}

export async function createEmailVerification(
  email: string,
  code: string,
  expiresAt: Date
) {
  await db.delete(emailVerifications).where(eq(emailVerifications.email, email));

  return await db.insert(emailVerifications).values({
    email,
    code,
    expiresAt,
  });
}

export async function getEmailVerification(email: string, code: string) {
  return await db.query.emailVerifications.findFirst({
    where: (table, { and, eq }) => and(eq(table.email, email), eq(table.code, code)),
  });
}

export async function deleteEmailVerification(email: string) {
  return await db
    .delete(emailVerifications)
    .where(eq(emailVerifications.email, email));
}

export async function updateStatus(email: string, status: string) {
  return await db
    .update(users)
    .set({
      status: status,
      updatedAt: new Date(),
    })
    .where(eq(users.email, email.toLowerCase()));
}

export async function incrementFailedAttempts(email: string) {
  const user = await getUserByEmail(email);
  if (!user) return null;

  const newAttempts = (user.failedAttempts || 0) + 1;

  await db
    .update(users)
    .set({
      failedAttempts: newAttempts,
      updatedAt: new Date(),
    })
    .where(eq(users.email, email.toLowerCase()));

  return newAttempts;
}

export async function resetFailedAttempts(email: string) {
  return await db
    .update(users)
    .set({
      failedAttempts: 0,
      updatedAt: new Date(),
    })
    .where(eq(users.email, email.toLowerCase()));
}
