import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { useEffect, useRef } from 'react';

function liveHubUrl() {
  const api = import.meta.env.DEV ? '/api' : (import.meta.env.VITE_API_URL || '/api');
  if (/^https?:\/\//i.test(api)) {
    return `${api.replace(/\/api\/?$/, '')}/hubs/live`;
  }
  return `${window.location.origin}/hubs/live`;
}

/**
 * Reloads live screens when the API broadcasts a change.
 * Existing REST polling stays as a fallback if the socket is down.
 */
export function useLiveUpdates(onUpdated) {
  const onUpdatedRef = useRef(onUpdated);
  onUpdatedRef.current = onUpdated;

  useEffect(() => {
    let cancelled = false;
    let debounce;
    const token = () => localStorage.getItem('hr_token') || '';
    const connection = new HubConnectionBuilder()
      .withUrl(liveHubUrl(), {
        ...(token() ? { accessTokenFactory: token } : {}),
        withCredentials: false,
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.None)
      .build();

    const fire = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (!cancelled) onUpdatedRef.current?.();
      }, 50);
    };

    connection.on('liveUpdated', fire);
    connection.start().catch(() => {});

    return () => {
      cancelled = true;
      clearTimeout(debounce);
      connection.off('liveUpdated', fire);
      connection.stop().catch(() => {});
    };
  }, []);
}
