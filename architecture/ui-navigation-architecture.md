RENTMAIKAR CURRENT UI NAVIGATION, VIEW LIFECYCLE & GLOBAL SERVICE ARCHITECTURE

Current-State Implementation, Audit, Repair & Prevention Specification

Project: RentMaikar
Document type: Repository implementation specification
Revision: 2 — Current UI Architecture
Status: Authoritative implementation guidance
Scope: Frontend navigation, dashboard views, feature lifecycle, communication surfaces, global services, overlays and navigation regression prevention

---

1. PURPOSE

RentMaikar currently uses more than one legitimate navigation pattern:

1. Application-level React Router routes.
2. Unified Admin Portal navigation using "portal" + "tab" URL state.
3. Standalone first-class operational routes.
4. Feature-local tabs.
5. Global floating services such as the Communications Hub.

Therefore:

«Do not impose a single routing mechanism on the entire application.»

The objective is instead to ensure that the existing navigation mechanisms have clearly defined responsibilities and do not compete with one another.

The fundamental rule remains:

«A user action that selects a page-level feature must make that feature the authoritative active destination and must not leave an unrelated sibling feature visually or functionally in control of the same dashboard surface.»

---

2. CURRENT RENTMAIKAR NAVIGATION MODEL

The current architecture is approximately:

App
│
├── Global Providers
│   ├── AuthProvider
│   ├── BackendBridgeProvider
│   ├── RegionProvider
│   ├── UserTypeProvider
│   ├── React Query
│   └── CommunicationsHubProvider
│
├── BrowserRouter
│
├── Global Services
│   ├── realtime synchronization
│   ├── push notifications
│   ├── route tracking
│   ├── notifications
│   └── Communications Hub
│
└── Routes
    │
    ├── public routes
    ├── authentication routes
    ├── driver routes
    ├── owner routes
    ├── admin routes
    │
    └── /admin
         │
         ├── Admin Dashboard
         │
         ├── Portal Navigation
         │   ├── CRM
         │   ├── ERP
         │   ├── Support
         │   ├── Content
         │   ├── Marketing
         │   ├── Docs
         │   └── Control Plane
         │
         └── Active Portal + Active Tab

The "/admin" dashboard is therefore not currently a conventional nested-route "<Outlet />" dashboard.

Do not convert it to one merely because the previous specification recommended "<Outlet />".

---

3. AUTHORITATIVE SOURCES OF TRUTH

RentMaikar has different sources of truth for different navigation levels.

Application/page route

React Router is authoritative.

Examples:

/admin
/admin/call-center
/admin/messaging
/admin/reconciliation
/admin/disputes

Unified Admin Portal

The current Admin Portal uses:

portal
+
tab

as its page/view selection state.

Examples:

/admin?portal=support&tab=task-portal
/admin?portal=support&tab=inbox
/admin?portal=support&tab=call-center
/admin?portal=crm&tab=applications

The portal/tab registry is centralized in:

src/lib/admin-tab-registry.ts

This registry must remain the authoritative inventory of the unified Admin Portal's tab universe.

Feature-local tabs

Local tabs are allowed when they represent views inside an already-selected feature.

Example:

/admin/messaging?tab=console
/admin/messaging?tab=bulk-tracker

These are not equivalent to selecting another dashboard page.

---

4. DO NOT CREATE A SECOND NAVIGATION SYSTEM

Do not introduce:

React Router
+
activeFeature
+
selectedFeature
+
portal state
+
another dashboard router

where each independently determines the page.

Instead determine which layer owns the navigation.

Use this hierarchy:

Application route
        ↓
Admin portal
        ↓
Admin tab
        ↓
Feature-local tab/state
        ↓
Modal/drawer state

Each layer must have one owner.

---

5. CURRENT ADMIN PORTAL STRUCTURE

The current Admin Portal includes:

CRM
ERP
Support
Content
Marketing
Docs
Control Plane

The current portal/tab inventory must be derived from:

src/components/admin/PortalNavigation.tsx
src/lib/admin-tab-registry.ts
src/lib/admin-tab-permissions.ts

Do not maintain a second manually duplicated feature inventory inside this specification.

If a new portal or tab is introduced, update the authoritative registry and permission model as appropriate.

---

6. SUPPORT PORTAL

The current Support Portal contains page-level views including:

Task Portal
Inbox
Call Center
Contacts
Support Tasks
Insurance
Nigeria Verification
Police Reports
Payment Accounts
Expiry Notifications
Service Disruption Docs

The current implementation uses conditional rendering such as:

activeTab === 'task-portal'
activeTab === 'inbox'
activeTab === 'call-center'
activeTab === 'support-tasks'

This is acceptable because these are mutually exclusive portal destinations.

The implementation must preserve the invariant:

one active support tab
        ↓
one active support feature view

---

7. SINGLE ACTIVE FEATURE RULE

For mutually exclusive page-level sibling features:

ONE SELECTION
     ↓
ONE ACTIVE FEATURE

For example:

Inbox
   ↓
Call Center

must result in:

Call Center = rendered
Inbox = not rendered as the active page

Likewise:

Call Center
   ↓
Support Tasks

must result in:

Support Tasks = rendered
Call Center page UI = not rendered

Do not solve this by merely applying:

display: none;
visibility: hidden;
opacity: 0;
z-index:

to a sibling page.

---

8. IMPORTANT EXCEPTION — GLOBAL COMMUNICATIONS HUB

The Communications Hub is not a normal sibling page.

Current implementation:

src/components/admin/communications-hub/

provides:

CommunicationsHubProvider
AdminCommunicationsHub

and the provider is mounted globally in "App.tsx".

This is intentional.

The Hub provides:

Call
Console
Editor
Bulk
History
Context
Message

and can operate as a floating operational surface.

Therefore:

«Do not remove the global Communications Hub merely to satisfy the single-active-page rule.»

Instead distinguish:

GLOBAL COMMUNICATION SERVICE/UI

from:

PAGE-LEVEL FEATURE

---

9. GLOBAL SERVICE VS PAGE UI

This distinction is mandatory.

A global service may survive navigation.

A page-level UI normally should not.

Example:

Global Communications Service
        │
        ├── unread message count
        ├── active call session
        ├── communication activity
        └── floating Hub UI

versus:

/admin?portal=support&tab=inbox
        ↓
Messaging page

The existence of the global Hub must not cause the Inbox page to remain mounted underneath or over another page.

---

10. COMMUNICATIONS HUB NAVIGATION BEHAVIOUR

The current Hub already contains navigation protection.

It identifies dedicated communication routes including:

/admin/call-center
/admin/messaging
/m/call-in

and suppresses the floating launcher/window on those dedicated pages unless an active call requires continued visibility.

It also closes the floating Hub when route/location changes, unless an active call is in progress.

This behaviour must be preserved.

Do not remove or bypass it without proving that the replacement provides equivalent lifecycle protection.

---

11. COMMUNICATIONS HUB OVERLAY RULE

The floating Hub may use:

position: fixed
z-index

because it is deliberately an overlay.

That is not automatically a navigation defect.

The audit must determine:

Is this an intentional global overlay?

versus:

Is this an accidentally mounted page?

Only the latter is a navigation architecture defect.

---

12. COMMUNICATIONS HUB OVERLAY SAFETY

When the Hub is not supposed to be visible:

AdminCommunicationsHub → null

is preferable to leaving a full page mounted invisibly.

When it is intentionally visible:

role="dialog"

and controlled overlay behaviour are appropriate.

Verify:

- escape handling
- focus behaviour
- close/minimize behaviour
- z-index
- viewport boundaries
- mobile behaviour
- interaction blocking
- active-call exception

---

13. ACTIVE CALL SURVIVABILITY

Call Centre is a special case.

The current system explicitly supports:

global active call session

while the Call Centre page is merely its UI.

Therefore:

Navigate away from Call Centre

must not automatically mean:

terminate active Twilio/WebRTC call

unless the product specification explicitly requires that.

Correct architecture:

Global Call Session
       │
       ├── active call
       ├── call timer
       ├── media/session state
       └── Call Centre UI

The Call Centre UI may disappear while the call session survives.

---

14. DEDICATED CALL CENTRE ROUTE

The current application has:

/admin/call-center

implemented by:

src/pages/admin/AdminCallCenterPage.tsx

This is a first-class operational route.

It must remain independently addressable and refreshable.

The page is intentionally distinct from:

/admin?portal=support&tab=call-center

The latter is the unified Admin Portal representation.

The two representations must not create competing active-call state.

---

15. MESSAGING CENTRE

The current application has a standalone:

/admin/messaging

route.

It is implemented by:

src/pages/admin/MessagingCenterPage.tsx

and uses:

src/components/admin/MessagingCenter.tsx

The Messaging Centre supports communication channels including:

email
SMS
WhatsApp
in-app notifications

and local views such as:

console
bulk tracker
composer

These local tabs are feature state, not separate dashboard destinations.

---

16. UNIFIED INBOX / MESSAGING DISTINCTION

Do not treat all occurrences of:

Inbox
Messaging Centre
Message Console
Communications Hub
Omni Composer

as the same UI object.

They have different architectural responsibilities.

The audit must determine whether a component is:

page
tab
drawer
composer
global service
notification surface

before changing its lifecycle.

---

17. COMMUNICATIONS SIBLINGS

The current UI explicitly identifies a communications suite containing:

Messaging Centre
Call Centre
Omni-Channel Composer
Marketing Engine
Floating Communications Hub

This is a navigation relationship, not proof that all five are routes.

The implementation must preserve their current intended interaction model.

A sibling-navigation control must navigate to the correct destination without leaving the previous page UI in control.

---

18. MARKETING ENGINE

Marketing is currently represented inside the Admin Portal and also integrates with Communications Hub functionality.

Do not automatically classify every Marketing communication component as a standalone route.

Inspect whether a component is:

Marketing Portal tab
Marketing modal
Communications Hub action
Lead detail modal
Campaign page

before changing navigation.

---

19. FEATURE-LOCAL TABS ARE ALLOWED

The old specification's concern about "activeTab" was too broad.

"activeTab" is not inherently a navigation defect.

This is valid:

const [activeTab, setActiveTab] = useState('console');

when it controls tabs inside Messaging Centre.

This is also valid:

const [activeTab, setActiveTab] = useState('editor');

inside a composer.

The rule is:

«Local tab state must not independently redefine a page-level destination that already belongs to the router or Admin Portal navigation state.»

---

20. URL-ADDRESSABLE ADMIN TABS

Admin Portal destinations must remain deep-linkable.

Examples:

/admin?portal=support&tab=call-center
/admin?portal=support&tab=inbox
/admin?portal=crm&tab=attestation-review

Test:

1. Open URL directly.
2. Correct portal loads.
3. Correct tab loads.
4. Correct feature is rendered.
5. Refresh.
6. Same feature remains active.
7. Permissions remain enforced.

---

21. BROWSER HISTORY

Do not assume every Admin Portal tab transition must behave exactly like a normal route transition.

Inspect the existing implementation.

Where navigation uses:

navigate(..., { replace: true })

determine whether that is intentional.

Do not replace it with ordinary history pushes merely to satisfy the previous generic navigation specification.

For true page routes such as:

/admin/call-center
/admin/messaging

normal browser history semantics should remain predictable.

---

22. CURRENT ADMIN PORTAL PERSISTENCE

The Admin Portal currently remembers portal/tab state.

There is explicit local/session persistence infrastructure, including:

useDecoupledAdminPortal
usePersistedTab

and portal/tab URL synchronization.

Persistence is permitted.

However:

«Persisted state must never override an explicit current URL destination.»

If the user opens:

/admin?portal=support&tab=call-center

the explicit URL must win over an older remembered tab.

---

23. PORTAL/TAB URL SYNCHRONIZATION

The synchronization algorithm must be deterministic:

Explicit URL
      ↓
Validate portal
      ↓
Validate tab belongs to portal
      ↓
Use URL selection
      ↓
Render feature

Only when no explicit valid destination exists may the system use:

remembered tab

or:

portal default

This prevents "snap back" bugs.

---

24. REGRESSION: SNAP-BACK BUG

A navigation action must not:

User clicks Call Center
        ↓
Call Center appears
        ↓
URL synchronization effect runs
        ↓
Old Inbox state wins
        ↓
Inbox reappears

Any such behaviour is a navigation-state synchronization defect.

The URL, portal state, active tab and rendered feature must converge on the same destination.

---

25. AUTHORITATIVE ADMIN TAB REGISTRY

The current authoritative registry is:

src/lib/admin-tab-registry.ts

It must remain the single inventory for:

PORTAL_TABS
ALL_ADMIN_TABS
ADMIN_ONLY_TABS
getPortalForTab()
getDefaultTabForPortal()

Permission drift detection must remain intact.

Do not introduce another competing tab registry.

---

26. ROLE AND PERMISSION MODEL

The Admin Portal currently distinguishes:

admin
admin_assistant

and uses:

TAB_PERMISSION_MAP
ADMIN_ONLY_TABS

Navigation visibility is not authorization.

The following remain separate:

Navigation visibility
        ≠
Frontend route protection
        ≠
Backend authorization

A hidden tab must not be interpreted as a security boundary.

---

27. STANDALONE ROUTES AND UNIFIED PORTAL

Some functionality exists in both forms:

Unified Admin Portal
        +
Standalone operational route

Examples:

Call Centre
Messaging

This is acceptable only when the two entry points intentionally represent the same operational capability.

They must share appropriate underlying state/services rather than creating competing state machines.

---

28. DO NOT DUPLICATE OPERATIONAL STATE

Avoid:

Unified Call Centre state
+
Standalone Call Centre state

for the same active call.

Prefer:

Global call state/provider
       │
       ├── Unified Portal Call Centre UI
       └── Standalone Call Centre UI

The same principle applies to messaging where shared state is intentionally required.

---

29. FEATURE LIFECYCLE

When a page-level feature ceases to be active:

feature-specific UI
feature-specific subscriptions
feature-specific timers
feature-specific listeners
feature-specific portals

must be cleaned up unless deliberately global.

Audit:

- Supabase Realtime
- WebSockets
- timers
- event listeners
- BroadcastChannel
- media streams
- keyboard shortcuts
- notification listeners
- microphone listeners
- audio sessions

---

30. GLOBAL REALTIME SERVICES

Do not indiscriminately remove global realtime services.

Current application-level services may legitimately remain active.

Examples:

AppLiveSync
CommunicationsHubProvider
global notification synchronization
global active-call state

The audit must identify whether a subscription is:

global

or:

feature-specific

before modifying cleanup.

---

31. COMMUNICATIONS HUB GLOBAL SUBSCRIPTION

The current Communications Hub context synchronizes unread message counts and communication activity globally.

It has cleanup for:

Supabase channel
window event listener

This should remain global because unread communication state is used across communication surfaces.

Do not move it into the Inbox page merely to satisfy page lifecycle rules.

---

32. SUPABASE INVOCATION RULE

Whenever the repository contains:

supabase.functions.invoke(...)

the coding agent must first inspect whether the current RentMaikar catch-all interceptor/adapter already handles that invocation.

Required process:

Find invocation
      ↓
Identify function
      ↓
Inspect catch-all interceptor/adapter
      ↓
Determine actual routing
      ↓
Preserve existing adapter architecture if covered

Do not create a new direct frontend Supabase path simply because a component currently calls "supabase.functions.invoke()".

---

33. BACKEND BRIDGE RULE

Navigation/UI changes must not bypass the established RentMaikar backend communication architecture.

Where an operation is intended to use the backend bridge, preserve:

RentMaikar frontend
       ↓
backend bridge / approved adapter
       ↓
rentmaikar-g2
       ↓
rentmaikar-backend

Do not introduce an unrelated direct browser-to-backend provider path.

---

34. COMMUNICATION SERVICE BOUNDARY

Communication UI may interact with:

SMS
WhatsApp
Email
In-app messaging
VoIP

but UI navigation must remain independent from provider implementation.

For example:

Call Centre UI

must not itself become the source of truth for:

Twilio session lifecycle

Likewise:

Messaging Centre UI

must not become the source of truth for:

Resend inbound email ingestion

---

35. MODAL / DRAWER / PAGE CLASSIFICATION

Before changing a component, classify it.

Page

Examples:

/admin/call-center
/admin/messaging
Admin Portal Support → Call Center
Admin Portal Support → Support Tasks

Feature-local tab

Examples:

Messaging Centre → Console
Messaging Centre → Bulk Tracker

Drawer/modal

Examples:

message details
lead details
booking details
confirmation dialogs

Global UI/service

Examples:

Communications Hub
active call session
global notification state
toast system
authentication

Do not convert one category into another without an explicit architectural reason.

---

36. OVERLAY AUDIT

Search for:

position: fixed
position: absolute
z-*
inset-*
fixed
absolute
createPortal

But do not treat these patterns as bugs automatically.

For each result determine:

Intentional overlay?
Global widget?
Modal?
Drawer?
Feature page?
Accidental sibling page?

Only the last category necessarily represents the navigation defect addressed by this specification.

---

37. PORTAL AUDIT

Inspect:

createPortal(...)

and UI libraries that use portals.

When leaving a feature, verify that feature-specific portals disappear.

Exception:

Global modal/service

that is intentionally controlled independently of the active page.

---

38. ERROR BOUNDARIES

The current Admin Portal already uses feature/section error boundaries.

Preserve the principle:

Dashboard shell
     │
     └── feature error boundary
             │
             └── active feature

A broken feature must not permanently lock the dashboard into that feature.

Where a standalone route has its own boundary, preserve it.

---

39. CURRENT CALL CENTRE ARCHITECTURE

The current Call Centre must be treated as:

Operational page
        +
Global telephony/session state

not merely:

ordinary tab

The following may remain globally active where required:

active call
voice device
media session
call state
call timers

The following is page-specific:

Call Centre command UI

---

40. CURRENT MESSAGING ARCHITECTURE

The Messaging Centre must be treated as:

Messaging feature
    │
    ├── conversation console
    ├── composer
    ├── drafts
    ├── templates
    ├── auto-reply
    ├── gateways
    ├── audit
    └── settings

Do not mistake these internal tabs for independent dashboard pages.

---

41. COMMUNICATIONS SUITE NAVIGATION

The current "CommunicationsSiblingsBar" provides navigation between:

Messaging Centre
Call Centre
Omni-Channel Composer
Marketing Engine
Floating Communications Hub

Every sibling action must resolve to its intended layer.

For example:

Messaging Centre
→ /admin/messaging

or, where intentionally embedded:

Messaging Centre
→ /admin?portal=support&tab=inbox

The implementation must not create two competing destinations for the same click without an explicit product reason.

---

42. MOBILE NAVIGATION

Mobile navigation must use the same authoritative page/view state.

Do not create a separate mobile-only:

activeFeature

that disagrees with:

route
portal
tab

Global floating communication controls may have a responsive representation, but their service/state model remains shared.

---

43. ACCESSIBILITY

Navigation must use semantic controls.

Prefer:

<button>
<NavLink>
<Link>
<nav>

and appropriate:

aria-current
aria-label
role

The current UI already uses "aria-current" in important Admin navigation areas.

Preserve this.

Floating Hub/dialog behaviour must also ensure that focus is not trapped after navigation or close.

---

44. PERFORMANCE

The application already uses lazy loading extensively.

Preserve route-level lazy loading.

Do not eagerly import every standalone operational page simply to solve navigation problems.

Do not rewrite the loading architecture unless a concrete defect is demonstrated.

---

45. TESTING REQUIREMENTS

At minimum, regression tests must verify:

Inbox
→ Call Centre

results in:

Call Centre only

and:

Call Centre
→ Support Tasks

results in:

Support Tasks only

and:

Support Tasks
→ CRM feature

results in the correct CRM feature only.

Also test:

URL deep link
refresh
browser navigation
URL synchronization
remembered state

---

46. EXISTING REGRESSION TEST REQUIREMENT

The repository already contains a navigation regression test around:

src/hooks/__tests__/usePersistedTab.test.tsx

It verifies:

- exactly one active feature
- sibling switching
- no snap-back
- deep-linking
- remount/refresh behaviour
- default URL initialization

This test must be preserved and expanded when the navigation architecture changes.

Do not delete it simply because the underlying implementation changes.

---

47. REQUIRED COMMUNICATION REGRESSION TESTS

Where testing infrastructure permits, verify:

Messaging Centre
→ Call Centre

does not leave Messaging Centre visible.

Verify:

Call Centre
→ Messaging Centre

does not leave Call Centre page UI visible.

Verify:

Call Centre
→ another page

does not terminate a deliberately persistent active call.

Verify:

Dedicated Call Centre route

does not display the floating Hub unless the active-call exception requires it.

Verify:

Dedicated Messaging route

does not display the floating Hub unnecessarily.

---

48. VISUAL REGRESSION REQUIREMENTS

Inspect:

- overlapping feature pages
- floating Hub covering active content
- duplicate communication panels
- duplicate headers
- duplicate sidebars
- stale drawers
- stale modals
- incorrect z-index
- unexpected fixed panels
- invisible click interceptors
- stale keyboard shortcuts
- incorrect mobile positioning

The test must distinguish intentional global overlays from accidental feature persistence.

---

49. DO NOT "FIX" WITH Z-INDEX

Never solve:

wrong feature is mounted

by changing:

z-index

The correct question is:

Why is this feature mounted?

If it is a page:

fix navigation/view selection

If it is a global service:

fix visibility/overlay lifecycle

If it is a legitimate modal:

fix modal state

---

50. DO NOT OVER-ENGINEER

Do not:

- replace the current Admin Portal with nested React Router routes without evidence
- introduce "<Outlet />" merely because it appears architecturally elegant
- replace "portal" + "tab" navigation unnecessarily
- remove the Communications Hub
- remove global call state
- migrate React Router
- migrate Supabase
- rewrite the dashboard
- change authentication
- change permissions
- change payment systems
- change Twilio
- change Resend
- change DNS
- change backend APIs

unless a direct dependency is demonstrated.

---

51. REQUIRED DISCOVERY BEFORE ANY NAVIGATION CHANGE

Before modifying navigation, inspect:

src/App.tsx
src/pages/AdminDashboard.tsx
src/pages/AdminAssistantDashboard.tsx
src/components/admin/PortalNavigation.tsx
src/components/admin/AdminUnifiedNavigation.tsx
src/lib/admin-tab-registry.ts
src/lib/admin-tab-permissions.ts
src/hooks/useDecoupledAdminPortal.ts
src/hooks/usePersistedTab.ts

Also inspect the relevant feature components.

For communication features inspect:

src/components/admin/communications-hub/
src/components/admin/communications/
src/components/admin/messaging/
src/components/admin/voip/
src/pages/admin/AdminCallCenterPage.tsx
src/pages/admin/MessagingCenterPage.tsx

---

52. NAVIGATION INVENTORY

Before changing code, produce an internal inventory:

Destination| Layer| Current mechanism| URL| Active-state source| Global service exception
Admin Dashboard| route| React Router| "/admin"| portal/tab| Yes
Support → Inbox| portal tab| portal + tab| "/admin?portal=support&tab=inbox"| admin portal state| Messaging state
Support → Call Centre| portal tab| portal + tab| "/admin?portal=support&tab=call-center"| admin portal state| Active call
Call Centre| standalone route| React Router| "/admin/call-center"| route| Active call
Messaging Centre| standalone route| React Router| "/admin/messaging"| route + local tab| Messaging state
Support Tasks| portal tab| portal + tab| "/admin?portal=support&tab=support-tasks"| admin portal state| No
CRM feature| portal tab| portal + tab| "/admin?portal=crm&tab=..."| admin portal state| No
Marketing| portal tab| portal + tab| "/admin?portal=marketing&tab=..."| admin portal state| Communication integration

The actual current registry must be consulted rather than relying on this example table.

---

53. ACCEPTANCE CRITERIA — NAVIGATION

The implementation is successful when:

- Every page-level navigation action has one clear destination.
- The active URL/state identifies the intended destination.
- The active portal identifies the intended portal.
- The active tab identifies the intended feature.
- Only the intended mutually-exclusive feature view is rendered.
- No unrelated sibling page remains mounted as an active view.
- The global Communications Hub is not mistaken for a sibling page.
- Intentional global services remain available.
- Active calls survive navigation when required.
- Dedicated communication routes behave correctly.
- Deep links work.
- Refresh works.
- Back/Forward behaviour is predictable.
- Unauthorized destinations remain protected.

---

54. ACCEPTANCE CRITERIA — LIFECYCLE

For every feature:

- feature-specific subscriptions clean up
- timers clean up
- event listeners clean up
- portals disappear when appropriate
- drawers disappear when appropriate
- modals disappear when appropriate
- keyboard shortcuts do not leak
- media resources are released when appropriate

Global services must not be accidentally destroyed.

---

55. ACCEPTANCE CRITERIA — COMMUNICATIONS

The implementation must preserve:

Communications Hub
        ↓
global communication state

and:

Call Centre
        ↓
page-level telephony UI

and:

active call
        ↓
global/persistent call session

and:

Messaging Centre
        ↓
message-management UI

These must not be collapsed into one lifecycle.

---

56. ACCEPTANCE CRITERIA — BACKEND COMMUNICATION

When touching a feature containing:

supabase.functions.invoke(...)

the implementation must first verify the catch-all interceptor/adapter.

Where backend bridge routing is authoritative, preserve it.

Do not create an unapproved direct browser-to-provider path.

---

57. ACCEPTANCE CRITERIA — ADMIN PERMISSIONS

The implementation must preserve:

TAB_PERMISSION_MAP
ADMIN_ONLY_TABS

and must not weaken:

ProtectedRoute
role checks
backend authorization

Navigation cleanup must never be accomplished by weakening authorization.

---

58. VALIDATION ORDER

First inspect:

package.json

and use the repository's actual scripts.

Then run the applicable validation sequence:

Lint
   ↓
Typecheck
   ↓
Vitest / existing tests
   ↓
Production build

For deployment-sensitive changes, separately verify:

GitHub Actions
Cloud Run
GitHub Pages
Production runtime

Do not treat those as the same test.

---

59. GIT SAFETY

Before changes:

git status
git branch --show-current

After changes:

git status
git diff --stat
git diff

Never use:

git reset --hard
git clean -fd

unless explicitly authorized.

Do not overwrite unrelated work.

---

60. IMPLEMENTATION ORDER

Phase 1 — Current-State Discovery

Inspect:

- App router
- Admin Portal
- Admin Assistant Portal
- portal registry
- permission registry
- persisted tab mechanism
- standalone communication routes
- Communications Hub
- call state
- messaging state
- overlays
- portals
- subscriptions

Phase 2 — Navigation Classification

Classify each destination as:

route
portal tab
feature tab
modal
drawer
global service

Phase 3 — Root Cause

Determine exactly why the reported feature remains visible or active.

Do not assume:

Unified Inbox permanently mounted

is still the root cause.

The current implementation already contains mechanisms specifically designed to prevent that.

Phase 4 — Minimal Repair

Repair only the actual architectural defect.

Phase 5 — Regression Protection

Add or update tests.

Phase 6 — Validation

Run:

lint
typecheck
tests
build

and production checks where applicable.

---

61. REQUIRED ROOT-CAUSE ANALYSIS

At completion report:

Root cause

State the exact mechanism.

Examples:

portal/tab state diverged from URL

or:

floating global Hub failed to close on navigation

or:

standalone route and embedded feature rendered simultaneously

or:

feature-specific overlay survived route change

Do not report merely:

navigation bug fixed

---

62. REQUIRED CHANGE REPORT

Report:

Files changed

List every modified file.

Architecture change

Before
→ ...

After
→ ...

Navigation state

Route:
...

Portal:
...

Tab:
...

Feature-local state:
...

Global services preserved

List any global service deliberately kept mounted.

Tests

Type-check: PASS/FAIL
Lint: PASS/FAIL
Vitest: PASS/FAIL/NOT AVAILABLE
Production build: PASS/FAIL

Pre-existing issues

Separate unrelated failures from the changes made.

---

63. FINAL ARCHITECTURAL MODEL

The current RentMaikar UI should conceptually resemble:

App
│
├── Global Providers
│   ├── Auth
│   ├── Backend Bridge
│   ├── Region
│   ├── User Type
│   ├── Query
│   └── Communications Hub
│
├── React Router
│
├── Global Services
│   ├── realtime
│   ├── notifications
│   ├── message unread state
│   └── active call/session
│
└── Current Route
    │
    ├── /admin
    │    │
    │    └── Unified Admin Portal
    │         │
    │         ├── CRM
    │         ├── ERP
    │         ├── SUPPORT
    │         │    ├── Task Portal
    │         │    ├── Inbox
    │         │    ├── Call Centre
    │         │    └── Support Tasks
    │         ├── Content
    │         ├── Marketing
    │         ├── Docs
    │         └── Control Plane
    │
    ├── /admin/call-center
    │
    ├── /admin/messaging
    │
    └── other standalone routes

The key distinction is:

GLOBAL SERVICE
      ≠
PAGE
      ≠
PORTAL TAB
      ≠
FEATURE TAB
      ≠
MODAL/DRAWER

---

64. FINAL ENGINEERING DIRECTIVE

The coding agent must:

1. Read this entire specification.
2. Inspect the actual current repository before changing navigation.
3. Treat the current implementation as authoritative over assumptions in this document.
4. Use the existing Admin Portal architecture where appropriate.
5. Use React Router for true application/page routes.
6. Use "portal" + "tab" for the existing Unified Admin Portal.
7. Use local tab state only for genuine feature-local tabs.
8. Do not create competing navigation state.
9. Preserve the current Communications Hub global architecture.
10. Preserve active-call survivability.
11. Preserve dedicated Call Centre and Messaging Centre routes.
12. Preserve portal/tab permission architecture.
13. Check every relevant "supabase.functions.invoke(...)" against the catch-all interceptor/adapter.
14. Preserve the backend bridge architecture.
15. Audit overlays and portals.
16. Audit feature lifecycle cleanup.
17. Add regression protection for the exact navigation defect discovered.
18. Run the repository's actual lint/typecheck/test/build commands.
19. Review the final diff.
20. Clearly separate the actual root cause from unrelated pre-existing problems.

---

65. DEFINITION OF DONE

The task is not done merely because clicking a navigation control changes what appears on screen.

It is done only when:

URL / route state
       ↓
portal state
       ↓
tab state
       ↓
rendered feature
       ↓
feature lifecycle
       ↓
overlay state
       ↓
global service state

all agree about what is supposed to be active.

For every mutually exclusive sibling feature:

«The previous feature cannot remain visually or functionally in control of the same dashboard surface unless it is an explicitly designed global service, active-call session, notification service, or other documented global exception.»

The current RentMaikar architecture should therefore optimize for:

ONE AUTHORITATIVE DESTINATION
+
ONE ACTIVE PAGE/PORTAL FEATURE
+
CONTROLLED FEATURE LIFECYCLE
+
EXPLICIT GLOBAL SERVICE EXCEPTIONS

rather than forcing every feature into a single routing pattern.
