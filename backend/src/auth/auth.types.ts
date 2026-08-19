export interface AccessTokenPayload {
  sub: string;
  email: string;
  type: 'access';
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  status: 'ACTIVE';
  roles: string[];
}
