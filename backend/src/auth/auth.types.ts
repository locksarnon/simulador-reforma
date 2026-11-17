import { Role } from '@prisma/client';
import type { Efetivas } from '../permissoes/permissoes';

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  /** Nível de acesso e permissões que valem (calculados a cada pedido pelo JwtStrategy). */
  nivel?: string;
  permissoes?: Efetivas;
};

export type JwtPayload = {
  sub: string;
  email: string;
  role: Role;
  typ: 'access';
};
