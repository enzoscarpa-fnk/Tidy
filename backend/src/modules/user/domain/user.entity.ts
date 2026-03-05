import type { UserTier, UserStatus } from '@prisma/client';

export { UserTier, UserStatus };

export class User {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly passwordHash: string,
    public readonly displayName: string,
    public readonly tier: UserTier,
    public readonly status: UserStatus,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}

export interface CreateUserData {
  email: string;
  passwordHash: string;
  displayName: string;
}
