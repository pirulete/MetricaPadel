export type UserStatus = 'TEMPORARY' | 'ACTIVE' | 'LOCKED'

export interface UserProfile {
  id: string
  email: string
  firstName: string
  lastName: string
  phone: string
  status: UserStatus
  role: 'USER' | 'ADMIN'
  emailVerifiedAt?: Date | null
  avatarUrl?: string | null
  createdAt?: Date | null
}

export type UserWithProfile = UserProfile
