Administrative Role-Based Portal Access and Permission Policy

This document defines the authorization model governing administrative access across all management portals within the RentMaikar platform. It establishes a centralized, permission-based access control system that ensures administrators, administrative assistants, and support service personnel share access only to the portals and capabilities explicitly granted through the Role Management Portal.

The authorization system shall operate using the Principle of Least Privilege, ensuring that every administrative user has access only to the resources, functions, and actions required to perform their assigned responsibilities.

Administrative Roles

Role| Description| Default Access
Platform Administrator| Primary platform administrator with full administrative authority.| Full access to every administrative portal, module, feature, dashboard, and system function.
Administrative Assistant| Administrative personnel assigned responsibilities by a Platform Administrator.| Access only to portals and permissions explicitly granted through Role Management.
Support Services| Customer support, operations, moderation, compliance, verification, finance, technical support, or other operational staff.| Access only to portals and permissions explicitly granted through Role Management.

Administrative Authority

The Platform Administrator shall have unrestricted access to every administrative portal, including all current and future administrative modules.

The Platform Administrator may:

- Create Administrative Assistant accounts.
- Create Support Services accounts.
- Create custom administrative roles.
- Assign users to one or more administrative roles.
- Grant portal access.
- Grant functional permissions.
- Modify permissions.
- Revoke permissions.
- Suspend administrative access.
- Reactivate administrative access.
- Delete administrative roles.
- Create reusable permission templates.
- Audit administrative activities.

No other administrative role shall possess unrestricted administrative authority unless explicitly granted.

Role Management Portal

The Role Management Portal shall be the single source of truth for all administrative authorization.

Every permission assigned to an Administrative Assistant or Support Services account shall originate from the Role Management Portal.

Permission changes shall become effective immediately after validation.

The authorization engine shall never rely on hard-coded permissions, client-side permission checks, cached role assumptions, or duplicated permission definitions.

Portal Authorization

Each administrative portal shall declare its required permissions before rendering.

Examples include but are not limited to:

- User Management
- Driver Management
- Vehicle Management
- Fleet Management
- Owner Management
- Marketplace Management
- Booking Management
- Subscription Management
- Payments
- Finance
- Promotions
- Customer Support
- Compliance
- Identity Verification
- Regional Administration
- CMS
- Analytics
- Reports
- Notifications
- Security
- API Management
- Integrations
- Audit Logs
- System Configuration
- Role Management

Access to each portal shall require explicit authorization.

Possessing access to one administrative portal shall never automatically grant access to another unless specifically configured by the Platform Administrator.

Permission Categories

Permissions shall support independent authorization for each administrative function, including but not limited to:

- View
- Create
- Edit
- Delete
- Approve
- Reject
- Verify
- Assign
- Transfer
- Export
- Import
- Configure
- Execute
- Moderate
- Manage
- Archive
- Restore

Permissions shall be independently configurable for every portal.

For example, an Administrative Assistant may be permitted to:

- View Drivers
- Edit Drivers
- Verify Driver Documents

without being allowed to:

- Delete Drivers
- Modify Payments
- Manage Roles

Dashboard Rendering

The Administrative Dashboard shall dynamically render only those portals the authenticated administrative user is authorized to access.

Unauthorized portals shall not:

- Appear in navigation.
- Appear in search.
- Be accessible by URL.
- Be preloadable.
- Be visible through cached navigation.
- Be discoverable through API responses.

Dashboard navigation shall be generated entirely from validated server-side permissions.

Shared Portal Access

Multiple administrative users may simultaneously access the same administrative portal provided each possesses the required permissions.

Shared portal access shall not imply identical permissions.

Each user's available actions within a portal shall be determined independently according to their assigned permissions.

Two users viewing the same portal may therefore have different capabilities.

Permission Evaluation

Permissions shall be evaluated only after:

- Authentication has completed.
- Administrative identity has been verified.
- Assigned roles have been loaded.
- Permission assignments have been retrieved.
- Regional administrative scope has been determined where applicable.

Authorization decisions shall never be based upon partially loaded or undefined permission data.

Permission Changes

When a Platform Administrator modifies permissions:

- Updated permissions shall become effective immediately.
- Active administrative sessions shall refresh their authorization.
- Newly granted portals shall become available without requiring account recreation.
- Revoked permissions shall immediately remove portal access.
- Unauthorized users shall be redirected to an authorized administrative landing page without exposing restricted information.

Permission changes shall never require application redeployment.

Security Requirements

Authorization shall be enforced on both the client and server.

Every API endpoint, RPC, Edge Function, database policy, and administrative action shall independently validate permissions before execution.

Client-side authorization shall improve user experience only and shall never be relied upon as the primary security mechanism.

Audit and Compliance

Every administrative action shall be recorded with:

- User ID
- Administrative role
- Granted permissions
- Portal accessed
- Action performed
- Timestamp
- Region
- Device information where available
- Success or failure status

Permission grants, permission revocations, role creation, role deletion, and authorization failures shall be permanently auditable.

Stability Requirements

The authorization system shall be deterministic, idempotent, and resilient.

It shall:

- Prevent permission race conditions.
- Prevent stale permission caches.
- Prevent unauthorized portal rendering.
- Prevent permission inheritance errors.
- Prevent redirect loops caused by authorization failures.
- Prevent partially rendered administrative dashboards.
- Prevent access decisions using incomplete permission data.
- Handle temporary service failures gracefully.
- Log authorization failures without exposing sensitive information.
- Continue rendering authorized portals even if unrelated administrative modules are temporarily unavailable.

Future Expansion

This authorization model shall automatically support future administrative portals and modules.

Every newly introduced administrative portal shall register its required permissions with the Role Management system before becoming accessible.

The Platform Administrator shall automatically have full access to all newly introduced administrative portals unless explicitly restricted by future platform policy.

Administrative Assistants and Support Services shall receive access to new portals only after the Platform Administrator explicitly grants the required permissions through the Role Management Portal.

This document shall serve as the single authoritative policy governing administrative authorization, portal visibility, role assignment, permission evaluation, dashboard rendering, and access control across every administrative component of the RentMaikar platform.
