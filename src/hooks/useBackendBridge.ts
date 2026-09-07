import { useContext } from "react";
import { BackendBridgeContext, type BackendBridgeContextValue } from "@/contexts/BackendBridgeContext";

export function useBackendBridge(): BackendBridgeContextValue {
  const ctx = useContext(BackendBridgeContext);
  if (!ctx) {
    throw new Error("useBackendBridge must be used within a BackendBridgeProvider");
  }
  return ctx;
}

export default useBackendBridge;
