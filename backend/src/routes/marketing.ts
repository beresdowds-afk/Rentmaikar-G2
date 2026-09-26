/**
 * Authoritative RentMaikar Marketing Router for Backend Gateway
 * Consolidates the complete Marketing Engine under /api/marketing/*
 * Eliminates competing stub implementations.
 */

import { marketingApiRouter } from "../marketing/routes";

// Export the authoritative Marketing Engine router
export const marketingRouter = marketingApiRouter;
