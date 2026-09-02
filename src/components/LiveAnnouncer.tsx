/**
 * Accessibility announcement component for screen readers.
 * Use for dynamic content changes that need to be announced.
 */

import { useEffect, useState } from "react";

let announceCallback: ((message: string) => void) | null = null;

/** Announce a message to screen readers */
export function announce(message: string) {
  announceCallback?.(message);
}

const LiveAnnouncer = () => {
  const [message, setMessage] = useState("");

  useEffect(() => {
    announceCallback = (msg: string) => {
      setMessage("");
      // Force re-render for screen readers
      requestAnimationFrame(() => setMessage(msg));
    };
    return () => {
      announceCallback = null;
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
};

export default LiveAnnouncer;
