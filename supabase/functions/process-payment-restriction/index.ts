if (!telemetry) {
  return json(
    {
      success: false,
      error: "Unable to verify stationary vehicle state",
    },
    409
  );
}

if (Number(telemetry.speed) >= 2) {
  return json(
    {
      success: false,
      error: "Vehicle is moving; immobilization refused",
    },
    409
  );
}

if (telemetry.ignition_status === true) {
  return json(
    {
      success: false,
      error: "Vehicle ignition is active; immobilization refused",
    },
    409
  );
}
