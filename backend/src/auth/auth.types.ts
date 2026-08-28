import { Role } from '@prisma/client';

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
};

export type JwtPayload = {
  sub: string;
  email: string;
  role: Role;
  typ: 'access';
};
