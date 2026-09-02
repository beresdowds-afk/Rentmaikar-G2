import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  resolveGovIdPolicy,
  type GovIdPolicy,
  type IdClassRule,
} from "@/lib/government-id";

/** All admin-configured ID class rules (readable by any signed-in user). */
export function usePersonaIdClassRules() {
  return useQuery({
    queryKey: ["persona-id-class-rules"],
    staleTime: 60_000,
    queryFn: async (): Promise<IdClassRule[]> => {
      const { data, error } = await supabase
        .from("persona_id_class_rules")
        .select("country_code, subject_role, accepted_classes, requires_drivers_license, is_active, notes")
        .order("country_code");
      if (error) throw error;
      return (data ?? []) as unknown as IdClassRule[];
    },
  });
}

/**
 * Effective government ID policy for a given role + region, honouring the
 * admin-managed rules and falling back to the compiled-in defaults.
 */
export function usePersonaIdPolicy(
  role: string | null | undefined,
  region: string | null | undefined,
): { policy: GovIdPolicy; isLoading: boolean } {
  const { data, isLoading } = usePersonaIdClassRules();
  return { policy: resolveGovIdPolicy(role, region, data ?? null), isLoading };
}
