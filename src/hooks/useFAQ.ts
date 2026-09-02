import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface FAQCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  display_order: number;
  is_active: boolean;
  region: 'USA' | 'Nigeria' | (string & {}) | 'all';
  created_at: string;
  updated_at: string;
}

export interface FAQItem {
  id: string;
  category_id: string;
  question: string;
  answer: string;
  display_order: number;
  is_active: boolean;
  is_public: boolean;
  region: 'USA' | 'Nigeria' | (string & {}) | 'all';
  created_at: string;
  updated_at: string;
  category?: FAQCategory;
}

export interface PolicyVersion {
  id: string;
  policy_type: 'terms' | 'privacy';
  version: string;
  region: 'USA' | 'Nigeria' | (string & {});
  title: string;
  content: string;
  summary: string | null;
  effective_date: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PolicyAcceptance {
  id: string;
  user_id: string;
  policy_version_id: string;
  policy_type: 'terms' | 'privacy';
  accepted_at: string;
  ip_address: string | null;
  user_agent: string | null;
  region: 'USA' | 'Nigeria' | (string & {}) | null;
}

export function useFAQ(regionFilter?: 'USA' | 'Nigeria' | (string & {}) | 'all') {
  const [categories, setCategories] = useState<FAQCategory[]>([]);
  const [items, setItems] = useState<FAQItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFAQ = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch categories
      let categoryQuery = supabase
        .from('faq_categories')
        .select('*')
        .order('display_order');
      
      if (regionFilter && regionFilter !== 'all') {
        categoryQuery = categoryQuery.or(`region.eq.${regionFilter},region.eq.all`);
      }

      const { data: categoriesData, error: categoriesError } = await categoryQuery;
      if (categoriesError) throw categoriesError;

      // Fetch items
      let itemsQuery = supabase
        .from('faq_items')
        .select('*, category:faq_categories(*)')
        .order('display_order');
      
      if (regionFilter && regionFilter !== 'all') {
        itemsQuery = itemsQuery.or(`region.eq.${regionFilter},region.eq.all`);
      }

      const { data: itemsData, error: itemsError } = await itemsQuery;
      if (itemsError) throw itemsError;

      setCategories(categoriesData as FAQCategory[] || []);
      setItems(itemsData as FAQItem[] || []);
    } catch (error) {
      console.error('Error fetching FAQ:', error);
      toast.error('Failed to load FAQ');
    } finally {
      setLoading(false);
    }
  }, [regionFilter]);

  useEffect(() => {
    fetchFAQ();
  }, [fetchFAQ]);

  // Admin functions
  const createCategory = async (category: Partial<FAQCategory>) => {
    const { data, error } = await supabase
      .from('faq_categories')
      .insert([category as any])
      .select()
      .single();
    
    if (error) {
      toast.error('Failed to create category');
      throw error;
    }
    
    toast.success('Category created');
    await fetchFAQ();
    return data;
  };

  const updateCategory = async (id: string, updates: Partial<FAQCategory>) => {
    const { error } = await supabase
      .from('faq_categories')
      .update(updates)
      .eq('id', id);
    
    if (error) {
      toast.error('Failed to update category');
      throw error;
    }
    
    toast.success('Category updated');
    await fetchFAQ();
  };

  const deleteCategory = async (id: string) => {
    const { error } = await supabase
      .from('faq_categories')
      .delete()
      .eq('id', id);
    
    if (error) {
      toast.error('Failed to delete category');
      throw error;
    }
    
    toast.success('Category deleted');
    await fetchFAQ();
  };

  const createItem = async (item: Partial<FAQItem>) => {
    const { data, error } = await supabase
      .from('faq_items')
      .insert([item as any])
      .select()
      .single();
    
    if (error) {
      toast.error('Failed to create FAQ item');
      throw error;
    }
    
    toast.success('FAQ item created');
    await fetchFAQ();
    return data;
  };

  const updateItem = async (id: string, updates: Partial<FAQItem>) => {
    const { error } = await supabase
      .from('faq_items')
      .update(updates)
      .eq('id', id);
    
    if (error) {
      toast.error('Failed to update FAQ item');
      throw error;
    }
    
    toast.success('FAQ item updated');
    await fetchFAQ();
  };

  const deleteItem = async (id: string) => {
    const { error } = await supabase
      .from('faq_items')
      .delete()
      .eq('id', id);
    
    if (error) {
      toast.error('Failed to delete FAQ item');
      throw error;
    }
    
    toast.success('FAQ item deleted');
    await fetchFAQ();
  };

  return {
    categories,
    items,
    loading,
    fetchFAQ,
    createCategory,
    updateCategory,
    deleteCategory,
    createItem,
    updateItem,
    deleteItem,
  };
}

export function usePolicyVersions() {
  const [policies, setPolicies] = useState<PolicyVersion[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('policy_versions')
        .select('*')
        .order('effective_date', { ascending: false });
      
      if (error) throw error;
      setPolicies(data as PolicyVersion[] || []);
    } catch (error) {
      console.error('Error fetching policies:', error);
      toast.error('Failed to load policies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  const getActivePolicy = (type: 'terms' | 'privacy', region: 'USA' | 'Nigeria' | (string & {})) => {
    return policies.find(p => p.policy_type === type && p.region === region && p.is_active);
  };

  const createPolicy = async (policy: Partial<PolicyVersion>) => {
    const { data, error } = await supabase
      .from('policy_versions')
      .insert([policy as any])
      .select()
      .single();
    
    if (error) {
      toast.error('Failed to create policy version');
      throw error;
    }
    
    toast.success('Policy version created');
    await fetchPolicies();
    return data;
  };

  const updatePolicy = async (id: string, updates: Partial<PolicyVersion>) => {
    const { error } = await supabase
      .from('policy_versions')
      .update(updates)
      .eq('id', id);
    
    if (error) {
      toast.error('Failed to update policy');
      throw error;
    }
    
    toast.success('Policy updated');
    await fetchPolicies();
  };

  const activatePolicy = async (id: string, type: 'terms' | 'privacy', region: 'USA' | 'Nigeria' | (string & {})) => {
    // Deactivate other versions of same type and region
    await supabase
      .from('policy_versions')
      .update({ is_active: false })
      .eq('policy_type', type)
      .eq('region', region);
    
    // Activate selected version
    const { error } = await supabase
      .from('policy_versions')
      .update({ is_active: true })
      .eq('id', id);
    
    if (error) {
      toast.error('Failed to activate policy');
      throw error;
    }
    
    toast.success('Policy activated');
    await fetchPolicies();
  };

  return {
    policies,
    loading,
    fetchPolicies,
    getActivePolicy,
    createPolicy,
    updatePolicy,
    activatePolicy,
  };
}

export function usePolicyAcceptance(userId?: string) {
  const [acceptances, setAcceptances] = useState<PolicyAcceptance[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAcceptances = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('policy_acceptances')
        .select('*')
        .eq('user_id', userId);
      
      if (error) throw error;
      setAcceptances(data as PolicyAcceptance[] || []);
    } catch (error) {
      console.error('Error fetching acceptances:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchAcceptances();
  }, [fetchAcceptances]);

  const hasAcceptedPolicy = (policyVersionId: string) => {
    return acceptances.some(a => a.policy_version_id === policyVersionId);
  };

  const acceptPolicy = async (policyVersionId: string, policyType: 'terms' | 'privacy', region: 'USA' | 'Nigeria' | (string & {})) => {
    if (!userId) {
      toast.error('You must be logged in to accept policies');
      return;
    }

    const { error } = await supabase
      .from('policy_acceptances')
      .insert({
        user_id: userId,
        policy_version_id: policyVersionId,
        policy_type: policyType,
        region,
        user_agent: navigator.userAgent,
      });
    
    if (error) {
      if (error.code === '23505') {
        // Already accepted
        return;
      }
      toast.error('Failed to record policy acceptance');
      throw error;
    }
    
    await fetchAcceptances();
  };

  return {
    acceptances,
    loading,
    hasAcceptedPolicy,
    acceptPolicy,
    fetchAcceptances,
  };
}
