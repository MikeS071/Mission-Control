'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

function initialsFromEmail(email?: string | null) {
  const source = email?.trim() || 'User';
  const [first, second] = source.split(/[@.\s_-]+/);
  return `${(first?.[0] || 'U').toUpperCase()}${(second?.[0] || '').toUpperCase()}`;
}

export function UserAvatarMenu({ email, image }: { email?: string | null; image?: string | null }) {
  const initials = initialsFromEmail(email);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="h-10 w-10 overflow-hidden rounded-full border border-gray-700 bg-gray-800 text-sm font-semibold text-white">
          {image ? <img src={image} alt="Profile" className="h-full w-full object-cover" /> : <span>{initials}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link href="/dashboard/profile">Profile</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/billing">Billing</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/connect">Connect Gateway</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut({ callbackUrl: '/signin' })}>Sign Out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
