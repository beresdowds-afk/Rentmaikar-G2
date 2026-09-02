Hologram is the connectivity platform for RentMaikar's Smart Vehicle ecosystem.
It must never participate in user verification.
Create a Hologran portal on Admin dashboard if it doesn't exist.
Create a dedicated Hologram module (if it doesnt exist) responsible for:
eSIM Marketplace
Support purchasing:
Hologram eSIM plans
IoT SIM plans
Regional data plans
Global data plans
Allow administrators to:
Purchase SIMs
Assign SIMs
Suspend SIMs
Reactivate SIMs
Change plans
Replace SIMs
Monitor inventory

Device Connectivity.

Associate Hologram connectivity with:
GPS trackers
OBD-II devices
EV Battery Management Systems
Fuel monitoring sensors
Smart locks
Dash cameras
Asset trackers
Temperature sensors
Cargo sensors
Driver tablets
Mobile hotspots

Vehicle Assignment

Allow one or more IoT devices to be assigned to a vehicle.

Store:

Vehicle ID

Device ID

SIM ID

ICCID

IMEI

Provider SIM ID

Hologram Link ID

Activation status

Data usage

Last communication

Signal quality

Connectivity Dashboard

Create an administrative dashboard displaying:

Active SIMs

Suspended SIMs

Offline devices

Data usage

Monthly consumption

Device health

Signal strength

Last heartbeat

Connectivity alerts

IoT Management APIs

Implement services for:

List SIMs

Purchase SIMs

Activate SIM

Suspend SIM

Resume SIM

Retrieve usage

Retrieve billing

Retrieve diagnostics

Retrieve session history

Device Synchronization

Scheduled jobs should synchronize:

SIM status

Data consumption

Signal information

Device status

Last network session

Connectivity events

without interacting with Persona.

Database Separation

Create or retain Hologram-specific tables only for IoT management.

Examples include:

iot_sim_cards

iot_devices

vehicle_devices

sim_usage_logs

connectivity_events

hologram_sync_logs

device_alerts

Do not reference Persona tables.

