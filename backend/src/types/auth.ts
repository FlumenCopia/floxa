import type { Consultant } from '@prisma/client';

export interface JWTTokenPayload {
  userId: string;
  email?: string;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export type AuthUser = Consultant;
