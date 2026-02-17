import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

export const { handlers: { GET, POST } } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn() {
      // allow any google account — tighten later if needed
      return true;
    },
  },
});
