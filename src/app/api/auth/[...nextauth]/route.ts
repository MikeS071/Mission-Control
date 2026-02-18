import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

export const { handlers: { GET, POST } } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: '/signin',
  },
  callbacks: {
    async signIn() {
      return true;
    },
  },
});
