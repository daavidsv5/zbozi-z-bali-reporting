import type { NextAuthConfig } from 'next-auth';

// Rozšíření typů — platí i pro auth.ts a proxy.ts
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
      email: string;
      name: string;
    };
  }
  interface User {
    role: string;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    role?: string;
    id?: string;
  }
}

/**
 * Edge-safe konfigurace — bez fs/path/bcrypt.
 * Importuje se v proxy.ts (middleware).
 */
export const authConfig = {
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt' as const,
    maxAge:    8 * 60 * 60, // 8 hodin
    updateAge: 60 * 60,     // obnovit token každou hodinu
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isLoginPage = nextUrl.pathname === '/login';
      const isAdminRoute = nextUrl.pathname.startsWith('/admin');
      const isAuthApi = nextUrl.pathname.startsWith('/api/auth');

      if (isAuthApi) return true;
      if (!isLoggedIn && !isLoginPage) return false;
      if (isLoggedIn && isLoginPage) {
        return Response.redirect(new URL('/dashboard', nextUrl));
      }
      if (isAdminRoute && auth?.user?.role !== 'admin') {
        return Response.redirect(new URL('/dashboard', nextUrl));
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id as string;
      }
      return token;
    },
    session({ session, token }) {
      if (token) {
        session.user.role = token.role ?? '';
        session.user.id = token.id ?? '';
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
