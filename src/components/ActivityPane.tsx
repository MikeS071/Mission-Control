'use client';

import { SocialFeed } from './SocialFeed';

export function ActivityPane() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-gray-500 px-3 pt-3 pb-1.5">
        Activity
      </div>
      <SocialFeed />
    </div>
  );
}
