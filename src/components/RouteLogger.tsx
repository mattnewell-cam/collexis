'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { logClientEvent } from '@/lib/logging/client';

export default function RouteLogger() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastLocationRef = useRef<string | null>(null);

  useEffect(() => {
    const search = searchParams.toString();
    const location = search ? `${pathname}?${search}` : pathname;

    if (lastLocationRef.current === location) {
      return;
    }

    lastLocationRef.current = location;
    logClientEvent('info', 'navigation.page_view', {
      path: pathname,
      queryKeys: Array.from(new Set(searchParams.keys())),
    }, { sendToServer: true });
  }, [pathname, searchParams]);

  return null;
}

