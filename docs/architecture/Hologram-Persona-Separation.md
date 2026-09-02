Refactor: Separate Hologram IoT Platform from Persona Verification
Objective
Refactor the RentMaikar platform so that Hologram is treated exclusively as the IoT/eSIM connectivity provider and Persona is treated exclusively as the identity verification provider.
These two integrations must have completely independent business logic, APIs, workflows, permissions, and user interfaces.
Access Control

Separate permissions.

Persona administrators(on Admin and Admin Assistant dashboars):

Manage verification

Review KYC

Approve users

Reject users

Hologram administrators(Admin dashboard):

Manage SIMs

Manage IoT devices

Purchase eSIMs

Monitor fleet connectivity

Diagnose hardware

UI Refactoring.

Create separate navigation sections.

Verification (On Admin dashboard and Admin Assistant dashboards)

Identity Verification

Business Verification

Verification Reports

Compliance

Fleet Connectivity (on Admin dashboard)

eSIM Marketplace

SIM Inventory

Connected Devices

Vehicle Connectivity

Data Usage

IoT Alerts

Device Diagnostics

Expected Outcome

The RentMaikar platform should clearly distinguish:

Persona

Identity verification platform.

Hologram

IoT connectivity and eSIM management platform powering smart vehicles, trackers, telematics devices, sensors, and fleet connectivity.

No shared business logic should remain between these two integrations except standard platform authentication and authorization.

