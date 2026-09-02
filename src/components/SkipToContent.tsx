/**
 * Skip navigation link for keyboard/screen reader users.
 * Renders a visually hidden link that becomes visible on focus.
 */

const SkipToContent = () => (
  <a
    href="#main-content"
    className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-all"
  >
    Skip to main content
  </a>
);

export default SkipToContent;
