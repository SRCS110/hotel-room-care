'use client';
import { useEffect, useRef } from 'react';
import { start } from './engine';

// Mounts the portal UI. mode = 'login' | 'app'
export default function RoomCare({ mode }) {
  const ref = useRef(null);
  useEffect(() => start(ref.current, mode), [mode]);
  return <div ref={ref}><div className="loading"><span><span className="spin" />Loading</span></div></div>;
}
