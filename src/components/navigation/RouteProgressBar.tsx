import React, { useEffect, useTransition } from "react";
import { useLocation } from "react-router-dom";
import nprogress from "nprogress";
import "nprogress/nprogress.css";

// Configure NProgress defaults
nprogress.configure({
  showSpinner: false,
  trickleSpeed: 120,
  minimum: 0.15,
  easing: "ease",
  speed: 250,
});

/**
 * Top-loading progress bar that reacts to React Router navigation changes.
 * Provides real-time visual loading feedback across route transitions.
 */
export const RouteProgressBar: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    // Start progress on route transition
    nprogress.start();

    // Complete progress once route component has rendered
    const timer = setTimeout(() => {
      nprogress.done();
    }, 120);

    return () => {
      clearTimeout(timer);
      nprogress.done();
    };
  }, [location.pathname, location.search]);

  return null;
};

/**
 * Suspense fallback bridge that guarantees top progress stays active
 * while lazy-loaded route bundles are being fetched across the network.
 */
export const SuspenseProgressTracker: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    nprogress.start();
    return () => {
      nprogress.done();
    };
  }, []);

  return <>{children}</>;
};

export default RouteProgressBar;
