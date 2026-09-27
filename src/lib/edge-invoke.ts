import { supabase } from "@/integrations/supabase/client";

/**
 * Extracts a descriptive, human-readable error message from an edge function invocation failure.
 * Safely handles Supabase FunctionsHttpError objects, structured response JSON, and standard Errors.
 */
export async function readEdgeError(error: unknown, fallbackMessage = "Edge function request failed"): Promise<string> {
  if (!error) return fallbackMessage;
  if (typeof error === "string") return error;

  // Handle Supabase FunctionsHttpError which contains a context Response object
  const anyErr = error as Record<string, unknown>;
  if (anyErr.context && typeof (anyErr.context as Record<string, unknown>).json === "function") {
    try {
      const body = await (anyErr.context as { json: () => Promise<Record<string, unknown>> }).json();
      if (body?.error) {
        return typeof body.error === "string" ? body.error : JSON.stringify(body.error);
      }
      if (body?.message) {
        return typeof body.message === "string" ? body.message : JSON.stringify(body.message);
      }
    } catch {
      // response body could not be parsed as JSON
    }
  }

  if (typeof anyErr.message === "string" && anyErr.message.trim()) {
    return anyErr.message;
  }

  return fallbackMessage;
}

/**
 * Robust wrapper for invoking Supabase Edge Functions.
 * Returns normalized { data, error } and unwraps HTTP/API error payloads.
 */
export async function invokeEdge<T = unknown>(
  functionName: string,
  body?: Record<string, unknown> | FormData,
  options?: {
    headers?: Record<string, string>;
  }
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
      headers: options?.headers,
    });

    if (error) {
      const message = await readEdgeError(error, error.message || `Failed to invoke ${functionName}`);
      return { data: null, error: new Error(message) };
    }

    return { data: data as T, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: new Error(message) };
  }
}
