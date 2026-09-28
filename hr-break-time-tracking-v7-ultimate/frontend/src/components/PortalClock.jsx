import { useEffect, useState } from 'react';

function pad(n) {
  return String(n).padStart(2, '0');
}

export default function PortalClock({ size = 'default' }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const date = now.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className={`portal-clock ${size === 'large' ? 'portal-clock--large' : ''}`} aria-live="polite">
      <div className="portal-clock__section portal-clock__section--date">
        <div className="portal-clock__date">{date}</div>
      </div>
      <div className="portal-clock__section portal-clock__section--time">
        <div className="portal-clock__time">{time}</div>
      </div>
    </div>
  );
}
