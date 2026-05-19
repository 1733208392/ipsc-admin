import type { UserRole } from './auth.js';

declare global {
  namespace Express {
    interface User {
      id: number;
      username: string;
      role: UserRole;
      club_id: number | null;
      name: string;
      phone: string | null;
      status: 'active' | 'inactive';
      created_at: string;
      updated_at: string;
      last_login_at: string | null;
    }

    interface Request {
      user?: User;
    }
  }
}

export {};
