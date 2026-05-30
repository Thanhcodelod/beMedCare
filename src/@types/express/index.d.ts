import { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      role: Role;
      is_active: boolean;
    }
  }
}

export {};
