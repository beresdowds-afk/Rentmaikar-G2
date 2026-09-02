import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRegion } from '@/contexts/RegionContext';
import { AGREEMENT_TYPE } from '@/lib/agreement-template';

export interface ActiveAgreementTemplate {
  id: string;
  template_key: string;
  agreement_type: string;
  region: string;
  title: string;
  version: string;
  content: string;
}

export interface PlatformEntityInfo {
  name: string;
  email: string | null;
  phone: string | null;
}

/**
 * Loads the currently ACTIVE agreement template for the caller's region plus
 * the regional platform entity details. Nothing about the agreement body is
 * hard-coded in the app — admins publish it from the agreement editor.
 */
export const useAgreementTemplate = (agreementType: string = AGREEMENT_TYPE) => {
  const { country } = useRegion();
  const region = country === 'Nigeria' ? 'Nigeria' : 'USA';
  const [template, setTemplate] = useState<ActiveAgreementTemplate | null>(null);
  const [entity, setEntity] = useState<PlatformEntityInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const [tplRes, infoRes] = await Promise.all([
        (supabase as any)
          .from('legal_agreement_templates')
          .select('id, template_key, agreement_type, region, title, version, content')
          .eq('agreement_type', agreementType)
          .eq('region', region)
          .eq('is_active', true)
          .order('updated_at', { ascending: false })
          .limit(1),
        (supabase as any)
          .from('platform_company_info')
          .select('company_name, email, phone')
          .eq('region', region)
          .eq('is_active', true)
          .limit(1),
      ]);

      if (cancelled) return;
      setLoading(false);

      if (tplRes.error) {
        setError(tplRes.error.message);
      } else {
        const latest = (tplRes.data ?? [])[0] as ActiveAgreementTemplate | undefined;
        setTemplate(latest ?? null);
        if (!latest) setError(`No active ${agreementType} template published for ${region}.`);
      }

      const info = (infoRes?.data ?? [])[0];
      if (info) {
        setEntity({ name: info.company_name, email: info.email ?? null, phone: info.phone ?? null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [agreementType, region]);

  return { template, entity, region, loading, error };
};
