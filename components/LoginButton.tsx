
import React, { useRef, useEffect } from 'react';
import { renderGoogleButton } from '../services/authService';

export const LoginButton: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const cancel = renderGoogleButton(containerRef.current);
    return cancel;
  }, []);

  return (
    <div className="w-full flex justify-center">
      <div ref={containerRef} />
    </div>
  );
};
