# RENTMAIKAR UI NAVIGATION ARCHITECTURE
## Comprehensive Audit, Repair & Prevention Specification

**Project:** RentMaikar  
**Document type:** Repository implementation specification  
**Purpose:** Audit and correct the entire class of dashboard/navigation/view-persistence bugs across RentMaikar.

---

# 1. PRIMARY OBJECTIVE

RentMaikar must have a predictable, scalable navigation architecture in which:

> **A user action that selects a feature must display that feature as the active destination and must not leave an unrelated sibling feature permanently mounted, visually covering it, intercepting interaction with it, or continuing to behave as if it were active.**

The current example is Unified Inbox remaining permanently displayed and preventing features such as:

- Call Center
- Support Tasks
- Referees List

from displaying their own pages.

Treat this as a **systemic navigation architecture problem**, not an isolated Unified Inbox bug.

The implementation must audit the entire application for the same pattern.

---

# 2. NON-NEGOTIABLE DESIGN PRINCIPLE

Every dashboard area must have a clear separation between:

```text
GLOBAL APPLICATION SHELL
        │
        ├── Header
        ├── Sidebar / Navigation
        ├── Global notifications
        ├── Authentication / permissions
        │
        └── ACTIVE FEATURE OUTLET
                │
                └── ONE ACTIVE DESTINATION
```

The application must NOT use the following architecture:

```text
Dashboard
├── Unified Inbox          ← permanently mounted
├── Call Center            ← conditionally mounted
├── Support Tasks          ← conditionally mounted
└── Referees               ← conditionally mounted
```

when these are sibling destinations.

Instead use:

```text
Dashboard
├── Global Shell
│
└── Feature Outlet
      │
      └── exactly one active feature
```

---

# 3. SCOPE OF THE AUDIT

Audit ALL RentMaikar application areas, not just the currently reported pages.

At minimum inspect:

## Admin / Operations

- Dashboard
- Unified Inbox
- Call Center
- Support Tasks
- Referees
- Users
- Drivers
- Owners
- Vehicles
- Bookings
- Rentals
- Payments
- Transactions
- Disputes
- Complaints
- Notifications
- Reports
- Analytics
- Settings
- Audit Logs

## Owner

- Owner Dashboard
- Vehicles
- Vehicle catalogue
- Bookings
- Rental requests
- Drivers
- Messages
- Notifications
- Earnings
- Reviews
- Referrals
- Profile
- Settings

## Driver

- Driver Dashboard
- Available vehicles
- Rental requests
- Active rental
- Messages
- Notifications
- Support
- Referrals
- Profile
- Settings

## Authentication / onboarding

- Login
- Registration
- Verification
- Phone verification
- Password reset
- Profile completion
- Role-specific onboarding

Also inspect any newly added feature not listed above.

---

# 4. FIRST TASK: DISCOVER THE EXISTING ARCHITECTURE

Do NOT immediately rewrite navigation.

First inspect the repository.

Determine:

1. Frontend framework and version.
2. React entry point.
3. Router implementation.
4. Root application component.
5. Dashboard layouts.
6. Sidebar/navigation components.
7. Header/navigation components.
8. Route definitions.
9. Nested routes.
10. `<Outlet />` usage.
11. `navigate()` usage.
12. `NavLink` usage.
13. `Link` usage.
14. Custom navigation state.
15. `activeTab`.
16. `activeFeature`.
17. `selectedFeature`.
18. `currentView`.
19. `currentPage`.
20. Modal/drawer navigation.
21. Conditional rendering.
22. Portals.
23. Fixed/absolute overlays.
24. Global providers.
25. Realtime subscriptions.
26. WebSocket connections.
27. Polling.
28. Global event listeners.
29. Feature-specific context providers.
30. Lazy-loaded routes.
31. Error boundaries.
32. Authentication guards.
33. Role/permission guards.

Do not create a second routing system if one already exists.

---

# 5. REPOSITORY SEARCH

Search the repository systematically.

Examples:

```bash
grep -R "UnifiedInbox" src --exclude-dir=node_modules
grep -R "CallCenter" src --exclude-dir=node_modules
grep -R "SupportTasks" src --exclude-dir=node_modules
grep -R "Referees" src --exclude-dir=node_modules

grep -R "activeTab" src --exclude-dir=node_modules
grep -R "activeFeature" src --exclude-dir=node_modules
grep -R "selectedFeature" src --exclude-dir=node_modules
grep -R "currentView" src --exclude-dir=node_modules
grep -R "currentPage" src --exclude-dir=node_modules

grep -R "BrowserRouter" src --exclude-dir=node_modules
grep -R "Routes" src --exclude-dir=node_modules
grep -R "<Route" src --exclude-dir=node_modules
grep -R "Outlet" src --exclude-dir=node_modules
grep -R "useNavigate" src --exclude-dir=node_modules
grep -R "NavLink" src --exclude-dir=node_modules
grep -R "navigate(" src --exclude-dir=node_modules
```

Also inspect:

```text
package.json
vite.config.*
src/main.*
src/App.*
src/routes/*
src/router/*
src/layouts/*
src/components/*
src/pages/*
```

Adapt paths to the actual repository.

---

# 6. NAVIGATION INVENTORY

Create an internal inventory before modifying code.

For every navigation item record:

| Feature | User Role | Trigger | Destination | Current Mechanism | Expected URL | Active State | Problem |
|---|---|---|---|---|---|---|---|
| Unified Inbox | Admin | button | inbox | router/state | /... | active | audit |
| Call Center | Admin | button | calls | router/state | /... | active | audit |
| Support Tasks | Admin | button | tasks | router/state | /... | active | audit |
| Referees | Admin | button | referees | router/state | /... | active | audit |

Do the same for every dashboard role.

The objective is to discover duplicate, competing, or ambiguous navigation mechanisms.

---

# 7. ROUTER-FIRST ARCHITECTURE

If RentMaikar already uses React Router, it should normally be the source of truth for page-level navigation.

Preferred structure:

```tsx
<Route path="/dashboard" element={<DashboardLayout />}>
  <Route index element={<DashboardHome />} />

  <Route
    path="unified-inbox"
    element={<UnifiedInbox />}
  />

  <Route
    path="call-center"
    element={<CallCenter />}
  />

  <Route
    path="support-tasks"
    element={<SupportTasks />}
  />

  <Route
    path="referees"
    element={<RefereesList />}
  />
</Route>
```

Layout:

```tsx
function DashboardLayout() {
  return (
    <DashboardShell>
      <Sidebar />
      <Header />

      <main>
        <Outlet />
      </main>
    </DashboardShell>
  );
}
```

The shell remains mounted.

The active page changes through the outlet.

---

# 8. DO NOT CREATE COMPETING SOURCES OF TRUTH

Avoid:

```text
URL says: /call-center
BUT
activeFeature says: unified-inbox
```

Avoid:

```text
Router state
+
Redux state
+
local component state
+
URL query parameter
```

all independently deciding which page is active.

For page-level destinations:

> **The router should normally be authoritative.**

Local component state should control things such as:

- filters
- sorting
- selected row
- open dialog
- search text
- temporary UI state

It should not independently redefine the current page.

---

# 9. SINGLE ACTIVE FEATURE RULE

For sibling destinations:

```text
ONE NAVIGATION ACTION
        ↓
ONE DESTINATION
        ↓
ONE ACTIVE FEATURE
```

Never render all sibling feature pages and attempt to hide them using CSS.

Bad:

```tsx
<UnifiedInbox className={active !== "inbox" ? "hidden" : ""} />
<CallCenter className={active !== "calls" ? "hidden" : ""} />
```

Also bad:

```tsx
<UnifiedInbox />
{active === "calls" && <CallCenter />}
```

Preferred:

```tsx
<Outlet />
```

or:

```tsx
{activeFeature === "inbox" && <UnifiedInbox />}
```

when routing genuinely is not appropriate.

---

# 10. DETECT PERMANENTLY MOUNTED FEATURES

Audit for components that appear outside the route outlet or feature switch.

Particular attention:

- Unified Inbox
- chat widgets
- call center
- support panels
- notification panels
- customer support drawers
- message composers
- floating action panels
- search interfaces
- global command palettes

A component can be visually hidden but still mounted.

Determine whether it owns:

- event listeners
- realtime channels
- timers
- subscriptions
- keyboard shortcuts
- portals
- focus traps
- audio/video
- microphone/call state

---

# 11. OVERLAY AND Z-INDEX AUDIT

A feature may appear permanently active even if routing is correct because a child component creates a global overlay.

Search for:

```css
position: fixed;
position: absolute;
z-index:
inset:
top:
right:
bottom:
left:
```

and utility classes such as:

```text
fixed
absolute
z-*
inset-*
top-*
right-*
bottom-*
left-*
```

Check:

- drawers
- modals
- panels
- dropdowns
- popovers
- chat windows
- call controls
- notification trays

Do not solve a navigation problem merely by increasing/decreasing z-index.

---

# 12. PORTAL AUDIT

Inspect components using:

```tsx
createPortal(...)
```

or UI libraries that render through portals.

A feature's visual child may be mounted under `document.body` rather than under the feature-content area.

When leaving a feature, verify that its portal content disappears.

Examples:

```text
Unified Inbox
   └── Message Drawer
         └── Portal → document.body
```

The drawer must not survive after leaving Unified Inbox.

---

# 13. LIFECYCLE CLEANUP

Every feature-specific effect must clean up after unmount.

Bad:

```tsx
useEffect(() => {
  subscribeToMessages();
}, []);
```

Preferred:

```tsx
useEffect(() => {
  const unsubscribe = subscribeToMessages();

  return () => {
    unsubscribe();
  };
}, []);
```

Audit:

- Supabase Realtime
- WebSockets
- polling
- `setInterval`
- `setTimeout`
- window event listeners
- document event listeners
- keyboard shortcuts
- BroadcastChannel
- media streams
- notification listeners

---

# 14. SUPABASE REALTIME AUDIT

RentMaikar may use Supabase or another backend service for realtime functionality.

Search for:

```text
channel(
subscribe(
removeChannel(
removeAllChannels(
on(
postgres_changes
```

Ensure feature-specific subscriptions do not continue indefinitely after navigation.

Example:

```tsx
useEffect(() => {
  const channel = supabase
    .channel("inbox")
    .on(...)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, []);
```

Do not indiscriminately remove global channels that belong to the application shell.

---

# 15. FEATURE-SCOPED CONTEXT

Do not put feature-specific providers unnecessarily around the entire dashboard.

Potentially problematic:

```tsx
<Dashboard>
  <UnifiedInboxProvider>
    <Sidebar />
    <Outlet />
  </UnifiedInboxProvider>
</Dashboard>
```

Prefer:

```tsx
<Dashboard>
  <Sidebar />
  <Outlet />
</Dashboard>
```

and:

```tsx
<Route
  path="unified-inbox"
  element={
    <UnifiedInboxProvider>
      <UnifiedInbox />
    </UnifiedInboxProvider>
  }
/>
```

This allows the provider to disappear with the feature.

Global providers should remain global only when genuinely required.

---

# 16. NAVIGATION COMPONENT STANDARD

Navigation should preferably use semantic router navigation.

Example:

```tsx
<NavLink to="/dashboard/call-center">
  Call Center
</NavLink>
```

or:

```tsx
<button
  type="button"
  onClick={() => navigate("/dashboard/call-center")}
>
  Call Center
</button>
```

Do not mix:

```tsx
setActiveTab("call-center");
navigate("/dashboard/inbox");
```

unless there is a deliberate and documented reason.

---

# 17. ACTIVE NAVIGATION STATE

The sidebar must visually identify the current destination based on the actual route.

Preferred:

```tsx
<NavLink
  to="/dashboard/call-center"
  className={({ isActive }) =>
    isActive ? "active" : ""
  }
>
  Call Center
</NavLink>
```

Avoid manually duplicating route state:

```tsx
const [selected, setSelected] = useState("call-center");
```

when the URL already contains that information.

---

# 18. REFRESH AND DEEP LINKING

Every page-level feature must be directly addressable.

Example:

```text
/dashboard/unified-inbox
/dashboard/call-center
/dashboard/support-tasks
/dashboard/referees
```

Test:

1. Click feature.
2. Copy URL.
3. Refresh browser.
4. Feature remains selected.
5. Correct permissions are applied.
6. Correct dashboard shell remains.
7. No unrelated feature appears.

---

# 19. BROWSER HISTORY

With router-based navigation:

```text
Inbox
  ↓
Call Center
  ↓
Support Tasks
  ↓
Referees
```

Browser Back should move:

```text
Referees
  ↓
Support Tasks
  ↓
Call Center
  ↓
Inbox
```

Do not use `replace` for every navigation.

Use `replace` only where deliberately appropriate, such as redirecting after authentication.

---

# 20. ROLE-AWARE ROUTING

RentMaikar has multiple user roles.

Navigation must respect:

```text
role
permissions
feature availability
authentication state
```

A user must not be able to access an unauthorized route merely by typing its URL.

However:

> **Authorization and navigation rendering are separate concerns.**

Do not hide navigation and assume that constitutes security.

Backend authorization must remain authoritative.

---

# 21. UNKNOWN / FORBIDDEN ROUTES

Define behavior for:

```text
404
403
unauthenticated
expired session
invalid feature
removed feature
```

Examples:

```text
/dashboard/nonexistent
/dashboard/admin-only
```

should not result in a blank page or a permanently displayed Unified Inbox.

---

# 22. DEFAULT DASHBOARD ROUTE

The default route must be explicit.

Example:

```tsx
<Route index element={<DashboardHome />} />
```

or a deliberate redirect.

Do not accidentally make Unified Inbox the default merely because it is the first component rendered.

If Unified Inbox is intended as the default for a specific role, make that explicit in routing.

---

# 23. CONDITIONAL FEATURE AVAILABILITY

Feature availability may depend on:

- role
- subscription
- tenant
- account state
- permissions
- configuration

This must not break sibling navigation.

Example:

```tsx
const routes = [
  {
    path: "call-center",
    element: <CallCenter />,
    permission: "call_center:view",
  },
];
```

A feature that is unavailable should not cause another feature to become permanently mounted unless that is explicitly the intended fallback.

---

# 24. MODAL VS PAGE DISTINCTION

Determine whether each UI element is:

### A page

Use routing.

Examples:

- Call Center
- Support Tasks
- Referees
- Vehicle Management

### A modal

Use modal state.

Examples:

- Confirm deletion
- Edit vehicle
- Add referee

### A drawer

Use controlled UI state.

Examples:

- Message details
- Booking details

### A global widget

Use global state/provider.

Examples:

- system notifications
- emergency alerts

Do not implement a page as a permanent modal/drawer.

---

# 25. MOBILE NAVIGATION

Audit mobile navigation separately.

Check:

- bottom navigation
- hamburger menu
- mobile drawer
- responsive sidebar
- nested navigation
- feature switching

The mobile UI must use the same navigation source of truth as desktop.

Do not create a second independent page-selection state just for mobile.

---

# 26. BACK BUTTON ON MOBILE

Where browser history is applicable, Android/browser Back should behave predictably.

Do not intercept Back globally unless required.

If a modal is open:

```text
Back → close modal
```

If no modal is open:

```text
Back → previous route
```

Avoid:

```text
Back → Unified Inbox regardless of current page
```

---

# 27. PRESERVE GLOBAL UI

The repair must NOT accidentally unmount:

- authentication provider
- theme provider
- tenant provider
- notification provider
- global toast system
- permission context
- analytics
- application shell

unless the existing architecture explicitly requires it.

Only the feature-specific subtree should change when moving between sibling pages.

---

# 28. PERFORMANCE REQUIREMENTS

Use route-level lazy loading where appropriate.

Example:

```tsx
const CallCenter = lazy(() => import("./pages/CallCenter"));
```

Then:

```tsx
<Suspense fallback={<PageLoader />}>
  <Outlet />
</Suspense>
```

Do not eagerly mount every dashboard feature merely to make navigation appear fast.

---

# 29. ERROR BOUNDARIES

A broken feature must not destroy the entire dashboard shell.

Preferred:

```text
Dashboard Shell
   │
   └── Feature Error Boundary
          │
          └── Active Feature
```

If Call Center crashes:

```text
Sidebar remains usable
Header remains usable
User can navigate to another feature
```

Do not allow a feature error to permanently lock the user inside that feature.

---

# 30. DATA STATE VS VIEW STATE

Do not confuse:

```text
data state
```

with:

```text
navigation state
```

For example:

```text
Unread inbox count
```

may be global/shared.

But:

```text
Currently viewing Inbox
```

is navigation state.

Keep these separate.

---

# 31. GLOBAL INBOX NOTIFICATION COUNT

Unified Inbox may legitimately provide global unread counts.

That does NOT mean Unified Inbox itself should remain mounted as the active page.

Preferred:

```text
Global notification provider
       ↓
Unread message count
       ↓
Sidebar badge

Active route:
       ↓
Unified Inbox only when selected
```

---

# 32. CALL CENTER SPECIAL CONSIDERATION

Call Center may contain:

- active calls
- audio streams
- SIP/VoIP state
- Twilio state
- call timers
- call recording
- call controls

Do not automatically destroy an active call merely because the user navigates to another page if the product specification requires calls to continue.

Instead separate:

```text
Global call session state
```

from:

```text
Call Center page UI
```

Example:

```text
Global Call Provider
      │
      ├── active call
      └── Call Center page UI
```

This is an exception to the simple "everything unmounts" rule.

The page UI should disappear while the necessary call session remains alive.

---

# 33. SUPPORT TASKS

Support Tasks may contain:

- task queues
- filters
- assignees
- task details
- status changes

Determine whether filters should survive navigation.

Recommended:

```text
Route state:
current task page

Local/query state:
filters and sorting
```

Do not keep the entire Support Tasks page permanently mounted merely to preserve filters.

---

# 34. REFEREES

Referees List should be an independent feature destination.

Navigation should replace the current feature:

```text
/current feature
        ↓
Referees List
```

not:

```text
/current feature
+
Referees List
```

unless a deliberate split-pane workflow exists.

---

# 35. SPLIT-PANE EXCEPTION

Some RentMaikar features may intentionally use:

```text
List | Detail
```

That is acceptable.

Example:

```text
Support Tasks
├── Task list
└── Task details
```

But both panes must belong to the same route/feature.

Do not confuse an intentional split pane with accidentally stacking unrelated dashboard pages.

---

# 36. SEARCH FOR COMMON BUG PATTERNS

Audit for these patterns:

### Pattern A

```tsx
<Feature />
<Outlet />
```

where `<Feature />` is actually a sibling route.

### Pattern B

```tsx
<Feature />
{condition && <OtherFeature />}
```

### Pattern C

```tsx
<div style={{ display: active ? "block" : "none" }}>
```

for page-level features.

### Pattern D

```tsx
position: fixed
```

on an entire feature page.

### Pattern E

Global provider accidentally containing a feature page.

### Pattern F

Portal-mounted feature UI.

### Pattern G

Navigation updates local state but not route.

### Pattern H

Navigation updates route but stale local state continues rendering old feature.

### Pattern I

Two routers or router-like systems.

### Pattern J

Duplicate route definitions.

### Pattern K

Wildcard route unexpectedly renders Unified Inbox.

### Pattern L

Fallback route incorrectly renders Unified Inbox.

### Pattern M

Feature component itself renders another feature component.

### Pattern N

Global layout imports and renders a feature directly.

### Pattern O

Feature-specific context is mounted at the dashboard root.

---

# 37. AUTOMATED ARCHITECTURE CHECK

Where practical, add a lightweight test or static check to prevent recurrence.

Examples:

- dashboard shell should not directly render sibling page components
- route destinations should be unique
- navigation destinations should correspond to registered routes

Do not create brittle tests that depend on implementation details unnecessarily.

---

# 38. REQUIRED TEST MATRIX

Test every dashboard destination.

Minimum:

| From | To | Expected |
|---|---|---|
| Inbox | Call Center | Call Center only |
| Inbox | Support Tasks | Support Tasks only |
| Inbox | Referees | Referees only |
| Call Center | Inbox | Inbox only |
| Call Center | Support Tasks | Support Tasks only |
| Call Center | Referees | Referees only |
| Support Tasks | Inbox | Inbox only |
| Support Tasks | Call Center | Call Center only |
| Support Tasks | Referees | Referees only |
| Referees | Inbox | Inbox only |
| Referees | Call Center | Call Center only |
| Referees | Support Tasks | Support Tasks only |

Repeat for every other sibling feature discovered during the audit.

---

# 39. AUTOMATED TEST REQUIREMENTS

Where testing infrastructure exists, create regression tests for the reported bug.

Example:

```tsx
render(<Dashboard />);

await user.click(
  screen.getByRole("button", {
    name: /call center/i,
  })
);

expect(
  screen.getByTestId("call-center-view")
).toBeInTheDocument();

expect(
  screen.queryByTestId("unified-inbox-view")
).not.toBeInTheDocument();
```

Then test:

```text
Call Center → Support Tasks
Support Tasks → Referees
Referees → Unified Inbox
```

Do not depend exclusively on visible text if stable test IDs or route assertions are more appropriate.

---

# 40. E2E TEST REQUIREMENTS

If Playwright/Cypress or another E2E framework exists, test:

1. Login.
2. Open dashboard.
3. Click Unified Inbox.
4. Click Call Center.
5. Confirm Call Center is visible.
6. Confirm Inbox page is not visible.
7. Click Support Tasks.
8. Confirm Support Tasks is visible.
9. Confirm Call Center page is gone.
10. Click Referees.
11. Confirm Referees is visible.
12. Refresh.
13. Confirm Referees remains active.
14. Press Back.
15. Confirm Support Tasks.
16. Press Forward.
17. Confirm Referees.

---

# 41. VISUAL REGRESSION CHECK

Verify:

- no overlapping panels
- no stale drawers
- no duplicated headers
- no duplicated sidebars
- no incorrect z-index
- no unexpected scroll containers
- no feature content underneath another feature
- no invisible element intercepting clicks

Test desktop and mobile layouts.

---

# 42. ACCESSIBILITY

Navigation must use accessible semantics.

Prefer:

```tsx
<nav aria-label="Dashboard navigation">
```

and:

```tsx
<NavLink ...>
```

Buttons should be actual buttons.

Do not use:

```tsx
<div onClick={...}>
```

for navigation unless there is a compelling reason.

Ensure:

- keyboard navigation
- visible focus
- active destination
- appropriate aria labels
- logical tab order

When a modal closes after leaving a feature, focus must not become trapped.

---

# 43. SCROLL MANAGEMENT

When changing page-level routes, establish predictable scroll behavior.

For example:

```text
Inbox at scroll position 500
→ Call Center
→ Call Center starts at appropriate position
```

Do not allow an old feature's scroll container to remain visible.

If preserving scroll is required, implement it deliberately.

---

# 44. STATE PERSISTENCE

Persist only state that genuinely needs persistence.

Examples appropriate for persistence:

- selected language
- theme
- user preferences
- draft data where required
- filter query parameters where useful

Do not persist:

```text
"Unified Inbox must always be visible"
```

unless it is explicitly the intended default.

---

# 45. URL DESIGN

Use readable, stable URLs.

Preferred:

```text
/dashboard
/dashboard/unified-inbox
/dashboard/call-center
/dashboard/support-tasks
/dashboard/referees
```

Avoid opaque URLs such as:

```text
/dashboard?view=3
```

unless there is a strong architectural reason.

If query parameters are required, use them for state within a page:

```text
/dashboard/support-tasks?status=open
```

rather than using them as a second page router.

---

# 46. ROUTE REGISTRY

If the application has many features, consider a central route registry.

Example:

```tsx
export const dashboardRoutes = [
  {
    id: "unified-inbox",
    path: "unified-inbox",
    label: "Unified Inbox",
    element: <UnifiedInbox />,
    permission: "inbox:view",
  },
  {
    id: "call-center",
    path: "call-center",
    label: "Call Center",
    element: <CallCenter />,
    permission: "calls:view",
  },
];
```

This can reduce duplicated navigation definitions.

Do not introduce this abstraction if the existing application is small and already clear.

---

# 47. DO NOT OVER-ENGINEER

The fix should be the smallest safe architectural correction.

Do NOT:

- rewrite the entire frontend
- migrate React Router versions without need
- replace the state-management system
- rewrite unrelated components
- migrate Supabase
- change database schema
- change backend APIs
- modify payment systems
- modify Twilio configuration
- modify DNS
- modify authentication

unless a direct dependency is discovered and documented.

---

# 48. IMPLEMENTATION ORDER

Follow this sequence:

## Phase 1 — Discovery

- inspect repository
- identify router
- map dashboard layouts
- map navigation
- map feature components
- identify permanent mounts
- identify overlays/portals
- identify providers
- identify subscriptions

## Phase 2 — Architecture

- choose existing router if available
- establish one feature outlet
- establish route/source-of-truth
- separate global shell from feature pages

## Phase 3 — Repair

- remove permanent sibling feature rendering
- repair navigation triggers
- repair route definitions
- repair fallback behavior
- repair active navigation state
- repair feature lifecycle cleanup
- repair overlays/portals

## Phase 4 — Verification

- type-check
- lint
- unit tests
- E2E tests if available
- production build
- manual navigation matrix
- mobile verification

## Phase 5 — Review

- inspect git diff
- remove temporary/debug code
- document architectural change
- identify unrelated pre-existing failures

---

# 49. ACCEPTANCE CRITERIA

The work is successful only if all applicable requirements pass.

## Navigation

- [ ] Every dashboard navigation button has one clear destination.
- [ ] Clicking a destination changes the active view.
- [ ] The previous sibling page is no longer displayed.
- [ ] No unrelated feature remains permanently mounted.
- [ ] No CSS hiding workaround is required.
- [ ] Sidebar and header remain stable.

## Routing

- [ ] Routes are unique.
- [ ] Direct URLs work.
- [ ] Refresh works.
- [ ] Browser Back works.
- [ ] Browser Forward works.
- [ ] Unauthorized routes are protected.
- [ ] Unknown routes have defined behavior.

## Lifecycle

- [ ] Feature subscriptions clean up.
- [ ] Event listeners clean up.
- [ ] Timers clean up.
- [ ] Portals disappear.
- [ ] Drawers disappear.
- [ ] Modals disappear where appropriate.
- [ ] Keyboard shortcuts do not leak between features.

## UI

- [ ] No feature overlays another.
- [ ] No stale fixed panels remain.
- [ ] No duplicate shell elements appear.
- [ ] Responsive navigation works.
- [ ] Accessibility remains intact.

## Regression

- [ ] Existing features continue working.
- [ ] Authentication is unchanged.
- [ ] Permissions are unchanged.
- [ ] API contracts are unchanged.
- [ ] Backend is unchanged unless strictly required.

---

# 50. REQUIRED BUILD / VALIDATION COMMANDS

First inspect `package.json` and use the repository's existing scripts.

Typical commands may include:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Do not assume these exact scripts exist.

If the project uses another package manager, use the existing one.

For example:

```bash
pnpm
yarn
npm
```

Do not change package-manager infrastructure as part of this task.

---

# 51. GIT SAFETY

Before implementation:

```bash
git status
git branch --show-current
```

After implementation:

```bash
git status
git diff --stat
git diff
```

Do not overwrite unrelated user work.

Do not reset the repository.

Do not perform destructive commands such as:

```bash
git reset --hard
git clean -fd
```

unless explicitly authorized.

---

# 52. CHANGE SUMMARY REQUIREMENT

At completion, report:

### Root cause

What actually caused the navigation problem?

Example:

```text
UnifiedInbox was rendered directly by DashboardLayout while other
features were routed through the feature outlet.
```

### Files changed

List every modified file.

### Architecture change

Explain:

```text
Before
→ ...

After
→ ...
```

### Tests

Report:

```text
Type-check: PASS/FAIL
Lint: PASS/FAIL
Tests: PASS/FAIL/NOT AVAILABLE
Build: PASS/FAIL
```

### Pre-existing issues

Clearly distinguish unrelated failures.

---

# 53. EXAMPLE TARGET ARCHITECTURE

A scalable RentMaikar dashboard should resemble:

```text
App
│
├── Authentication
│
└── Role / Permission Guard
     │
     └── DashboardLayout
          │
          ├── Global Providers
          │
          ├── Header
          │
          ├── Sidebar
          │    ├── Dashboard
          │    ├── Unified Inbox
          │    ├── Call Center
          │    ├── Support Tasks
          │    ├── Referees
          │    └── ...
          │
          └── Main
               │
               └── ErrorBoundary
                    │
                    └── Suspense
                         │
                         └── Outlet
                              │
                              └── CURRENT ROUTE ONLY
```

---

# 54. SPECIAL RULE FOR GLOBAL SERVICES

A service may remain globally active even though its page is not.

Examples:

```text
Global message notification listener
Global call session
Global authentication session
Global toast system
```

The correct architecture is:

```text
GLOBAL SERVICE
       │
       ├── background state
       │
       └── feature UI
             │
             └── rendered only when route is active
```

Do not confuse service persistence with page persistence.

---

# 55. FINAL ENGINEERING DIRECTIVE

This document is an implementation specification.

The coding agent must:

1. Read this entire file.
2. Inspect the actual RentMaikar repository.
3. Do not assume component names or file paths.
4. Determine the existing navigation architecture.
5. Identify the root cause of the reported Unified Inbox problem.
6. Search for the same architectural pattern elsewhere.
7. Fix the entire class of problems, not just one button.
8. Prefer the existing routing architecture.
9. Establish one active feature outlet per dashboard.
10. Remove permanent sibling page mounts.
11. Repair lifecycle cleanup where necessary.
12. Repair overlay/portal behavior where necessary.
13. Preserve global services that genuinely need to remain active.
14. Preserve authentication and authorization.
15. Preserve existing APIs and database behavior.
16. Add regression tests where infrastructure permits.
17. Run type-check, lint, tests, and build.
18. Review the final diff.
19. Report root cause and all relevant changes.

## Definition of Done

The task is **NOT DONE** merely because clicking Call Center visually changes the screen.

It is done only when the application has a coherent navigation architecture in which:

> **The URL/navigation state, active navigation indicator, rendered feature, feature lifecycle, overlays, and browser history all agree about which RentMaikar feature is currently active.**

And when navigating from any sibling feature to another:

> **The previous feature cannot remain visually or functionally in control of the dashboard unless that behavior is an explicitly designed global service.**
