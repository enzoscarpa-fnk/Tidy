import type { User, CreateUserData, UserTier } from '../user.entity';

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(data: CreateUserData): Promise<User>;
  updateTier(id: string, tier: UserTier): Promise<void>;
  updateDisplayName(id: string, displayName: string): Promise<void>;
}
