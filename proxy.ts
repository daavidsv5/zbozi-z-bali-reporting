import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

// Edge-safe proxy — neimportuje fs/bcrypt/path
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
