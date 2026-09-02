export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_links: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          link_type: string
          notes: string | null
          updated_at: string
          user_a_id: string
          user_b_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          link_type?: string
          notes?: string | null
          updated_at?: string
          user_a_id: string
          user_b_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          link_type?: string
          notes?: string | null
          updated_at?: string
          user_a_id?: string
          user_b_id?: string
        }
        Relationships: []
      }
      admin_assistant_permissions: {
        Row: {
          can_approve_applications: boolean
          can_delete_users: boolean
          can_manage_content: boolean
          can_manage_iot: boolean
          can_manage_payments: boolean
          can_manage_rentals: boolean
          can_manage_support_tasks: boolean
          can_manage_users: boolean
          can_manage_vehicles: boolean
          can_send_communications: boolean
          can_view_audit_log: boolean
          can_view_communications: boolean
          can_view_iot: boolean
          can_view_payments: boolean
          can_view_rentals: boolean
          can_view_reports: boolean
          can_view_support_tasks: boolean
          can_view_users: boolean
          can_view_vehicles: boolean
          created_at: string
          granted_by: string | null
          id: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          can_approve_applications?: boolean
          can_delete_users?: boolean
          can_manage_content?: boolean
          can_manage_iot?: boolean
          can_manage_payments?: boolean
          can_manage_rentals?: boolean
          can_manage_support_tasks?: boolean
          can_manage_users?: boolean
          can_manage_vehicles?: boolean
          can_send_communications?: boolean
          can_view_audit_log?: boolean
          can_view_communications?: boolean
          can_view_iot?: boolean
          can_view_payments?: boolean
          can_view_rentals?: boolean
          can_view_reports?: boolean
          can_view_support_tasks?: boolean
          can_view_users?: boolean
          can_view_vehicles?: boolean
          created_at?: string
          granted_by?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          can_approve_applications?: boolean
          can_delete_users?: boolean
          can_manage_content?: boolean
          can_manage_iot?: boolean
          can_manage_payments?: boolean
          can_manage_rentals?: boolean
          can_manage_support_tasks?: boolean
          can_manage_users?: boolean
          can_manage_vehicles?: boolean
          can_send_communications?: boolean
          can_view_audit_log?: boolean
          can_view_communications?: boolean
          can_view_iot?: boolean
          can_view_payments?: boolean
          can_view_rentals?: boolean
          can_view_reports?: boolean
          can_view_support_tasks?: boolean
          can_view_users?: boolean
          can_view_vehicles?: boolean
          created_at?: string
          granted_by?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_assistant_user_assignments: {
        Row: {
          assigned_by: string | null
          assistant_id: string
          created_at: string
          id: string
          notes: string | null
          target_user_id: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          assistant_id: string
          created_at?: string
          id?: string
          notes?: string | null
          target_user_id: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          assistant_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          target_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          target_id: string | null
          target_table: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_table?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_table?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      admin_daily_tasks: {
        Row: {
          category: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string | null
          id: string
          is_completed: boolean
          priority: string
          source_id: string | null
          source_table: string | null
          task_date: string
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_completed?: boolean
          priority?: string
          source_id?: string | null
          source_table?: string | null
          task_date?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_completed?: boolean
          priority?: string
          source_id?: string | null
          source_table?: string | null
          task_date?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          body: string | null
          created_at: string
          email_opt_in: boolean
          email_sent_at: string | null
          id: string
          kind: string
          metadata: Json
          read_at: string | null
          recipient_id: string
          related_access_level: string | null
          related_stage: string | null
          related_user_id: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          email_opt_in?: boolean
          email_sent_at?: string | null
          id?: string
          kind: string
          metadata?: Json
          read_at?: string | null
          recipient_id: string
          related_access_level?: string | null
          related_stage?: string | null
          related_user_id?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          email_opt_in?: boolean
          email_sent_at?: string | null
          id?: string
          kind?: string
          metadata?: Json
          read_at?: string | null
          recipient_id?: string
          related_access_level?: string | null
          related_stage?: string | null
          related_user_id?: string | null
          title?: string
        }
        Relationships: []
      }
      admin_sessions: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          is_active: boolean
          last_activity: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          is_active?: boolean
          last_activity?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          is_active?: boolean
          last_activity?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      agreement_reminder_preferences: {
        Row: {
          created_at: string
          email_enabled: boolean
          id: string
          opted_in: boolean
          reminder_days: number[]
          sms_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_enabled?: boolean
          id?: string
          opted_in?: boolean
          reminder_days?: number[]
          sms_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_enabled?: boolean
          id?: string
          opted_in?: boolean
          reminder_days?: number[]
          sms_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agreement_renewal_alerts: {
        Row: {
          agreement_id: string
          alert_type: string
          created_at: string
          id: string
          sent_at: string
          sent_to: Json | null
        }
        Insert: {
          agreement_id: string
          alert_type: string
          created_at?: string
          id?: string
          sent_at?: string
          sent_to?: Json | null
        }
        Update: {
          agreement_id?: string
          alert_type?: string
          created_at?: string
          id?: string
          sent_at?: string
          sent_to?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "agreement_renewal_alerts_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "legal_agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      agreement_signature_audit: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string
          agreement_id: string
          agreement_type: string
          changed_columns: string[]
          created_at: string
          id: string
          metadata: Json
          new_status: string | null
          old_status: string | null
          signature_length: number | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role: string
          agreement_id: string
          agreement_type: string
          changed_columns?: string[]
          created_at?: string
          id?: string
          metadata?: Json
          new_status?: string | null
          old_status?: string | null
          signature_length?: number | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string
          agreement_id?: string
          agreement_type?: string
          changed_columns?: string[]
          created_at?: string
          id?: string
          metadata?: Json
          new_status?: string | null
          old_status?: string | null
          signature_length?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agreement_signature_audit_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "legal_agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      api_key_usage_log: {
        Row: {
          api_key_id: string
          created_at: string
          endpoint: string
          id: string
          ip_address: string | null
          method: string
          response_time_ms: number | null
          status_code: number | null
          user_agent: string | null
        }
        Insert: {
          api_key_id: string
          created_at?: string
          endpoint: string
          id?: string
          ip_address?: string | null
          method: string
          response_time_ms?: number | null
          status_code?: number | null
          user_agent?: string | null
        }
        Update: {
          api_key_id?: string
          created_at?: string
          endpoint?: string
          id?: string
          ip_address?: string | null
          method?: string
          response_time_ms?: number | null
          status_code?: number | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_key_usage_log_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          allowed_origins: string[] | null
          created_at: string
          created_by: string
          description: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          permissions: Json
          rate_limit_per_hour: number | null
          usage_count: number
        }
        Insert: {
          allowed_origins?: string[] | null
          created_at?: string
          created_by: string
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          permissions?: Json
          rate_limit_per_hour?: number | null
          usage_count?: number
        }
        Update: {
          allowed_origins?: string[] | null
          created_at?: string
          created_by?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          permissions?: Json
          rate_limit_per_hour?: number | null
          usage_count?: number
        }
        Relationships: []
      }
      api_validation_endpoints: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          method: string
          name: string
          path: string
          rate_limit_per_minute: number | null
          request_schema: Json | null
          required_permissions: string[] | null
          requires_auth: boolean
          response_schema: Json | null
          updated_at: string
          version: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          method?: string
          name: string
          path: string
          rate_limit_per_minute?: number | null
          request_schema?: Json | null
          required_permissions?: string[] | null
          requires_auth?: boolean
          response_schema?: Json | null
          updated_at?: string
          version?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          method?: string
          name?: string
          path?: string
          rate_limit_per_minute?: number | null
          request_schema?: Json | null
          required_permissions?: string[] | null
          requires_auth?: boolean
          response_schema?: Json | null
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      application_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          application_id: string | null
          changed: Json
          created_at: string
          details: Json
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          application_id?: string | null
          changed?: Json
          created_at?: string
          details?: Json
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          application_id?: string | null
          changed?: Json
          created_at?: string
          details?: Json
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_audit_log_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_pipeline_events: {
        Row: {
          actor_id: string | null
          application_id: string
          created_at: string
          details: Json
          event_type: string
          id: string
          message: string | null
          status: string
        }
        Insert: {
          actor_id?: string | null
          application_id: string
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          message?: string | null
          status: string
        }
        Update: {
          actor_id?: string | null
          application_id?: string
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          message?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_pipeline_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_recovery_requests: {
        Row: {
          application_id: string
          created_at: string
          documents: Json
          id: string
          reason: string
          requested_by: string | null
          resolution_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          application_id: string
          created_at?: string
          documents?: Json
          id?: string
          reason: string
          requested_by?: string | null
          resolution_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          created_at?: string
          documents?: Json
          id?: string
          reason?: string
          requested_by?: string | null
          resolution_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_recovery_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          agreed_fees: boolean | null
          agreed_iot: boolean
          agreed_privacy: boolean
          agreed_terms: boolean
          application_type: Database["public"]["Enums"]["application_type"]
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          city: string
          consent_recorded_at: string | null
          country: string
          created_at: string
          data_sharing_consent: boolean
          desired_weekly_price: number | null
          email: string
          first_name: string
          has_driver_license: boolean | null
          has_insurance: boolean | null
          has_registration: boolean | null
          id: string
          last_name: string
          messaging_channel: string
          messaging_consent: boolean
          phone_country: string
          phone_number: string
          recovered_from_application_id: string | null
          recovery_eligible_at: string | null
          recovery_status: string
          recycle_count: number
          referee1_address: string | null
          referee1_email: string | null
          referee1_name: string | null
          referee1_phone: string | null
          referee2_address: string | null
          referee2_email: string | null
          referee2_name: string | null
          referee2_phone: string | null
          referee3_address: string | null
          referee3_email: string | null
          referee3_name: string | null
          referee3_phone: string | null
          referees_verification_status: string
          region: string
          rejection_reason: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rideshare_platforms: string[] | null
          security_deposit_acknowledged: boolean | null
          status: Database["public"]["Enums"]["application_status"]
          street_address: string | null
          updated_at: string
          user_id: string | null
          vehicle_color: string | null
          vehicle_description: string | null
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_plate: string | null
          vehicle_year: number | null
          zip_code: string
        }
        Insert: {
          agreed_fees?: boolean | null
          agreed_iot?: boolean
          agreed_privacy?: boolean
          agreed_terms?: boolean
          application_type: Database["public"]["Enums"]["application_type"]
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          city: string
          consent_recorded_at?: string | null
          country: string
          created_at?: string
          data_sharing_consent?: boolean
          desired_weekly_price?: number | null
          email: string
          first_name: string
          has_driver_license?: boolean | null
          has_insurance?: boolean | null
          has_registration?: boolean | null
          id?: string
          last_name: string
          messaging_channel?: string
          messaging_consent?: boolean
          phone_country: string
          phone_number: string
          recovered_from_application_id?: string | null
          recovery_eligible_at?: string | null
          recovery_status?: string
          recycle_count?: number
          referee1_address?: string | null
          referee1_email?: string | null
          referee1_name?: string | null
          referee1_phone?: string | null
          referee2_address?: string | null
          referee2_email?: string | null
          referee2_name?: string | null
          referee2_phone?: string | null
          referee3_address?: string | null
          referee3_email?: string | null
          referee3_name?: string | null
          referee3_phone?: string | null
          referees_verification_status?: string
          region?: string
          rejection_reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rideshare_platforms?: string[] | null
          security_deposit_acknowledged?: boolean | null
          status?: Database["public"]["Enums"]["application_status"]
          street_address?: string | null
          updated_at?: string
          user_id?: string | null
          vehicle_color?: string | null
          vehicle_description?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
          vehicle_year?: number | null
          zip_code: string
        }
        Update: {
          agreed_fees?: boolean | null
          agreed_iot?: boolean
          agreed_privacy?: boolean
          agreed_terms?: boolean
          application_type?: Database["public"]["Enums"]["application_type"]
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          city?: string
          consent_recorded_at?: string | null
          country?: string
          created_at?: string
          data_sharing_consent?: boolean
          desired_weekly_price?: number | null
          email?: string
          first_name?: string
          has_driver_license?: boolean | null
          has_insurance?: boolean | null
          has_registration?: boolean | null
          id?: string
          last_name?: string
          messaging_channel?: string
          messaging_consent?: boolean
          phone_country?: string
          phone_number?: string
          recovered_from_application_id?: string | null
          recovery_eligible_at?: string | null
          recovery_status?: string
          recycle_count?: number
          referee1_address?: string | null
          referee1_email?: string | null
          referee1_name?: string | null
          referee1_phone?: string | null
          referee2_address?: string | null
          referee2_email?: string | null
          referee2_name?: string | null
          referee2_phone?: string | null
          referee3_address?: string | null
          referee3_email?: string | null
          referee3_name?: string | null
          referee3_phone?: string | null
          referees_verification_status?: string
          region?: string
          rejection_reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rideshare_platforms?: string[] | null
          security_deposit_acknowledged?: boolean | null
          status?: Database["public"]["Enums"]["application_status"]
          street_address?: string | null
          updated_at?: string
          user_id?: string | null
          vehicle_color?: string | null
          vehicle_description?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
          vehicle_year?: number | null
          zip_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_recovered_from_application_id_fkey"
            columns: ["recovered_from_application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_event_log: {
        Row: {
          created_at: string
          email: string | null
          error_code: string | null
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json
          provider: string | null
          success: boolean
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          error_code?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          provider?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          error_code?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          provider?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      communication_providers: {
        Row: {
          country_code_prefix: string
          created_at: string
          forwarding_number: string | null
          id: string
          is_active: boolean
          region_code: string
          region_name: string
          retry_count: number
          sender_id: string | null
          sms_provider: string
          updated_at: string
          updated_by: string | null
          voice_provider: string
          whatsapp_provider: string | null
        }
        Insert: {
          country_code_prefix: string
          created_at?: string
          forwarding_number?: string | null
          id?: string
          is_active?: boolean
          region_code: string
          region_name: string
          retry_count?: number
          sender_id?: string | null
          sms_provider?: string
          updated_at?: string
          updated_by?: string | null
          voice_provider?: string
          whatsapp_provider?: string | null
        }
        Update: {
          country_code_prefix?: string
          created_at?: string
          forwarding_number?: string | null
          id?: string
          is_active?: boolean
          region_code?: string
          region_name?: string
          retry_count?: number
          sender_id?: string | null
          sms_provider?: string
          updated_at?: string
          updated_by?: string | null
          voice_provider?: string
          whatsapp_provider?: string | null
        }
        Relationships: []
      }
      contact_settings: {
        Row: {
          contact_type: string
          contact_value: string
          created_at: string
          display_name: string | null
          id: string
          is_active: boolean
          region: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          contact_type: string
          contact_value: string
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          region: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          contact_type?: string
          contact_value?: string
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          region?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      device_activity_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          device_id: string
          id: string
          performed_by: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          device_id: string
          id?: string
          performed_by: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          device_id?: string
          id?: string
          performed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_activity_log_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "iot_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_identities: {
        Row: {
          bundle_level: number
          created_at: string
          device_id: string
          driver_id: string | null
          iccid: string | null
          id: string
          identity_key: string
          imei: string | null
          last_synced_at: string
          license_plate: string | null
          metadata: Json
          mqtt_client_id: string | null
          mqtt_credential_id: string | null
          mqtt_username: string | null
          notes: string | null
          owner_id: string | null
          provider_sim_id: string | null
          rental_id: string | null
          serial_number: string | null
          sim_id: string | null
          sim_provider: string | null
          status: string
          telemetry_provider: string | null
          topic_prefix: string | null
          updated_at: string
          vehicle_id: string | null
          verified_at: string | null
          verified_by: string | null
          vin: string | null
        }
        Insert: {
          bundle_level?: number
          created_at?: string
          device_id: string
          driver_id?: string | null
          iccid?: string | null
          id?: string
          identity_key: string
          imei?: string | null
          last_synced_at?: string
          license_plate?: string | null
          metadata?: Json
          mqtt_client_id?: string | null
          mqtt_credential_id?: string | null
          mqtt_username?: string | null
          notes?: string | null
          owner_id?: string | null
          provider_sim_id?: string | null
          rental_id?: string | null
          serial_number?: string | null
          sim_id?: string | null
          sim_provider?: string | null
          status?: string
          telemetry_provider?: string | null
          topic_prefix?: string | null
          updated_at?: string
          vehicle_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
          vin?: string | null
        }
        Update: {
          bundle_level?: number
          created_at?: string
          device_id?: string
          driver_id?: string | null
          iccid?: string | null
          id?: string
          identity_key?: string
          imei?: string | null
          last_synced_at?: string
          license_plate?: string | null
          metadata?: Json
          mqtt_client_id?: string | null
          mqtt_credential_id?: string | null
          mqtt_username?: string | null
          notes?: string | null
          owner_id?: string | null
          provider_sim_id?: string | null
          rental_id?: string | null
          serial_number?: string | null
          sim_id?: string | null
          sim_provider?: string | null
          status?: string
          telemetry_provider?: string | null
          topic_prefix?: string | null
          updated_at?: string
          vehicle_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_identities_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: true
            referencedRelation: "iot_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_identities_mqtt_credential_id_fkey"
            columns: ["mqtt_credential_id"]
            isOneToOne: false
            referencedRelation: "vehicle_mqtt_credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_identities_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_identities_sim_id_fkey"
            columns: ["sim_id"]
            isOneToOne: false
            referencedRelation: "iot_sim_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_identities_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_export_audit: {
        Row: {
          created_at: string
          document_count: number
          document_ids: string[]
          error: string | null
          exporter_id: string
          id: string
          metadata: Json
          region: string | null
          source: string
          status: string
          storage_path: string | null
          target_user_id: string
          vehicle_id: string | null
          zip_size_bytes: number | null
        }
        Insert: {
          created_at?: string
          document_count?: number
          document_ids?: string[]
          error?: string | null
          exporter_id: string
          id?: string
          metadata?: Json
          region?: string | null
          source?: string
          status?: string
          storage_path?: string | null
          target_user_id: string
          vehicle_id?: string | null
          zip_size_bytes?: number | null
        }
        Update: {
          created_at?: string
          document_count?: number
          document_ids?: string[]
          error?: string | null
          exporter_id?: string
          id?: string
          metadata?: Json
          region?: string | null
          source?: string
          status?: string
          storage_path?: string | null
          target_user_id?: string
          vehicle_id?: string | null
          zip_size_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_export_audit_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_behavior_logs: {
        Row: {
          accel_x: number | null
          accel_y: number | null
          accel_z: number | null
          created_at: string
          driver_id: string | null
          event_type: string
          heading: number | null
          id: string
          latitude: number | null
          longitude: number | null
          mqtt_topic: string | null
          raw_payload: Json | null
          rental_id: string | null
          severity: string
          speed_at_event: number | null
          threshold_g: number | null
          total_g: number | null
          vehicle_id: string
        }
        Insert: {
          accel_x?: number | null
          accel_y?: number | null
          accel_z?: number | null
          created_at?: string
          driver_id?: string | null
          event_type: string
          heading?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          mqtt_topic?: string | null
          raw_payload?: Json | null
          rental_id?: string | null
          severity?: string
          speed_at_event?: number | null
          threshold_g?: number | null
          total_g?: number | null
          vehicle_id: string
        }
        Update: {
          accel_x?: number | null
          accel_y?: number | null
          accel_z?: number | null
          created_at?: string
          driver_id?: string | null
          event_type?: string
          heading?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          mqtt_topic?: string | null
          raw_payload?: Json | null
          rental_id?: string | null
          severity?: string
          speed_at_event?: number | null
          threshold_g?: number | null
          total_g?: number | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_behavior_logs_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_call_ins: {
        Row: {
          created_at: string
          driver_id: string
          end_reason: string | null
          ended_at: string | null
          expires_at: string
          extend_requested: boolean
          geofence_lat: number | null
          geofence_lng: number | null
          geofence_radius_m: number
          id: string
          notes: string | null
          reason: string
          rental_id: string | null
          started_at: string
          status: Database["public"]["Enums"]["call_in_status"]
          telemetry_snapshot: Json | null
          type: Database["public"]["Enums"]["call_in_type"]
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          end_reason?: string | null
          ended_at?: string | null
          expires_at: string
          extend_requested?: boolean
          geofence_lat?: number | null
          geofence_lng?: number | null
          geofence_radius_m?: number
          id?: string
          notes?: string | null
          reason: string
          rental_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["call_in_status"]
          telemetry_snapshot?: Json | null
          type: Database["public"]["Enums"]["call_in_type"]
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          end_reason?: string | null
          ended_at?: string | null
          expires_at?: string
          extend_requested?: boolean
          geofence_lat?: number | null
          geofence_lng?: number | null
          geofence_radius_m?: number
          id?: string
          notes?: string | null
          reason?: string
          rental_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["call_in_status"]
          telemetry_snapshot?: Json | null
          type?: Database["public"]["Enums"]["call_in_type"]
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_call_ins_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_call_ins_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_proxy_billing_accounts: {
        Row: {
          activated_at: string | null
          admin_review_notes: string | null
          admin_review_status: string
          admin_reviewed_at: string | null
          admin_reviewed_by: string | null
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_fingerprint: string | null
          card_last4: string | null
          card_provider: string | null
          card_token: string | null
          consent_channels: string[] | null
          consent_ip: string | null
          consent_pdf_url: string | null
          consent_sent_at: string | null
          consent_signature: string | null
          consent_signed_at: string | null
          consent_status: string
          consent_token: string
          consent_token_expires_at: string
          consent_user_agent: string | null
          created_at: string
          driver_id: string
          expired_at: string | null
          id: string
          identity_status: string
          identity_verified_at: string | null
          max_uses: number | null
          notification_prefs: Json
          persona_inquiry_id: string | null
          proxy_email: string
          proxy_full_name: string
          proxy_phone: string | null
          proxy_relationship: string | null
          region: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          updated_at: string
          use_type: string
          uses_count: number
          validity_expires_at: string | null
          validity_starts_at: string | null
        }
        Insert: {
          activated_at?: string | null
          admin_review_notes?: string | null
          admin_review_status?: string
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_fingerprint?: string | null
          card_last4?: string | null
          card_provider?: string | null
          card_token?: string | null
          consent_channels?: string[] | null
          consent_ip?: string | null
          consent_pdf_url?: string | null
          consent_sent_at?: string | null
          consent_signature?: string | null
          consent_signed_at?: string | null
          consent_status?: string
          consent_token?: string
          consent_token_expires_at?: string
          consent_user_agent?: string | null
          created_at?: string
          driver_id: string
          expired_at?: string | null
          id?: string
          identity_status?: string
          identity_verified_at?: string | null
          max_uses?: number | null
          notification_prefs?: Json
          persona_inquiry_id?: string | null
          proxy_email: string
          proxy_full_name: string
          proxy_phone?: string | null
          proxy_relationship?: string | null
          region?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          updated_at?: string
          use_type?: string
          uses_count?: number
          validity_expires_at?: string | null
          validity_starts_at?: string | null
        }
        Update: {
          activated_at?: string | null
          admin_review_notes?: string | null
          admin_review_status?: string
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_fingerprint?: string | null
          card_last4?: string | null
          card_provider?: string | null
          card_token?: string | null
          consent_channels?: string[] | null
          consent_ip?: string | null
          consent_pdf_url?: string | null
          consent_sent_at?: string | null
          consent_signature?: string | null
          consent_signed_at?: string | null
          consent_status?: string
          consent_token?: string
          consent_token_expires_at?: string
          consent_user_agent?: string | null
          created_at?: string
          driver_id?: string
          expired_at?: string | null
          id?: string
          identity_status?: string
          identity_verified_at?: string | null
          max_uses?: number | null
          notification_prefs?: Json
          persona_inquiry_id?: string | null
          proxy_email?: string
          proxy_full_name?: string
          proxy_phone?: string | null
          proxy_relationship?: string | null
          region?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          updated_at?: string
          use_type?: string
          uses_count?: number
          validity_expires_at?: string | null
          validity_starts_at?: string | null
        }
        Relationships: []
      }
      driver_vehicle_match_events: {
        Row: {
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          match_id: string
          message: string | null
          stage: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          match_id: string
          message?: string | null
          stage: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          match_id?: string
          message?: string | null
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_vehicle_match_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "driver_vehicle_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_vehicle_matches: {
        Row: {
          accredited_at: string | null
          agreement_id: string | null
          agreement_initiated_at: string | null
          agreement_signed_at: string | null
          assigned_at: string
          assigned_by: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          distance_miles: number | null
          driver_id: string
          id: string
          licence_document_id: string | null
          notes: string | null
          owner_id: string | null
          picked_up_at: string | null
          referee_count: number
          region: string | null
          status: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          accredited_at?: string | null
          agreement_id?: string | null
          agreement_initiated_at?: string | null
          agreement_signed_at?: string | null
          assigned_at?: string
          assigned_by?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          distance_miles?: number | null
          driver_id: string
          id?: string
          licence_document_id?: string | null
          notes?: string | null
          owner_id?: string | null
          picked_up_at?: string | null
          referee_count?: number
          region?: string | null
          status?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          accredited_at?: string | null
          agreement_id?: string | null
          agreement_initiated_at?: string | null
          agreement_signed_at?: string | null
          assigned_at?: string
          assigned_by?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          distance_miles?: number | null
          driver_id?: string
          id?: string
          licence_document_id?: string | null
          notes?: string | null
          owner_id?: string | null
          picked_up_at?: string | null
          referee_count?: number
          region?: string | null
          status?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_vehicle_matches_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "legal_agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      elevenlabs_retention_settings: {
        Row: {
          audio_retention_days: number
          id: string
          transcript_retention_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          audio_retention_days?: number
          id?: string
          transcript_retention_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          audio_retention_days?: number
          id?: string
          transcript_retention_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      elevenlabs_test_logs: {
        Row: {
          audio_bytes: number | null
          audio_storage_path: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          input_file_name: string | null
          input_file_size_bytes: number | null
          input_mime_type: string | null
          input_text: string | null
          kind: string
          language_code: string | null
          model_id: string | null
          region: string | null
          request_metadata: Json
          response_metadata: Json
          status: string
          transcript_text: string | null
          user_id: string | null
          voice_id: string | null
          words: Json | null
        }
        Insert: {
          audio_bytes?: number | null
          audio_storage_path?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_file_name?: string | null
          input_file_size_bytes?: number | null
          input_mime_type?: string | null
          input_text?: string | null
          kind: string
          language_code?: string | null
          model_id?: string | null
          region?: string | null
          request_metadata?: Json
          response_metadata?: Json
          status?: string
          transcript_text?: string | null
          user_id?: string | null
          voice_id?: string | null
          words?: Json | null
        }
        Update: {
          audio_bytes?: number | null
          audio_storage_path?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_file_name?: string | null
          input_file_size_bytes?: number | null
          input_mime_type?: string | null
          input_text?: string | null
          kind?: string
          language_code?: string | null
          model_id?: string | null
          region?: string | null
          request_metadata?: Json
          response_metadata?: Json
          status?: string
          transcript_text?: string | null
          user_id?: string | null
          voice_id?: string | null
          words?: Json | null
        }
        Relationships: []
      }
      email_analytics: {
        Row: {
          category: string
          count: number
          created_at: string
          date: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          category: string
          count?: number
          created_at?: string
          date?: string
          id?: string
          status: string
          updated_at?: string
        }
        Update: {
          category?: string
          count?: number
          created_at?: string
          date?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_bounces: {
        Row: {
          bounce_type: string
          bounced_at: string
          created_at: string
          details: string | null
          id: string
          message_id: string
          recipient: string
        }
        Insert: {
          bounce_type: string
          bounced_at?: string
          created_at?: string
          details?: string | null
          id?: string
          message_id: string
          recipient: string
        }
        Update: {
          bounce_type?: string
          bounced_at?: string
          created_at?: string
          details?: string | null
          id?: string
          message_id?: string
          recipient?: string
        }
        Relationships: []
      }
      email_campaigns: {
        Row: {
          category: string | null
          click_count: number | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          open_count: number | null
          scheduled_date: string | null
          sent_count: number | null
          status: string | null
          target_audience: Json | null
          template: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          click_count?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          open_count?: number | null
          scheduled_date?: string | null
          sent_count?: number | null
          status?: string | null
          target_audience?: Json | null
          template?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          click_count?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          open_count?: number | null
          scheduled_date?: string | null
          sent_count?: number | null
          status?: string | null
          target_audience?: Json | null
          template?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      email_clicks: {
        Row: {
          clicked_at: string
          created_at: string
          id: string
          is_conversion: boolean
          link: string
          message_id: string
          recipient: string
        }
        Insert: {
          clicked_at?: string
          created_at?: string
          id?: string
          is_conversion?: boolean
          link: string
          message_id: string
          recipient: string
        }
        Update: {
          clicked_at?: string
          created_at?: string
          id?: string
          is_conversion?: boolean
          link?: string
          message_id?: string
          recipient?: string
        }
        Relationships: []
      }
      email_complaints: {
        Row: {
          complained_at: string
          complaint_type: string | null
          created_at: string
          id: string
          message_id: string
          recipient: string
        }
        Insert: {
          complained_at?: string
          complaint_type?: string | null
          created_at?: string
          id?: string
          message_id: string
          recipient: string
        }
        Update: {
          complained_at?: string
          complaint_type?: string | null
          created_at?: string
          id?: string
          message_id?: string
          recipient?: string
        }
        Relationships: []
      }
      email_dlq_retry_state: {
        Row: {
          alerted_at: string | null
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          message_key: string
          next_attempt_at: string
          paused: boolean
          queue_name: string
          recipient_email: string | null
          resolved_at: string | null
          template_name: string | null
          updated_at: string
        }
        Insert: {
          alerted_at?: string | null
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          message_key: string
          next_attempt_at?: string
          paused?: boolean
          queue_name: string
          recipient_email?: string | null
          resolved_at?: string | null
          template_name?: string | null
          updated_at?: string
        }
        Update: {
          alerted_at?: string | null
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          message_key?: string
          next_attempt_at?: string
          paused?: boolean
          queue_name?: string
          recipient_email?: string | null
          resolved_at?: string | null
          template_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      email_idempotency_keys: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          idempotency_key: string
          purpose: string
          recipient: string | null
          response: Json | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key: string
          purpose: string
          recipient?: string | null
          response?: Json | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          purpose?: string
          recipient?: string | null
          response?: Json | null
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          category: string
          country: string | null
          created_at: string
          delivered_at: string | null
          error: string | null
          failed_at: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          priority: string
          recipient: string
          retry_count: number
          scheduled_for: string | null
          sent_at: string | null
          status: string
          template: string
          updated_at: string
        }
        Insert: {
          category: string
          country?: string | null
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          failed_at?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          priority?: string
          recipient: string
          retry_count?: number
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          template: string
          updated_at?: string
        }
        Update: {
          category?: string
          country?: string | null
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          failed_at?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          priority?: string
          recipient?: string
          retry_count?: number
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          template?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_notification_preferences: {
        Row: {
          booking_confirmations: boolean
          booking_reminders: boolean
          created_at: string
          marketing: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          booking_confirmations?: boolean
          booking_reminders?: boolean
          created_at?: string
          marketing?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          booking_confirmations?: boolean
          booking_reminders?: boolean
          created_at?: string
          marketing?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_opens: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          message_id: string
          opened_at: string
          recipient: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          message_id: string
          opened_at?: string
          recipient: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          message_id?: string
          opened_at?: string
          recipient?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      email_provider_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          function_name: string
          id: string
          payload_excerpt: Json | null
          provider_response: string | null
          recipient_email: string | null
          status: number
          subject: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          function_name: string
          id?: string
          payload_excerpt?: Json | null
          provider_response?: string | null
          recipient_email?: string | null
          status: number
          subject?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          function_name?: string
          id?: string
          payload_excerpt?: Json | null
          provider_response?: string | null
          recipient_email?: string | null
          status?: number
          subject?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_suppression_list: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          reason: string
          source_message_id: string | null
          suppressed_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          reason: string
          source_message_id?: string | null
          suppressed_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          reason?: string
          source_message_id?: string | null
          suppressed_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          category: string | null
          created_at: string
          html_content: string | null
          id: string
          is_active: boolean | null
          name: string
          subject: string
          text_content: string | null
          updated_at: string
          variables: Json | null
          version: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          html_content?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          subject: string
          text_content?: string | null
          updated_at?: string
          variables?: Json | null
          version?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string
          html_content?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          subject?: string
          text_content?: string | null
          updated_at?: string
          variables?: Json | null
          version?: number | null
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      emqx_credential_versions: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          api_key_masked: string
          api_secret_masked: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          retired_at: string | null
          status: string
          vault_key_id: string
          vault_secret_id: string
          verification_result: Json | null
          verified_at: string | null
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          api_key_masked: string
          api_secret_masked: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          retired_at?: string | null
          status?: string
          vault_key_id: string
          vault_secret_id: string
          verification_result?: Json | null
          verified_at?: string | null
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          api_key_masked?: string
          api_secret_masked?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          retired_at?: string | null
          status?: string
          vault_key_id?: string
          vault_secret_id?: string
          verification_result?: Json | null
          verified_at?: string | null
        }
        Relationships: []
      }
      event_notification_outbox: {
        Row: {
          attempts: number
          body: string | null
          category: string
          channel: string
          created_at: string
          deep_link: string | null
          delivered_at: string | null
          destination: string | null
          id: string
          kind: string
          last_error: string | null
          payload: Json
          recipient_id: string
          record_id: string | null
          source_table: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          body?: string | null
          category: string
          channel: string
          created_at?: string
          deep_link?: string | null
          delivered_at?: string | null
          destination?: string | null
          id?: string
          kind: string
          last_error?: string | null
          payload?: Json
          recipient_id: string
          record_id?: string | null
          source_table?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          body?: string | null
          category?: string
          channel?: string
          created_at?: string
          deep_link?: string | null
          delivered_at?: string | null
          destination?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          payload?: Json
          recipient_id?: string
          record_id?: string | null
          source_table?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_notification_preferences: {
        Row: {
          category: string
          created_at: string
          email: boolean
          id: string
          in_app: boolean
          push: boolean
          slack: boolean
          slack_webhook_url: string | null
          sms: boolean
          updated_at: string
          user_id: string
          webhook: boolean
          webhook_secret: string
          webhook_url: string | null
        }
        Insert: {
          category: string
          created_at?: string
          email?: boolean
          id?: string
          in_app?: boolean
          push?: boolean
          slack?: boolean
          slack_webhook_url?: string | null
          sms?: boolean
          updated_at?: string
          user_id: string
          webhook?: boolean
          webhook_secret?: string
          webhook_url?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          email?: boolean
          id?: string
          in_app?: boolean
          push?: boolean
          slack?: boolean
          slack_webhook_url?: string | null
          sms?: boolean
          updated_at?: string
          user_id?: string
          webhook?: boolean
          webhook_secret?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      expiry_notifications: {
        Row: {
          created_at: string
          days_until_expiry: number
          document_id: string | null
          id: string
          notification_channel: string
          notification_type: string
          recipient_id: string
          recipient_type: string
          sent_at: string
          vehicle_id: string | null
          voip_call_id: string | null
        }
        Insert: {
          created_at?: string
          days_until_expiry: number
          document_id?: string | null
          id?: string
          notification_channel: string
          notification_type: string
          recipient_id: string
          recipient_type: string
          sent_at?: string
          vehicle_id?: string | null
          voip_call_id?: string | null
        }
        Update: {
          created_at?: string
          days_until_expiry?: number
          document_id?: string | null
          id?: string
          notification_channel?: string
          notification_type?: string
          recipient_id?: string
          recipient_type?: string
          sent_at?: string
          vehicle_id?: string | null
          voip_call_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expiry_notifications_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "user_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expiry_notifications_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      faq_categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          region: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          region?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          region?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      faq_items: {
        Row: {
          answer: string
          category_id: string
          created_at: string
          display_order: number | null
          id: string
          is_active: boolean | null
          is_public: boolean | null
          question: string
          region: string | null
          updated_at: string
        }
        Insert: {
          answer: string
          category_id: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          question: string
          region?: string | null
          updated_at?: string
        }
        Update: {
          answer?: string
          category_id?: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          question?: string
          region?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "faq_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "faq_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      in_app_messages: {
        Row: {
          body: string
          category: string
          created_at: string
          id: string
          link_url: string | null
          metadata: Json
          read_at: string | null
          recipient_id: string
          sender_id: string | null
          sender_name: string
          subject: string | null
        }
        Insert: {
          body: string
          category?: string
          created_at?: string
          id?: string
          link_url?: string | null
          metadata?: Json
          read_at?: string | null
          recipient_id: string
          sender_id?: string | null
          sender_name?: string
          subject?: string | null
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          link_url?: string | null
          metadata?: Json
          read_at?: string | null
          recipient_id?: string
          sender_id?: string | null
          sender_name?: string
          subject?: string | null
        }
        Relationships: []
      }
      inbox_attachment_access_log: {
        Row: {
          action: string
          attachment_key: string
          content_type: string | null
          conversation_id: string | null
          created_at: string
          error: string | null
          filename: string
          id: string
          message_id: string | null
          succeeded: boolean
          user_email: string | null
          user_id: string
        }
        Insert: {
          action?: string
          attachment_key: string
          content_type?: string | null
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          filename?: string
          id?: string
          message_id?: string | null
          succeeded?: boolean
          user_email?: string | null
          user_id?: string
        }
        Update: {
          action?: string
          attachment_key?: string
          content_type?: string | null
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          filename?: string
          id?: string
          message_id?: string | null
          succeeded?: boolean
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      inbox_attachment_ocr: {
        Row: {
          attachment_key: string
          char_count: number
          content_type: string | null
          conversation_id: string | null
          created_at: string
          error: string | null
          extracted_text: string | null
          filename: string
          id: string
          message_id: string
          processed_at: string | null
          requested_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attachment_key: string
          char_count?: number
          content_type?: string | null
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          extracted_text?: string | null
          filename?: string
          id?: string
          message_id: string
          processed_at?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attachment_key?: string
          char_count?: number
          content_type?: string | null
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          extracted_text?: string | null
          filename?: string
          id?: string
          message_id?: string
          processed_at?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      inbox_auto_reply_rules: {
        Row: {
          canned_reply_id: string | null
          channel: string | null
          cooldown_minutes: number
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          keywords: string[]
          last_triggered_at: string | null
          match_type: string
          name: string
          priority: number
          region: string | null
          reply_body: string | null
          trigger_count: number
          updated_at: string
        }
        Insert: {
          canned_reply_id?: string | null
          channel?: string | null
          cooldown_minutes?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          keywords?: string[]
          last_triggered_at?: string | null
          match_type?: string
          name: string
          priority?: number
          region?: string | null
          reply_body?: string | null
          trigger_count?: number
          updated_at?: string
        }
        Update: {
          canned_reply_id?: string | null
          channel?: string | null
          cooldown_minutes?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          keywords?: string[]
          last_triggered_at?: string | null
          match_type?: string
          name?: string
          priority?: number
          region?: string | null
          reply_body?: string | null
          trigger_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_auto_reply_rules_canned_reply_id_fkey"
            columns: ["canned_reply_id"]
            isOneToOne: false
            referencedRelation: "inbox_canned_replies"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_canned_replies: {
        Row: {
          body: string
          channel: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          region: string | null
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          channel?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          region?: string | null
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          region?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      inbox_conversations: {
        Row: {
          archived_at: string | null
          assigned_to: string | null
          channel: string
          created_at: string
          id: string
          is_flagged: boolean
          last_message_at: string
          priority: string
          region: string
          status: string
          subject: string | null
          updated_at: string
          user_email: string | null
          user_id: string | null
          user_name: string | null
          user_phone: string | null
        }
        Insert: {
          archived_at?: string | null
          assigned_to?: string | null
          channel: string
          created_at?: string
          id?: string
          is_flagged?: boolean
          last_message_at?: string
          priority?: string
          region: string
          status?: string
          subject?: string | null
          updated_at?: string
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
          user_phone?: string | null
        }
        Update: {
          archived_at?: string | null
          assigned_to?: string | null
          channel?: string
          created_at?: string
          id?: string
          is_flagged?: boolean
          last_message_at?: string
          priority?: string
          region?: string
          status?: string
          subject?: string | null
          updated_at?: string
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
          user_phone?: string | null
        }
        Relationships: []
      }
      inbox_messages: {
        Row: {
          channel: string
          content: string
          conversation_id: string
          created_at: string
          external_id: string | null
          id: string
          is_read: boolean
          metadata: Json | null
          read_at: string | null
          sender_id: string | null
          sender_name: string | null
          sender_type: string
        }
        Insert: {
          channel: string
          content: string
          conversation_id: string
          created_at?: string
          external_id?: string | null
          id?: string
          is_read?: boolean
          metadata?: Json | null
          read_at?: string | null
          sender_id?: string | null
          sender_name?: string | null
          sender_type: string
        }
        Update: {
          channel?: string
          content?: string
          conversation_id?: string
          created_at?: string
          external_id?: string | null
          id?: string
          is_read?: boolean
          metadata?: Json | null
          read_at?: string | null
          sender_id?: string | null
          sender_name?: string | null
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "inbox_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_notification_settings: {
        Row: {
          alert_email: string | null
          channel: string
          created_at: string
          email_enabled: boolean
          id: string
          in_app_enabled: boolean
          min_priority: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_email?: string | null
          channel: string
          created_at?: string
          email_enabled?: boolean
          id?: string
          in_app_enabled?: boolean
          min_priority?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_email?: string | null
          channel?: string
          created_at?: string
          email_enabled?: boolean
          id?: string
          in_app_enabled?: boolean
          min_priority?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      inbox_reply_audit: {
        Row: {
          actor_id: string | null
          body_preview: string | null
          canned_reply_id: string | null
          canned_reply_title: string | null
          channel: string
          conversation_id: string
          cooldown_minutes: number | null
          cooldown_remaining_minutes: number | null
          cooldown_status: string
          created_at: string
          delivered: boolean
          error_message: string | null
          id: string
          match_type: string | null
          matched_keywords: string[]
          message_id: string | null
          metadata: Json
          reply_type: string
          rule_id: string | null
          rule_name: string | null
        }
        Insert: {
          actor_id?: string | null
          body_preview?: string | null
          canned_reply_id?: string | null
          canned_reply_title?: string | null
          channel: string
          conversation_id: string
          cooldown_minutes?: number | null
          cooldown_remaining_minutes?: number | null
          cooldown_status?: string
          created_at?: string
          delivered?: boolean
          error_message?: string | null
          id?: string
          match_type?: string | null
          matched_keywords?: string[]
          message_id?: string | null
          metadata?: Json
          reply_type?: string
          rule_id?: string | null
          rule_name?: string | null
        }
        Update: {
          actor_id?: string | null
          body_preview?: string | null
          canned_reply_id?: string | null
          canned_reply_title?: string | null
          channel?: string
          conversation_id?: string
          cooldown_minutes?: number | null
          cooldown_remaining_minutes?: number | null
          cooldown_status?: string
          created_at?: string
          delivered?: boolean
          error_message?: string | null
          id?: string
          match_type?: string | null
          matched_keywords?: string[]
          message_id?: string | null
          metadata?: Json
          reply_type?: string
          rule_id?: string | null
          rule_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbox_reply_audit_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "inbox_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_reply_audit_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "inbox_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_activity_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          channel: string | null
          created_at: string
          details: Json
          entity_id: string
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          channel?: string | null
          created_at?: string
          details?: Json
          entity_id: string
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          channel?: string | null
          created_at?: string
          details?: Json
          entity_id?: string
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          driver_id: string | null
          due_date: string | null
          email_attempts: number
          email_error: string | null
          email_last_attempt_at: string | null
          email_status: string
          id: string
          idempotency_key: string | null
          invoice_number: string
          invoice_type: string
          issued_at: string
          line_items: Json
          metadata: Json
          owner_id: string | null
          paid_at: string | null
          payment_id: string | null
          pdf_url: string | null
          recipient_email: string | null
          region: string | null
          rental_id: string | null
          sent_at: string | null
          status: string
          subscription_id: string | null
          tax_amount: number
          total_amount: number
          updated_at: string
          vehicle_id: string | null
          voided_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          driver_id?: string | null
          due_date?: string | null
          email_attempts?: number
          email_error?: string | null
          email_last_attempt_at?: string | null
          email_status?: string
          id?: string
          idempotency_key?: string | null
          invoice_number?: string
          invoice_type?: string
          issued_at?: string
          line_items?: Json
          metadata?: Json
          owner_id?: string | null
          paid_at?: string | null
          payment_id?: string | null
          pdf_url?: string | null
          recipient_email?: string | null
          region?: string | null
          rental_id?: string | null
          sent_at?: string | null
          status?: string
          subscription_id?: string | null
          tax_amount?: number
          total_amount: number
          updated_at?: string
          vehicle_id?: string | null
          voided_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          driver_id?: string | null
          due_date?: string | null
          email_attempts?: number
          email_error?: string | null
          email_last_attempt_at?: string | null
          email_status?: string
          id?: string
          idempotency_key?: string | null
          invoice_number?: string
          invoice_type?: string
          issued_at?: string
          line_items?: Json
          metadata?: Json
          owner_id?: string | null
          paid_at?: string | null
          payment_id?: string | null
          pdf_url?: string | null
          recipient_email?: string | null
          region?: string | null
          rental_id?: string | null
          sent_at?: string | null
          status?: string
          subscription_id?: string | null
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vehicle_id?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "billing_reconciliation_view"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "invoices_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "user_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      iot_audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json
          device_id: string | null
          id: string
          performed_by: string | null
          sim_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          device_id?: string | null
          id?: string
          performed_by?: string | null
          sim_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          device_id?: string | null
          id?: string
          performed_by?: string | null
          sim_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "iot_audit_log_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "iot_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iot_audit_log_sim_id_fkey"
            columns: ["sim_id"]
            isOneToOne: false
            referencedRelation: "iot_sim_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iot_audit_log_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      iot_device_orders: {
        Row: {
          created_at: string
          currency: string
          delivery_confirmed_at: string | null
          delivery_confirmed_by: string | null
          device_price: number
          id: string
          installation_confirmed_at: string | null
          installation_notes: string | null
          installed_sim_number: string | null
          installed_sim_provider: string | null
          notes: string | null
          owner_email: string | null
          owner_id: string
          owner_phone: string | null
          payment_confirmed_at: string | null
          payment_confirmed_by: string | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string
          shipped_at: string | null
          shipped_by: string | null
          shipping_address: string | null
          shipping_status: string
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          delivery_confirmed_at?: string | null
          delivery_confirmed_by?: string | null
          device_price: number
          id?: string
          installation_confirmed_at?: string | null
          installation_notes?: string | null
          installed_sim_number?: string | null
          installed_sim_provider?: string | null
          notes?: string | null
          owner_email?: string | null
          owner_id: string
          owner_phone?: string | null
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string
          shipped_at?: string | null
          shipped_by?: string | null
          shipping_address?: string | null
          shipping_status?: string
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          delivery_confirmed_at?: string | null
          delivery_confirmed_by?: string | null
          device_price?: number
          id?: string
          installation_confirmed_at?: string | null
          installation_notes?: string | null
          installed_sim_number?: string | null
          installed_sim_provider?: string | null
          notes?: string | null
          owner_email?: string | null
          owner_id?: string
          owner_phone?: string | null
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string
          shipped_at?: string | null
          shipped_by?: string | null
          shipping_address?: string | null
          shipping_status?: string
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      iot_device_pricing: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          id: string
          price: number
          region: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          currency: string
          description?: string | null
          id?: string
          price: number
          region: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          price?: number
          region?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      iot_devices: {
        Row: {
          activated_at: string | null
          battery_level: number | null
          created_at: string | null
          device_model: string | null
          firmware_version: string | null
          health_details: Json
          health_status: string
          id: string
          imei: string | null
          installation_confirmed_at: string | null
          installation_confirmed_by: string | null
          installation_status: string
          is_linked: boolean | null
          last_health_check_at: string | null
          last_ping: string | null
          latitude: number | null
          longitude: number | null
          notes: string | null
          provider: string
          provider_device_id: string | null
          serial_number: string
          signal_strength: number | null
          sim_number: string | null
          sim_provider: string | null
          status: Database["public"]["Enums"]["device_status"] | null
          telemetry_enabled: boolean
          updated_at: string | null
          vehicle_id: string | null
        }
        Insert: {
          activated_at?: string | null
          battery_level?: number | null
          created_at?: string | null
          device_model?: string | null
          firmware_version?: string | null
          health_details?: Json
          health_status?: string
          id?: string
          imei?: string | null
          installation_confirmed_at?: string | null
          installation_confirmed_by?: string | null
          installation_status?: string
          is_linked?: boolean | null
          last_health_check_at?: string | null
          last_ping?: string | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          provider?: string
          provider_device_id?: string | null
          serial_number: string
          signal_strength?: number | null
          sim_number?: string | null
          sim_provider?: string | null
          status?: Database["public"]["Enums"]["device_status"] | null
          telemetry_enabled?: boolean
          updated_at?: string | null
          vehicle_id?: string | null
        }
        Update: {
          activated_at?: string | null
          battery_level?: number | null
          created_at?: string | null
          device_model?: string | null
          firmware_version?: string | null
          health_details?: Json
          health_status?: string
          id?: string
          imei?: string | null
          installation_confirmed_at?: string | null
          installation_confirmed_by?: string | null
          installation_status?: string
          is_linked?: boolean | null
          last_health_check_at?: string | null
          last_ping?: string | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          provider?: string
          provider_device_id?: string | null
          serial_number?: string
          signal_strength?: number | null
          sim_number?: string | null
          sim_provider?: string | null
          status?: Database["public"]["Enums"]["device_status"] | null
          telemetry_enabled?: boolean
          updated_at?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "iot_devices_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      iot_provisioning_control: {
        Row: {
          batch_size: number
          created_at: string
          id: boolean
          last_run_at: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          pause_reason: string | null
          paused: boolean
          updated_at: string
        }
        Insert: {
          batch_size?: number
          created_at?: string
          id?: boolean
          last_run_at?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          pause_reason?: string | null
          paused?: boolean
          updated_at?: string
        }
        Update: {
          batch_size?: number
          created_at?: string
          id?: boolean
          last_run_at?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          pause_reason?: string | null
          paused?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      iot_provisioning_runs: {
        Row: {
          created_at: string
          devices_enabled: number
          errors: Json
          finished_at: string | null
          id: string
          sims_linked: number
          started_at: string
          status: string
          vehicles_linked: number
          vehicles_ready: number
          vehicles_tested: number
        }
        Insert: {
          created_at?: string
          devices_enabled?: number
          errors?: Json
          finished_at?: string | null
          id?: string
          sims_linked?: number
          started_at?: string
          status?: string
          vehicles_linked?: number
          vehicles_ready?: number
          vehicles_tested?: number
        }
        Update: {
          created_at?: string
          devices_enabled?: number
          errors?: Json
          finished_at?: string | null
          id?: string
          sims_linked?: number
          started_at?: string
          status?: string
          vehicles_linked?: number
          vehicles_ready?: number
          vehicles_tested?: number
        }
        Relationships: []
      }
      iot_provisioning_state: {
        Row: {
          attempts: number
          created_at: string
          device_id: string | null
          id: string
          last_error: string | null
          ready_at: string | null
          sim_id: string | null
          stage: string
          test_details: Json
          test_status: string
          tested_at: string | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          device_id?: string | null
          id?: string
          last_error?: string | null
          ready_at?: string | null
          sim_id?: string | null
          stage?: string
          test_details?: Json
          test_status?: string
          tested_at?: string | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          device_id?: string | null
          id?: string
          last_error?: string | null
          ready_at?: string | null
          sim_id?: string | null
          stage?: string
          test_details?: Json
          test_status?: string
          tested_at?: string | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "iot_provisioning_state_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "iot_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iot_provisioning_state_sim_id_fkey"
            columns: ["sim_id"]
            isOneToOne: false
            referencedRelation: "iot_sim_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iot_provisioning_state_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      iot_sim_cards: {
        Row: {
          activated_at: string | null
          created_at: string
          data_limit_mb: number | null
          data_usage_mb: number | null
          device_id: string | null
          iccid: string
          id: string
          imsi: string | null
          last_session_at: string | null
          metadata: Json | null
          msisdn: string | null
          plan_name: string | null
          provider: string
          provider_sim_id: string | null
          status: string
          suspended_at: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          data_limit_mb?: number | null
          data_usage_mb?: number | null
          device_id?: string | null
          iccid: string
          id?: string
          imsi?: string | null
          last_session_at?: string | null
          metadata?: Json | null
          msisdn?: string | null
          plan_name?: string | null
          provider?: string
          provider_sim_id?: string | null
          status?: string
          suspended_at?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          data_limit_mb?: number | null
          data_usage_mb?: number | null
          device_id?: string | null
          iccid?: string
          id?: string
          imsi?: string | null
          last_session_at?: string | null
          metadata?: Json | null
          msisdn?: string | null
          plan_name?: string | null
          provider?: string
          provider_sim_id?: string | null
          status?: string
          suspended_at?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "iot_sim_cards_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "iot_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iot_sim_cards_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      iot_sync_activity_log: {
        Row: {
          created_at: string
          details: Json
          event: string
          id: string
          level: string
          message: string | null
          provider: string
        }
        Insert: {
          created_at?: string
          details?: Json
          event: string
          id?: string
          level?: string
          message?: string | null
          provider: string
        }
        Update: {
          created_at?: string
          details?: Json
          event?: string
          id?: string
          level?: string
          message?: string | null
          provider?: string
        }
        Relationships: []
      }
      iot_sync_schedule: {
        Row: {
          created_at: string
          enabled: boolean
          interval_minutes: number
          last_updated_by: string | null
          provider: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          interval_minutes?: number
          last_updated_by?: string | null
          provider: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          interval_minutes?: number
          last_updated_by?: string | null
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      iot_sync_state: {
        Row: {
          created_at: string
          devices_synced: number
          extra: Json
          id: string
          last_error: string | null
          last_error_at: string | null
          last_success_at: string | null
          last_sync_at: string | null
          positions_imported: number
          provider: string
          state: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          devices_synced?: number
          extra?: Json
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          last_sync_at?: string | null
          positions_imported?: number
          provider: string
          state?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          devices_synced?: number
          extra?: Json
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          last_sync_at?: string | null
          positions_imported?: number
          provider?: string
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      legal_agreement_acceptances: {
        Row: {
          accepted_at: string
          agreement_type: string
          created_at: string
          id: string
          ip_address: string | null
          region: string
          template_id: string
          template_key: string
          title: string
          user_agent: string | null
          user_id: string
          version: string
        }
        Insert: {
          accepted_at?: string
          agreement_type: string
          created_at?: string
          id?: string
          ip_address?: string | null
          region: string
          template_id: string
          template_key: string
          title: string
          user_agent?: string | null
          user_id: string
          version: string
        }
        Update: {
          accepted_at?: string
          agreement_type?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          region?: string
          template_id?: string
          template_key?: string
          title?: string
          user_agent?: string | null
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_agreement_acceptances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "legal_agreement_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_agreement_templates: {
        Row: {
          agreement_type: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          region: string
          template_key: string
          title: string
          updated_at: string
          updated_by: string | null
          version: string
        }
        Insert: {
          agreement_type?: string
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          region: string
          template_key: string
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: string
        }
        Update: {
          agreement_type?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          region?: string
          template_key?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: string
        }
        Relationships: []
      }
      legal_agreements: {
        Row: {
          admin_witness_id: string | null
          admin_witness_signature: string | null
          admin_witnessed_at: string | null
          agreement_content: string
          agreement_type: string
          agreement_version: string
          created_at: string
          driver_id: string
          driver_signature: string | null
          driver_signed_at: string | null
          email_sent_at: string | null
          email_sent_to: Json | null
          expires_at: string | null
          id: string
          is_compulsory: boolean
          owner_id: string
          owner_signature: string | null
          owner_signed_at: string | null
          parent_agreement_id: string | null
          pdf_url: string | null
          renewal_count: number
          renewal_notified_at: string | null
          status: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          admin_witness_id?: string | null
          admin_witness_signature?: string | null
          admin_witnessed_at?: string | null
          agreement_content: string
          agreement_type?: string
          agreement_version?: string
          created_at?: string
          driver_id: string
          driver_signature?: string | null
          driver_signed_at?: string | null
          email_sent_at?: string | null
          email_sent_to?: Json | null
          expires_at?: string | null
          id?: string
          is_compulsory?: boolean
          owner_id: string
          owner_signature?: string | null
          owner_signed_at?: string | null
          parent_agreement_id?: string | null
          pdf_url?: string | null
          renewal_count?: number
          renewal_notified_at?: string | null
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          admin_witness_id?: string | null
          admin_witness_signature?: string | null
          admin_witnessed_at?: string | null
          agreement_content?: string
          agreement_type?: string
          agreement_version?: string
          created_at?: string
          driver_id?: string
          driver_signature?: string | null
          driver_signed_at?: string | null
          email_sent_at?: string | null
          email_sent_to?: Json | null
          expires_at?: string | null
          id?: string
          is_compulsory?: boolean
          owner_id?: string
          owner_signature?: string | null
          owner_signed_at?: string | null
          parent_agreement_id?: string | null
          pdf_url?: string | null
          renewal_count?: number
          renewal_notified_at?: string | null
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_agreements_parent_agreement_id_fkey"
            columns: ["parent_agreement_id"]
            isOneToOne: false
            referencedRelation: "legal_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_agreements_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_events: {
        Row: {
          channel: string
          conversation_id: string | null
          created_at: string
          direction: string
          error_code: string | null
          error_message: string | null
          event_type: string
          id: string
          message_id: string | null
          metadata: Json | null
          provider: string
          provider_event_id: string | null
          provider_message_id: string | null
          raw_payload: Json | null
          recipient: string | null
          region: string | null
          sender: string | null
          template_name: string | null
          user_id: string | null
        }
        Insert: {
          channel: string
          conversation_id?: string | null
          created_at?: string
          direction?: string
          error_code?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          message_id?: string | null
          metadata?: Json | null
          provider: string
          provider_event_id?: string | null
          provider_message_id?: string | null
          raw_payload?: Json | null
          recipient?: string | null
          region?: string | null
          sender?: string | null
          template_name?: string | null
          user_id?: string | null
        }
        Update: {
          channel?: string
          conversation_id?: string | null
          created_at?: string
          direction?: string
          error_code?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          message_id?: string | null
          metadata?: Json | null
          provider?: string
          provider_event_id?: string | null
          provider_message_id?: string | null
          raw_payload?: Json | null
          recipient?: string | null
          region?: string | null
          sender?: string | null
          template_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messaging_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "inbox_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_opt_outs: {
        Row: {
          channel: string
          created_at: string
          id: string
          last_keyword: string | null
          opted_in_at: string | null
          opted_out_at: string | null
          phone: string
          source: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          last_keyword?: string | null
          opted_in_at?: string | null
          opted_out_at?: string | null
          phone: string
          source?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          last_keyword?: string | null
          opted_in_at?: string | null
          opted_out_at?: string | null
          phone?: string
          source?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      meta_ads_action_log: {
        Row: {
          action: string
          ad_account_id: string | null
          admin_user_id: string | null
          campaign_id: string
          campaign_name: string | null
          created_at: string
          error_detail: string | null
          id: string
          success: boolean
        }
        Insert: {
          action: string
          ad_account_id?: string | null
          admin_user_id?: string | null
          campaign_id: string
          campaign_name?: string | null
          created_at?: string
          error_detail?: string | null
          id?: string
          success?: boolean
        }
        Update: {
          action?: string
          ad_account_id?: string | null
          admin_user_id?: string | null
          campaign_id?: string
          campaign_name?: string | null
          created_at?: string
          error_detail?: string | null
          id?: string
          success?: boolean
        }
        Relationships: []
      }
      mqtt_telemetry_logs: {
        Row: {
          data_type: string
          id: string
          mqtt_topic: string | null
          payload: Json
          received_at: string
          vehicle_id: string
        }
        Insert: {
          data_type: string
          id?: string
          mqtt_topic?: string | null
          payload: Json
          received_at?: string
          vehicle_id: string
        }
        Update: {
          data_type?: string
          id?: string
          mqtt_topic?: string | null
          payload?: Json
          received_at?: string
          vehicle_id?: string
        }
        Relationships: []
      }
      onboarding_stage_audit: {
        Row: {
          actor_id: string | null
          created_at: string
          details: Json
          error_class: string | null
          error_message: string | null
          event_type: string
          id: string
          new_access_level: string | null
          new_stage: string | null
          previous_access_level: string | null
          previous_stage: string | null
          rpc_name: string | null
          status: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          details?: Json
          error_class?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          new_access_level?: string | null
          new_stage?: string | null
          previous_access_level?: string | null
          previous_stage?: string | null
          rpc_name?: string | null
          status?: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          details?: Json
          error_class?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          new_access_level?: string | null
          new_stage?: string | null
          previous_access_level?: string | null
          previous_stage?: string | null
          rpc_name?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      opay_transactions: {
        Row: {
          amount: number
          cashier_url: string | null
          created_at: string
          currency: string
          driver_id: string | null
          failure_reason: string | null
          id: string
          idempotency_key: string | null
          order_no: string | null
          payment_id: string | null
          raw_payload: Json | null
          reference: string
          rental_id: string | null
          status: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          amount: number
          cashier_url?: string | null
          created_at?: string
          currency?: string
          driver_id?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          order_no?: string | null
          payment_id?: string | null
          raw_payload?: Json | null
          reference: string
          rental_id?: string | null
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          amount?: number
          cashier_url?: string | null
          created_at?: string
          currency?: string
          driver_id?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          order_no?: string | null
          payment_id?: string | null
          raw_payload?: Json | null
          reference?: string
          rental_id?: string | null
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opay_transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "billing_reconciliation_view"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "opay_transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opay_transactions_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opay_transactions_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_decision_log: {
        Row: {
          channel: string
          created_at: string
          decision: string
          direction: string
          function_name: string | null
          id: string
          message_id: string | null
          metadata: Json
          notification_type: string | null
          provider: string | null
          reason: string | null
          recipient_masked: string | null
          region: string | null
          user_id: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          decision: string
          direction?: string
          function_name?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json
          notification_type?: string | null
          provider?: string | null
          reason?: string | null
          recipient_masked?: string | null
          region?: string | null
          user_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          decision?: string
          direction?: string
          function_name?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json
          notification_type?: string | null
          provider?: string | null
          reason?: string | null
          recipient_masked?: string | null
          region?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      outreach_contacts: {
        Row: {
          contact_type: string
          converted_user_id: string | null
          country_code: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          last_contacted_at: string | null
          notes: string | null
          phone_e164: string | null
          raw_phone: string
          region: string | null
          signup_role: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          contact_type?: string
          converted_user_id?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          last_contacted_at?: string | null
          notes?: string | null
          phone_e164?: string | null
          raw_phone: string
          region?: string | null
          signup_role?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          contact_type?: string
          converted_user_id?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          last_contacted_at?: string | null
          notes?: string | null
          phone_e164?: string | null
          raw_phone?: string
          region?: string | null
          signup_role?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      owner_earnings: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          notification_sent: boolean
          owner_id: string
          payout_method: string | null
          payout_reference: string | null
          period_end: string
          period_start: string
          processed_at: string | null
          rental_id: string | null
          status: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          notification_sent?: boolean
          owner_id: string
          payout_method?: string | null
          payout_reference?: string | null
          period_end: string
          period_start: string
          processed_at?: string | null
          rental_id?: string | null
          status?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          notification_sent?: boolean
          owner_id?: string
          payout_method?: string | null
          payout_reference?: string | null
          period_end?: string
          period_start?: string
          processed_at?: string | null
          rental_id?: string | null
          status?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_earnings_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_earnings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_payout_accounts: {
        Row: {
          account_name: string | null
          account_number: string | null
          bank_code: string | null
          bank_name: string | null
          country_code: string
          created_at: string
          currency: string
          id: string
          is_default: boolean
          is_verified: boolean
          owner_id: string
          paypal_email: string | null
          provider: string
          recipient_code: string | null
          updated_at: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          bank_code?: string | null
          bank_name?: string | null
          country_code: string
          created_at?: string
          currency: string
          id?: string
          is_default?: boolean
          is_verified?: boolean
          owner_id: string
          paypal_email?: string | null
          provider: string
          recipient_code?: string | null
          updated_at?: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          bank_code?: string | null
          bank_name?: string | null
          country_code?: string
          created_at?: string
          currency?: string
          id?: string
          is_default?: boolean
          is_verified?: boolean
          owner_id?: string
          paypal_email?: string | null
          provider?: string
          recipient_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      owner_payouts: {
        Row: {
          amount: number
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          initiated_by: string
          owner_id: string
          payout_account_id: string | null
          processed_at: string | null
          provider: string
          raw_payload: Json | null
          scheduled_for: string | null
          status: string
          transfer_code: string | null
          transfer_reference: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency: string
          failure_reason?: string | null
          id?: string
          initiated_by?: string
          owner_id: string
          payout_account_id?: string | null
          processed_at?: string | null
          provider: string
          raw_payload?: Json | null
          scheduled_for?: string | null
          status?: string
          transfer_code?: string | null
          transfer_reference?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          initiated_by?: string
          owner_id?: string
          payout_account_id?: string | null
          processed_at?: string | null
          provider?: string
          raw_payload?: Json | null
          scheduled_for?: string | null
          status?: string
          transfer_code?: string | null
          transfer_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_payouts_payout_account_id_fkey"
            columns: ["payout_account_id"]
            isOneToOne: false
            referencedRelation: "owner_payout_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_defaults: {
        Row: {
          amount_due: number
          created_at: string
          currency: string
          deactivated_at: string | null
          deactivation_eligible: boolean
          driver_id: string
          hours_overdue: number
          id: string
          last_notification_at: string | null
          notifications_sent: number
          payment_frequency: string
          rental_id: string
          resolved_at: string | null
          status: string
          vehicle_id: string
        }
        Insert: {
          amount_due: number
          created_at?: string
          currency?: string
          deactivated_at?: string | null
          deactivation_eligible?: boolean
          driver_id: string
          hours_overdue?: number
          id?: string
          last_notification_at?: string | null
          notifications_sent?: number
          payment_frequency?: string
          rental_id: string
          resolved_at?: string | null
          status?: string
          vehicle_id: string
        }
        Update: {
          amount_due?: number
          created_at?: string
          currency?: string
          deactivated_at?: string | null
          deactivation_eligible?: boolean
          driver_id?: string
          hours_overdue?: number
          id?: string
          last_notification_at?: string | null
          notifications_sent?: number
          payment_frequency?: string
          rental_id?: string
          resolved_at?: string | null
          status?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_defaults_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_disputes: {
        Row: {
          amount: number | null
          correlation_id: string | null
          created_at: string
          currency: string | null
          id: string
          metadata: Json
          opened_at: string
          payment_id: string
          provider: string
          provider_reference: string | null
          reason: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          correlation_id?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          metadata?: Json
          opened_at?: string
          payment_id: string
          provider: string
          provider_reference?: string | null
          reason?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          correlation_id?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          metadata?: Json
          opened_at?: string
          payment_id?: string
          provider?: string
          provider_reference?: string | null
          reason?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_disputes_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "billing_reconciliation_view"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "payment_disputes_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_failure_codes: {
        Row: {
          actor: string
          category: string
          code: string
          created_at: string
          is_blocking: boolean
          remediation: string | null
          retryable: boolean
          severity: string
          updated_at: string
          user_message: string
        }
        Insert: {
          actor?: string
          category: string
          code: string
          created_at?: string
          is_blocking?: boolean
          remediation?: string | null
          retryable?: boolean
          severity?: string
          updated_at?: string
          user_message: string
        }
        Update: {
          actor?: string
          category?: string
          code?: string
          created_at?: string
          is_blocking?: boolean
          remediation?: string | null
          retryable?: boolean
          severity?: string
          updated_at?: string
          user_message?: string
        }
        Relationships: []
      }
      payment_idempotency_keys: {
        Row: {
          completed_at: string | null
          created_at: string
          idempotency_key: string
          request_hash: string | null
          response: Json | null
          scope: string
          status: string
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          idempotency_key: string
          request_hash?: string | null
          response?: Json | null
          scope: string
          status?: string
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          idempotency_key?: string
          request_hash?: string | null
          response?: Json | null
          scope?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      payment_preflight_log: {
        Row: {
          blocking_codes: string[]
          context: Json
          created_at: string
          id: string
          operation: string
          passed: boolean
          user_id: string | null
          warning_codes: string[]
        }
        Insert: {
          blocking_codes?: string[]
          context?: Json
          created_at?: string
          id?: string
          operation: string
          passed: boolean
          user_id?: string | null
          warning_codes?: string[]
        }
        Update: {
          blocking_codes?: string[]
          context?: Json
          created_at?: string
          id?: string
          operation?: string
          passed?: boolean
          user_id?: string | null
          warning_codes?: string[]
        }
        Relationships: []
      }
      payment_state_events: {
        Row: {
          actor: string | null
          actor_kind: string
          attempt: number
          correlation_id: string | null
          created_at: string
          entity: string
          entity_id: string
          from_state: string | null
          id: string
          metadata: Json
          provider: string | null
          provider_reference: string | null
          reason: string | null
          to_state: string
          user_id: string | null
        }
        Insert: {
          actor?: string | null
          actor_kind?: string
          attempt?: number
          correlation_id?: string | null
          created_at?: string
          entity: string
          entity_id: string
          from_state?: string | null
          id?: string
          metadata?: Json
          provider?: string | null
          provider_reference?: string | null
          reason?: string | null
          to_state: string
          user_id?: string | null
        }
        Update: {
          actor?: string | null
          actor_kind?: string
          attempt?: number
          correlation_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string
          from_state?: string | null
          id?: string
          metadata?: Json
          provider?: string | null
          provider_reference?: string | null
          reason?: string | null
          to_state?: string
          user_id?: string | null
        }
        Relationships: []
      }
      payment_state_transitions: {
        Row: {
          created_at: string
          description: string | null
          entity: string
          from_state: string
          id: string
          is_terminal: boolean
          requires_admin: boolean
          to_state: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          entity: string
          from_state: string
          id?: string
          is_terminal?: boolean
          requires_admin?: boolean
          to_state: string
        }
        Update: {
          created_at?: string
          description?: string | null
          entity?: string
          from_state?: string
          id?: string
          is_terminal?: boolean
          requires_admin?: boolean
          to_state?: string
        }
        Relationships: []
      }
      payment_webhook_events: {
        Row: {
          correlation_id: string | null
          created_at: string
          error: string | null
          event_type: string | null
          external_event_id: string | null
          id: string
          invoice_id: string | null
          payload: Json
          payment_id: string | null
          provider: string
          receipt_id: string | null
          reference: string | null
          signature_valid: boolean | null
          status: string
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          error?: string | null
          event_type?: string | null
          external_event_id?: string | null
          id?: string
          invoice_id?: string | null
          payload?: Json
          payment_id?: string | null
          provider: string
          receipt_id?: string | null
          reference?: string | null
          signature_valid?: boolean | null
          status?: string
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          error?: string | null
          event_type?: string | null
          external_event_id?: string | null
          id?: string
          invoice_id?: string | null
          payload?: Json
          payment_id?: string | null
          provider?: string
          receipt_id?: string | null
          reference?: string | null
          signature_valid?: boolean | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_webhook_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "billing_reconciliation_view"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "payment_webhook_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_webhook_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "billing_reconciliation_view"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "payment_webhook_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_webhook_events_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "billing_reconciliation_view"
            referencedColumns: ["receipt_id"]
          },
          {
            foreignKeyName: "payment_webhook_events_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          driver_id: string
          failure_reason: string | null
          id: string
          notification_sent: boolean
          owner_id: string | null
          owner_share_amount: number | null
          payment_frequency: string
          payment_method: string | null
          platform_fee_amount: number | null
          processed_at: string | null
          purpose: string
          rental_id: string | null
          settled_at: string | null
          status: string
          subscription_plan_id: string | null
          tax_amount: number
          transaction_id: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          driver_id: string
          failure_reason?: string | null
          id?: string
          notification_sent?: boolean
          owner_id?: string | null
          owner_share_amount?: number | null
          payment_frequency?: string
          payment_method?: string | null
          platform_fee_amount?: number | null
          processed_at?: string | null
          purpose?: string
          rental_id?: string | null
          settled_at?: string | null
          status?: string
          subscription_plan_id?: string | null
          tax_amount?: number
          transaction_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          driver_id?: string
          failure_reason?: string | null
          id?: string
          notification_sent?: boolean
          owner_id?: string | null
          owner_share_amount?: number | null
          payment_frequency?: string
          payment_method?: string | null
          platform_fee_amount?: number | null
          processed_at?: string | null
          purpose?: string
          rental_id?: string | null
          settled_at?: string | null
          status?: string
          subscription_plan_id?: string | null
          tax_amount?: number
          transaction_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_plan_id_fkey"
            columns: ["subscription_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      paypal_transactions: {
        Row: {
          amount: number
          capture_id: string | null
          created_at: string
          currency: string
          driver_id: string
          failure_reason: string | null
          id: string
          order_id: string
          owner_id: string | null
          payer_email: string | null
          payer_id: string | null
          payment_id: string | null
          raw_capture_response: Json | null
          raw_order_response: Json | null
          rental_id: string | null
          status: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          amount: number
          capture_id?: string | null
          created_at?: string
          currency?: string
          driver_id: string
          failure_reason?: string | null
          id?: string
          order_id: string
          owner_id?: string | null
          payer_email?: string | null
          payer_id?: string | null
          payment_id?: string | null
          raw_capture_response?: Json | null
          raw_order_response?: Json | null
          rental_id?: string | null
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          amount?: number
          capture_id?: string | null
          created_at?: string
          currency?: string
          driver_id?: string
          failure_reason?: string | null
          id?: string
          order_id?: string
          owner_id?: string | null
          payer_email?: string | null
          payer_id?: string | null
          payment_id?: string | null
          raw_capture_response?: Json | null
          raw_order_response?: Json | null
          rental_id?: string | null
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paypal_transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "billing_reconciliation_view"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "paypal_transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paypal_transactions_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paypal_transactions_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      paystack_transactions: {
        Row: {
          access_code: string | null
          amount: number
          authorization_url: string | null
          channel: string | null
          created_at: string
          currency: string
          driver_id: string | null
          failure_reason: string | null
          gateway_response: string | null
          id: string
          payment_id: string | null
          raw_payload: Json | null
          reference: string
          rental_id: string | null
          status: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          access_code?: string | null
          amount: number
          authorization_url?: string | null
          channel?: string | null
          created_at?: string
          currency: string
          driver_id?: string | null
          failure_reason?: string | null
          gateway_response?: string | null
          id?: string
          payment_id?: string | null
          raw_payload?: Json | null
          reference: string
          rental_id?: string | null
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          access_code?: string | null
          amount?: number
          authorization_url?: string | null
          channel?: string | null
          created_at?: string
          currency?: string
          driver_id?: string | null
          failure_reason?: string | null
          gateway_response?: string | null
          id?: string
          payment_id?: string | null
          raw_payload?: Json | null
          reference?: string
          rental_id?: string | null
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paystack_transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "billing_reconciliation_view"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "paystack_transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paystack_transactions_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paystack_transactions_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_denied_log: {
        Row: {
          attempted_at: string
          attempted_fields: string[]
          attempted_values: Json | null
          id: string
          reason: string
          session_role: string | null
          target_row_id: string | null
          target_table: string
          user_id: string | null
        }
        Insert: {
          attempted_at?: string
          attempted_fields?: string[]
          attempted_values?: Json | null
          id?: string
          reason: string
          session_role?: string | null
          target_row_id?: string | null
          target_table: string
          user_id?: string | null
        }
        Update: {
          attempted_at?: string
          attempted_fields?: string[]
          attempted_values?: Json | null
          id?: string
          reason?: string
          session_role?: string | null
          target_row_id?: string | null
          target_table?: string
          user_id?: string | null
        }
        Relationships: []
      }
      persona_id_class_rules: {
        Row: {
          accepted_classes: Json
          country_code: string
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          requires_drivers_license: boolean
          subject_role: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accepted_classes?: Json
          country_code: string
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          requires_drivers_license?: boolean
          subject_role: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accepted_classes?: Json
          country_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          requires_drivers_license?: boolean
          subject_role?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      persona_inquiries: {
        Row: {
          created_at: string
          id: string
          inquiry_id: string | null
          mismatch_fields: Json
          raw_payload: Json
          region: string | null
          status: string
          subject_ref: string | null
          subject_type: string
          template_id: string | null
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          inquiry_id?: string | null
          mismatch_fields?: Json
          raw_payload?: Json
          region?: string | null
          status?: string
          subject_ref?: string | null
          subject_type: string
          template_id?: string | null
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          inquiry_id?: string | null
          mismatch_fields?: Json
          raw_payload?: Json
          region?: string | null
          status?: string
          subject_ref?: string | null
          subject_type?: string
          template_id?: string | null
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      persona_region_templates: {
        Row: {
          auto_generated: boolean
          country_code: string
          created_at: string
          environment_id: string | null
          id: string
          inquiry_template_id: string | null
          is_active: boolean
          provision_error: string | null
          provision_status: string
          provisioned_at: string | null
          region_id: string | null
          source_template_id: string | null
          updated_at: string
        }
        Insert: {
          auto_generated?: boolean
          country_code: string
          created_at?: string
          environment_id?: string | null
          id?: string
          inquiry_template_id?: string | null
          is_active?: boolean
          provision_error?: string | null
          provision_status?: string
          provisioned_at?: string | null
          region_id?: string | null
          source_template_id?: string | null
          updated_at?: string
        }
        Update: {
          auto_generated?: boolean
          country_code?: string
          created_at?: string
          environment_id?: string | null
          id?: string
          inquiry_template_id?: string | null
          is_active?: boolean
          provision_error?: string | null
          provision_status?: string
          provisioned_at?: string | null
          region_id?: string | null
          source_template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "persona_region_templates_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "region_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_status_digest_queue: {
        Row: {
          created_at: string
          id: string
          inquiry_id: string | null
          note: string | null
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inquiry_id?: string | null
          note?: string | null
          sent_at?: string | null
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inquiry_id?: string | null
          note?: string | null
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      persona_template_config: {
        Row: {
          created_at: string
          environment_id: string | null
          notes: string | null
          requires_drivers_license: boolean
          subject_role: string
          template_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          environment_id?: string | null
          notes?: string | null
          requires_drivers_license?: boolean
          subject_role: string
          template_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          environment_id?: string | null
          notes?: string | null
          requires_drivers_license?: boolean
          subject_role?: string
          template_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      persona_verification_attempts: {
        Row: {
          chosen_id_class: string | null
          completed_at: string | null
          correlation_id: string | null
          created_at: string
          error_code: string | null
          error_detail: string | null
          id: string
          inquiry_id: string | null
          offered_id_classes: Json
          region: string | null
          result: string | null
          retried_from: string | null
          started_at: string
          status: string
          subject_role: string | null
          subject_type: string | null
          template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          chosen_id_class?: string | null
          completed_at?: string | null
          correlation_id?: string | null
          created_at?: string
          error_code?: string | null
          error_detail?: string | null
          id?: string
          inquiry_id?: string | null
          offered_id_classes?: Json
          region?: string | null
          result?: string | null
          retried_from?: string | null
          started_at?: string
          status?: string
          subject_role?: string | null
          subject_type?: string | null
          template_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          chosen_id_class?: string | null
          completed_at?: string | null
          correlation_id?: string | null
          created_at?: string
          error_code?: string | null
          error_detail?: string | null
          id?: string
          inquiry_id?: string | null
          offered_id_classes?: Json
          region?: string | null
          result?: string | null
          retried_from?: string | null
          started_at?: string
          status?: string
          subject_role?: string | null
          subject_type?: string | null
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "persona_verification_attempts_retried_from_fkey"
            columns: ["retried_from"]
            isOneToOne: false
            referencedRelation: "persona_verification_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_otp_codes: {
        Row: {
          attempts: number
          channel: string
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          phone: string
        }
        Insert: {
          attempts?: number
          channel?: string
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          phone: string
        }
        Update: {
          attempts?: number
          channel?: string
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
        }
        Relationships: []
      }
      phone_reference: {
        Row: {
          calling_code: string
          country_name: string
          created_at: string
          example_e164: string | null
          example_national: string | null
          iso2: string
          region_label: string | null
          updated_at: string
        }
        Insert: {
          calling_code: string
          country_name: string
          created_at?: string
          example_e164?: string | null
          example_national?: string | null
          iso2: string
          region_label?: string | null
          updated_at?: string
        }
        Update: {
          calling_code?: string
          country_name?: string
          created_at?: string
          example_e164?: string | null
          example_national?: string | null
          iso2?: string
          region_label?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_cities: {
        Row: {
          center_lat: number | null
          center_lng: number | null
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          name: string
          region_id: string
          search_radius_miles: number | null
          updated_at: string
        }
        Insert: {
          center_lat?: number | null
          center_lng?: number | null
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          region_id: string
          search_radius_miles?: number | null
          updated_at?: string
        }
        Update: {
          center_lat?: number | null
          center_lng?: number | null
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          region_id?: string
          search_radius_miles?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_cities_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "platform_regions"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_company_info: {
        Row: {
          address_line: string | null
          city: string | null
          company_name: string
          country_name: string | null
          created_at: string
          email: string | null
          full_address: string | null
          id: string
          is_active: boolean
          phone: string | null
          phone_raw: string | null
          postal_code: string | null
          region: string
          state: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address_line?: string | null
          city?: string | null
          company_name: string
          country_name?: string | null
          created_at?: string
          email?: string | null
          full_address?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          phone_raw?: string | null
          postal_code?: string | null
          region: string
          state?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address_line?: string | null
          city?: string | null
          company_name?: string
          country_name?: string | null
          created_at?: string
          email?: string | null
          full_address?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          phone_raw?: string | null
          postal_code?: string | null
          region?: string
          state?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      platform_countries: {
        Row: {
          code: string
          created_at: string
          currency_code: string
          currency_symbol: string
          display_order: number
          flag: string
          id: string
          is_active: boolean
          name: string
          payment_gateway: string
          phone_prefix: string
          timezone: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency_code: string
          currency_symbol: string
          display_order?: number
          flag?: string
          id?: string
          is_active?: boolean
          name: string
          payment_gateway?: string
          phone_prefix: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency_code?: string
          currency_symbol?: string
          display_order?: number
          flag?: string
          id?: string
          is_active?: boolean
          name?: string
          payment_gateway?: string
          phone_prefix?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_email_config: {
        Row: {
          description: string | null
          email: string
          id: string
          is_active: boolean
          key: string
          sender_name: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          email: string
          id?: string
          is_active?: boolean
          key: string
          sender_name?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          email?: string
          id?: string
          is_active?: boolean
          key?: string
          sender_name?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      platform_feature_overrides: {
        Row: {
          city_id: string | null
          country_id: string | null
          created_at: string
          feature_id: string
          id: string
          is_enabled: boolean
          notes: string | null
          overridden_at: string | null
          overridden_by: string | null
          region_id: string | null
          scope: Database["public"]["Enums"]["feature_scope"]
          updated_at: string
        }
        Insert: {
          city_id?: string | null
          country_id?: string | null
          created_at?: string
          feature_id: string
          id?: string
          is_enabled: boolean
          notes?: string | null
          overridden_at?: string | null
          overridden_by?: string | null
          region_id?: string | null
          scope: Database["public"]["Enums"]["feature_scope"]
          updated_at?: string
        }
        Update: {
          city_id?: string | null
          country_id?: string | null
          created_at?: string
          feature_id?: string
          id?: string
          is_enabled?: boolean
          notes?: string | null
          overridden_at?: string | null
          overridden_by?: string | null
          region_id?: string | null
          scope?: Database["public"]["Enums"]["feature_scope"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_feature_overrides_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "platform_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_feature_overrides_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "platform_countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_feature_overrides_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "platform_features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_feature_overrides_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "platform_regions"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_features: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_global_default: boolean
          key: string
          name: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_global_default?: boolean
          key: string
          name: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_global_default?: boolean
          key?: string
          name?: string
        }
        Relationships: []
      }
      platform_kv_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      platform_regions: {
        Row: {
          center_lat: number | null
          center_lng: number | null
          code: string
          country_id: string
          created_at: string
          display_order: number
          forwarding_notes: string | null
          forwarding_sms: string | null
          forwarding_whatsapp: string | null
          id: string
          is_active: boolean
          map_zoom: number | null
          name: string
          requires_police_report: boolean | null
          updated_at: string
        }
        Insert: {
          center_lat?: number | null
          center_lng?: number | null
          code: string
          country_id: string
          created_at?: string
          display_order?: number
          forwarding_notes?: string | null
          forwarding_sms?: string | null
          forwarding_whatsapp?: string | null
          id?: string
          is_active?: boolean
          map_zoom?: number | null
          name: string
          requires_police_report?: boolean | null
          updated_at?: string
        }
        Update: {
          center_lat?: number | null
          center_lng?: number | null
          code?: string
          country_id?: string
          created_at?: string
          display_order?: number
          forwarding_notes?: string | null
          forwarding_sms?: string | null
          forwarding_whatsapp?: string | null
          id?: string
          is_active?: boolean
          map_zoom?: number | null
          name?: string
          requires_police_report?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_regions_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "platform_countries"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_acceptances: {
        Row: {
          accepted_at: string
          id: string
          ip_address: string | null
          policy_type: string
          policy_version_id: string
          region: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          id?: string
          ip_address?: string | null
          policy_type: string
          policy_version_id: string
          region?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          id?: string
          ip_address?: string | null
          policy_type?: string
          policy_version_id?: string
          region?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_acceptances_policy_version_id_fkey"
            columns: ["policy_version_id"]
            isOneToOne: false
            referencedRelation: "policy_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_versions: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          effective_date: string
          id: string
          is_active: boolean | null
          policy_type: string
          region: string
          summary: string | null
          title: string
          updated_at: string
          version: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          effective_date: string
          id?: string
          is_active?: boolean | null
          policy_type: string
          region: string
          summary?: string | null
          title: string
          updated_at?: string
          version: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          effective_date?: string
          id?: string
          is_active?: boolean | null
          policy_type?: string
          region?: string
          summary?: string | null
          title?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      price_modification_requests: {
        Row: {
          admin_response: string | null
          created_at: string | null
          current_rate: number
          id: string
          negotiation_id: string
          processed_at: string | null
          processed_by: string | null
          reason: string
          requested_rate: number
          requester_id: string
          requester_type: string
          status: string | null
        }
        Insert: {
          admin_response?: string | null
          created_at?: string | null
          current_rate: number
          id?: string
          negotiation_id: string
          processed_at?: string | null
          processed_by?: string | null
          reason: string
          requested_rate: number
          requester_id: string
          requester_type: string
          status?: string | null
        }
        Update: {
          admin_response?: string | null
          created_at?: string | null
          current_rate?: number
          id?: string
          negotiation_id?: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string
          requested_rate?: number
          requester_id?: string
          requester_type?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_modification_requests_negotiation_id_fkey"
            columns: ["negotiation_id"]
            isOneToOne: false
            referencedRelation: "price_negotiations"
            referencedColumns: ["id"]
          },
        ]
      }
      price_negotiations: {
        Row: {
          admin_counter_offer: number | null
          admin_response: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          currency: string
          driver_id: string
          driver_message: string | null
          final_daily_rate: number | null
          id: string
          is_locked: boolean | null
          locked_at: string | null
          locked_by: string | null
          owner_id: string | null
          rejection_reason: string | null
          requested_daily_rate: number
          status: Database["public"]["Enums"]["negotiation_status"] | null
          updated_at: string | null
          vehicle_category: string | null
          vehicle_id: string | null
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_year: number | null
        }
        Insert: {
          admin_counter_offer?: number | null
          admin_response?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          currency?: string
          driver_id: string
          driver_message?: string | null
          final_daily_rate?: number | null
          id?: string
          is_locked?: boolean | null
          locked_at?: string | null
          locked_by?: string | null
          owner_id?: string | null
          rejection_reason?: string | null
          requested_daily_rate: number
          status?: Database["public"]["Enums"]["negotiation_status"] | null
          updated_at?: string | null
          vehicle_category?: string | null
          vehicle_id?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
        }
        Update: {
          admin_counter_offer?: number | null
          admin_response?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          currency?: string
          driver_id?: string
          driver_message?: string | null
          final_daily_rate?: number | null
          id?: string
          is_locked?: boolean | null
          locked_at?: string | null
          locked_by?: string | null
          owner_id?: string | null
          rejection_reason?: string | null
          requested_daily_rate?: number
          status?: Database["public"]["Enums"]["negotiation_status"] | null
          updated_at?: string | null
          vehicle_category?: string | null
          vehicle_id?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "price_negotiations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_negotiations_vehicle_owner_fk"
            columns: ["vehicle_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      profile_settings_audit: {
        Row: {
          action: string
          actor_name: string | null
          changed_by: string | null
          created_at: string
          field: string
          id: string
          metadata: Json | null
          new_value: string | null
          old_value: string | null
          source: string | null
          subject_name: string | null
          user_id: string
        }
        Insert: {
          action: string
          actor_name?: string | null
          changed_by?: string | null
          created_at?: string
          field: string
          id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          source?: string | null
          subject_name?: string | null
          user_id: string
        }
        Update: {
          action?: string
          actor_name?: string | null
          changed_by?: string | null
          created_at?: string
          field?: string
          id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          source?: string | null
          subject_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          access_level: Database["public"]["Enums"]["access_level_enum"]
          avatar_url: string | null
          city: string | null
          cookie_consent: Json | null
          cookie_consent_at: string | null
          created_at: string | null
          daily_plan_forbidden: boolean | null
          daily_plan_forbidden_at: string | null
          daily_plan_forbidden_reason: string | null
          data_sharing_consent: boolean
          data_sharing_consent_at: string | null
          driver_license_expiry: string | null
          driver_license_number: string | null
          email: string | null
          email_verified: boolean | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string | null
          has_payment_method: boolean
          id: string
          identity_verification_status: string | null
          identity_verified_at: string | null
          identity_verified_inquiry_id: string | null
          is_active: boolean
          messaging_consent_at: string | null
          notification_email: boolean | null
          notification_sms: boolean | null
          notification_whatsapp: boolean | null
          onboarding_completed_at: string | null
          onboarding_state: Json
          owns_vehicle: boolean | null
          payment_proxy_verified: boolean
          payments_suspended: boolean
          persona_notification_frequency: string
          persona_verified: boolean
          phone: string | null
          phone_verification_code: string | null
          phone_verification_expires_at: string | null
          phone_verified: boolean | null
          preferred_country: string | null
          profile_completion_skipped_at: string | null
          public_uuid: string
          referee_verified: boolean
          region_mode: string | null
          registration_stage:
            | Database["public"]["Enums"]["registration_stage_enum"]
            | null
          role_change_used: boolean
          role_changed_at: string | null
          stage_updated_at: string | null
          street_address: string | null
          suspended_call_in_id: string | null
          suspended_reason: string | null
          suspended_until: string | null
          updated_at: string | null
          user_id: string
          username: string | null
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["access_level_enum"]
          avatar_url?: string | null
          city?: string | null
          cookie_consent?: Json | null
          cookie_consent_at?: string | null
          created_at?: string | null
          daily_plan_forbidden?: boolean | null
          daily_plan_forbidden_at?: string | null
          daily_plan_forbidden_reason?: string | null
          data_sharing_consent?: boolean
          data_sharing_consent_at?: string | null
          driver_license_expiry?: string | null
          driver_license_number?: string | null
          email?: string | null
          email_verified?: boolean | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string | null
          has_payment_method?: boolean
          id?: string
          identity_verification_status?: string | null
          identity_verified_at?: string | null
          identity_verified_inquiry_id?: string | null
          is_active?: boolean
          messaging_consent_at?: string | null
          notification_email?: boolean | null
          notification_sms?: boolean | null
          notification_whatsapp?: boolean | null
          onboarding_completed_at?: string | null
          onboarding_state?: Json
          owns_vehicle?: boolean | null
          payment_proxy_verified?: boolean
          payments_suspended?: boolean
          persona_notification_frequency?: string
          persona_verified?: boolean
          phone?: string | null
          phone_verification_code?: string | null
          phone_verification_expires_at?: string | null
          phone_verified?: boolean | null
          preferred_country?: string | null
          profile_completion_skipped_at?: string | null
          public_uuid?: string
          referee_verified?: boolean
          region_mode?: string | null
          registration_stage?:
            | Database["public"]["Enums"]["registration_stage_enum"]
            | null
          role_change_used?: boolean
          role_changed_at?: string | null
          stage_updated_at?: string | null
          street_address?: string | null
          suspended_call_in_id?: string | null
          suspended_reason?: string | null
          suspended_until?: string | null
          updated_at?: string | null
          user_id: string
          username?: string | null
        }
        Update: {
          access_level?: Database["public"]["Enums"]["access_level_enum"]
          avatar_url?: string | null
          city?: string | null
          cookie_consent?: Json | null
          cookie_consent_at?: string | null
          created_at?: string | null
          daily_plan_forbidden?: boolean | null
          daily_plan_forbidden_at?: string | null
          daily_plan_forbidden_reason?: string | null
          data_sharing_consent?: boolean
          data_sharing_consent_at?: string | null
          driver_license_expiry?: string | null
          driver_license_number?: string | null
          email?: string | null
          email_verified?: boolean | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string | null
          has_payment_method?: boolean
          id?: string
          identity_verification_status?: string | null
          identity_verified_at?: string | null
          identity_verified_inquiry_id?: string | null
          is_active?: boolean
          messaging_consent_at?: string | null
          notification_email?: boolean | null
          notification_sms?: boolean | null
          notification_whatsapp?: boolean | null
          onboarding_completed_at?: string | null
          onboarding_state?: Json
          owns_vehicle?: boolean | null
          payment_proxy_verified?: boolean
          payments_suspended?: boolean
          persona_notification_frequency?: string
          persona_verified?: boolean
          phone?: string | null
          phone_verification_code?: string | null
          phone_verification_expires_at?: string | null
          phone_verified?: boolean | null
          preferred_country?: string | null
          profile_completion_skipped_at?: string | null
          public_uuid?: string
          referee_verified?: boolean
          region_mode?: string | null
          registration_stage?:
            | Database["public"]["Enums"]["registration_stage_enum"]
            | null
          role_change_used?: boolean
          role_changed_at?: string | null
          stage_updated_at?: string | null
          street_address?: string | null
          suspended_call_in_id?: string | null
          suspended_reason?: string | null
          suspended_until?: string | null
          updated_at?: string | null
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      provider_api_sessions: {
        Row: {
          credential_fingerprint: string
          expires_at: string
          issued_at: string
          provider: string
          session_ciphertext: string
          updated_at: string
        }
        Insert: {
          credential_fingerprint: string
          expires_at: string
          issued_at?: string
          provider: string
          session_ciphertext: string
          updated_at?: string
        }
        Update: {
          credential_fingerprint?: string
          expires_at?: string
          issued_at?: string
          provider?: string
          session_ciphertext?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_billing_accounts: {
        Row: {
          billing_currency: string
          config: Json
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          last_sync_detail: string | null
          last_sync_status: string | null
          last_synced_at: string | null
          provider: string
          sync_enabled: boolean
          updated_at: string
        }
        Insert: {
          billing_currency?: string
          config?: Json
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          last_sync_detail?: string | null
          last_sync_status?: string | null
          last_synced_at?: string | null
          provider: string
          sync_enabled?: boolean
          updated_at?: string
        }
        Update: {
          billing_currency?: string
          config?: Json
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          last_sync_detail?: string | null
          last_sync_status?: string | null
          last_synced_at?: string | null
          provider?: string
          sync_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      provider_billing_events: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          device_id: string | null
          event_type: string
          external_id: string | null
          id: string
          occurred_at: string
          period_end: string | null
          period_start: string | null
          provider: string
          quantity: number | null
          raw: Json
          reconciled_at: string | null
          reconciled_by: string | null
          reconciliation_note: string | null
          sim_id: string | null
          source: string
          status: string
          unit: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          device_id?: string | null
          event_type?: string
          external_id?: string | null
          id?: string
          occurred_at?: string
          period_end?: string | null
          period_start?: string | null
          provider: string
          quantity?: number | null
          raw?: Json
          reconciled_at?: string | null
          reconciled_by?: string | null
          reconciliation_note?: string | null
          sim_id?: string | null
          source?: string
          status?: string
          unit?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          device_id?: string | null
          event_type?: string
          external_id?: string | null
          id?: string
          occurred_at?: string
          period_end?: string | null
          period_start?: string | null
          provider?: string
          quantity?: number | null
          raw?: Json
          reconciled_at?: string | null
          reconciled_by?: string | null
          reconciliation_note?: string | null
          sim_id?: string | null
          source?: string
          status?: string
          unit?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: []
      }
      provider_credential_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          masked: Json
          notes: string | null
          provider: string
          status: string
          updated_at: string
          vault_ids: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          masked?: Json
          notes?: string | null
          provider: string
          status?: string
          updated_at?: string
          vault_ids?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          masked?: Json
          notes?: string | null
          provider?: string
          status?: string
          updated_at?: string
          vault_ids?: Json
        }
        Relationships: []
      }
      provider_health_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          channel: string | null
          created_at: string
          dedupe_key: string | null
          details: Json
          error_rate: number | null
          failures: number
          id: string
          message: string
          notified_channels: string[]
          provider: string
          sample_size: number
          severity: string
          updated_at: string
          window_hours: number
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          channel?: string | null
          created_at?: string
          dedupe_key?: string | null
          details?: Json
          error_rate?: number | null
          failures?: number
          id?: string
          message: string
          notified_channels?: string[]
          provider: string
          sample_size?: number
          severity?: string
          updated_at?: string
          window_hours?: number
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          channel?: string | null
          created_at?: string
          dedupe_key?: string | null
          details?: Json
          error_rate?: number | null
          failures?: number
          id?: string
          message?: string
          notified_channels?: string[]
          provider?: string
          sample_size?: number
          severity?: string
          updated_at?: string
          window_hours?: number
        }
        Relationships: []
      }
      proxy_action_idempotency: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          idempotency_key: string
          proxy_account_id: string | null
          response: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          idempotency_key: string
          proxy_account_id?: string | null
          response?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          idempotency_key?: string
          proxy_account_id?: string | null
          response?: Json
        }
        Relationships: [
          {
            foreignKeyName: "proxy_action_idempotency_proxy_account_id_fkey"
            columns: ["proxy_account_id"]
            isOneToOne: false
            referencedRelation: "driver_proxy_billing_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      proxy_billing_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          created_at: string
          details: Json
          driver_id: string | null
          id: string
          idempotency_key: string | null
          ip_address: string | null
          new_state: Json | null
          previous_state: Json | null
          proxy_account_id: string | null
          session_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          details?: Json
          driver_id?: string | null
          id?: string
          idempotency_key?: string | null
          ip_address?: string | null
          new_state?: Json | null
          previous_state?: Json | null
          proxy_account_id?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          details?: Json
          driver_id?: string | null
          id?: string
          idempotency_key?: string | null
          ip_address?: string | null
          new_state?: Json | null
          previous_state?: Json | null
          proxy_account_id?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proxy_billing_audit_log_proxy_account_id_fkey"
            columns: ["proxy_account_id"]
            isOneToOne: false
            referencedRelation: "driver_proxy_billing_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      push_devices: {
        Row: {
          created_at: string
          device_label: string | null
          id: string
          last_seen_at: string
          notification_prefs: Json
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_label?: string | null
          id?: string
          last_seen_at?: string
          notification_prefs?: Json
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_label?: string | null
          id?: string
          last_seen_at?: string
          notification_prefs?: Json
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rate_limit_log: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          identifier: string
          request_count: number
          window_start: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          identifier: string
          request_count?: number
          window_start?: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          identifier?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      receipts: {
        Row: {
          amount: number
          created_at: string
          currency: string
          description: string | null
          driver_id: string | null
          email_attempts: number
          email_error: string | null
          email_last_attempt_at: string | null
          email_status: string
          id: string
          idempotency_key: string | null
          invoice_id: string | null
          issued_at: string
          metadata: Json
          owner_id: string | null
          payment_id: string | null
          payment_method: string | null
          pdf_url: string | null
          receipt_number: string
          recipient_email: string | null
          region: string | null
          rental_id: string | null
          sent_at: string | null
          status: string
          transaction_id: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          description?: string | null
          driver_id?: string | null
          email_attempts?: number
          email_error?: string | null
          email_last_attempt_at?: string | null
          email_status?: string
          id?: string
          idempotency_key?: string | null
          invoice_id?: string | null
          issued_at?: string
          metadata?: Json
          owner_id?: string | null
          payment_id?: string | null
          payment_method?: string | null
          pdf_url?: string | null
          receipt_number?: string
          recipient_email?: string | null
          region?: string | null
          rental_id?: string | null
          sent_at?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          description?: string | null
          driver_id?: string | null
          email_attempts?: number
          email_error?: string | null
          email_last_attempt_at?: string | null
          email_status?: string
          id?: string
          idempotency_key?: string | null
          invoice_id?: string | null
          issued_at?: string
          metadata?: Json
          owner_id?: string | null
          payment_id?: string | null
          payment_method?: string | null
          pdf_url?: string | null
          receipt_number?: string
          recipient_email?: string | null
          region?: string | null
          rental_id?: string | null
          sent_at?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "billing_reconciliation_view"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "receipts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "billing_reconciliation_view"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "receipts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string
          details: Json
          id: string
          message: string
          psp: string | null
          run_id: string | null
          severity: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          created_at?: string
          details?: Json
          id?: string
          message: string
          psp?: string | null
          run_id?: string | null
          severity?: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string
          details?: Json
          id?: string
          message?: string
          psp?: string | null
          run_id?: string | null
          severity?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_alerts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_runs: {
        Row: {
          backfilled_payment_ids: string[]
          created_at: string
          duration_ms: number | null
          errors: Json
          fatal_error: string | null
          finished_at: string | null
          id: string
          per_psp: Json
          since: string
          started_at: string
          status: string
          total_backfilled: number
          total_checked: number
          total_errors: number
          total_updated: number
          triggered_by: string
          updated_at: string
        }
        Insert: {
          backfilled_payment_ids?: string[]
          created_at?: string
          duration_ms?: number | null
          errors?: Json
          fatal_error?: string | null
          finished_at?: string | null
          id?: string
          per_psp?: Json
          since: string
          started_at?: string
          status?: string
          total_backfilled?: number
          total_checked?: number
          total_errors?: number
          total_updated?: number
          triggered_by?: string
          updated_at?: string
        }
        Update: {
          backfilled_payment_ids?: string[]
          created_at?: string
          duration_ms?: number | null
          errors?: Json
          fatal_error?: string | null
          finished_at?: string | null
          id?: string
          per_psp?: Json
          since?: string
          started_at?: string
          status?: string
          total_backfilled?: number
          total_checked?: number
          total_errors?: number
          total_updated?: number
          triggered_by?: string
          updated_at?: string
        }
        Relationships: []
      }
      referee_verifications: {
        Row: {
          application_id: string
          attestation_comments: string | null
          attestation_response: string | null
          attestation_sent_at: string | null
          attestation_status: string
          attestation_token: string | null
          attested_at: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          id_number: string | null
          id_type: string | null
          last_notified_at: string | null
          mismatch_reason: string | null
          notified_channels: Json
          persona_inquiry_id: string | null
          phone: string | null
          referee_index: number
          status: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          application_id: string
          attestation_comments?: string | null
          attestation_response?: string | null
          attestation_sent_at?: string | null
          attestation_status?: string
          attestation_token?: string | null
          attested_at?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          id_number?: string | null
          id_type?: string | null
          last_notified_at?: string | null
          mismatch_reason?: string | null
          notified_channels?: Json
          persona_inquiry_id?: string | null
          phone?: string | null
          referee_index: number
          status?: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          application_id?: string
          attestation_comments?: string | null
          attestation_response?: string | null
          attestation_sent_at?: string | null
          attestation_status?: string
          attestation_token?: string | null
          attested_at?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          id_number?: string | null
          id_type?: string | null
          last_notified_at?: string | null
          mismatch_reason?: string | null
          notified_channels?: Json
          persona_inquiry_id?: string | null
          phone?: string | null
          referee_index?: number
          status?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referee_verifications_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referee_verifications_persona_inquiry_id_fkey"
            columns: ["persona_inquiry_id"]
            isOneToOne: false
            referencedRelation: "persona_inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      region_definitions: {
        Row: {
          build_error: string | null
          build_log: Json | null
          country_code: string
          country_name: string
          created_at: string
          created_by: string | null
          cultural_tone: string | null
          currency: string
          currency_symbol: string
          default_payment_gateway: string | null
          flag_emoji: string | null
          id: string
          payment_gateway: string
          payment_gateways: string[]
          phone_prefix: string
          primary_language: string | null
          sms_number: string | null
          sms_provider: string
          status: string
          support_hours: string | null
          timezone: string | null
          updated_at: string
          voice_provider: string
          whatsapp_number: string | null
          whatsapp_provider: string
        }
        Insert: {
          build_error?: string | null
          build_log?: Json | null
          country_code: string
          country_name: string
          created_at?: string
          created_by?: string | null
          cultural_tone?: string | null
          currency: string
          currency_symbol: string
          default_payment_gateway?: string | null
          flag_emoji?: string | null
          id?: string
          payment_gateway?: string
          payment_gateways?: string[]
          phone_prefix: string
          primary_language?: string | null
          sms_number?: string | null
          sms_provider?: string
          status?: string
          support_hours?: string | null
          timezone?: string | null
          updated_at?: string
          voice_provider?: string
          whatsapp_number?: string | null
          whatsapp_provider?: string
        }
        Update: {
          build_error?: string | null
          build_log?: Json | null
          country_code?: string
          country_name?: string
          created_at?: string
          created_by?: string | null
          cultural_tone?: string | null
          currency?: string
          currency_symbol?: string
          default_payment_gateway?: string | null
          flag_emoji?: string | null
          id?: string
          payment_gateway?: string
          payment_gateways?: string[]
          phone_prefix?: string
          primary_language?: string | null
          sms_number?: string | null
          sms_provider?: string
          status?: string
          support_hours?: string | null
          timezone?: string | null
          updated_at?: string
          voice_provider?: string
          whatsapp_number?: string | null
          whatsapp_provider?: string
        }
        Relationships: []
      }
      region_localized_content: {
        Row: {
          content: Json
          content_key: string
          created_at: string
          generated_by: string | null
          id: string
          region_id: string
          updated_at: string
        }
        Insert: {
          content: Json
          content_key: string
          created_at?: string
          generated_by?: string | null
          id?: string
          region_id: string
          updated_at?: string
        }
        Update: {
          content?: Json
          content_key?: string
          created_at?: string
          generated_by?: string | null
          id?: string
          region_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "region_localized_content_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "region_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_audit_log: {
        Row: {
          application_id: string | null
          application_type: string | null
          created_at: string
          email: string | null
          event_type: string
          id: string
          metadata: Json
          source: string
          user_id: string | null
        }
        Insert: {
          application_id?: string | null
          application_type?: string | null
          created_at?: string
          email?: string | null
          event_type: string
          id?: string
          metadata?: Json
          source?: string
          user_id?: string | null
        }
        Update: {
          application_id?: string | null
          application_type?: string | null
          created_at?: string
          email?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          source?: string
          user_id?: string | null
        }
        Relationships: []
      }
      rent_to_own_agreements: {
        Row: {
          admin_witness_id: string | null
          admin_witness_signature: string | null
          admin_witnessed_at: string | null
          agreement_content: string
          allow_buyout: boolean
          allow_conversion_to_rental: boolean
          created_at: string
          currency: string
          down_payment: number
          driver_id: string
          driver_signature: string | null
          driver_signed_at: string | null
          duration_months: number
          id: string
          listing_id: string
          monthly_payment: number
          next_payment_due: string | null
          owner_id: string
          owner_signature: string | null
          owner_signed_at: string | null
          payments_made: number
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          total_amount_paid: number
          total_price: number
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          admin_witness_id?: string | null
          admin_witness_signature?: string | null
          admin_witnessed_at?: string | null
          agreement_content: string
          allow_buyout?: boolean
          allow_conversion_to_rental?: boolean
          created_at?: string
          currency?: string
          down_payment: number
          driver_id: string
          driver_signature?: string | null
          driver_signed_at?: string | null
          duration_months: number
          id?: string
          listing_id: string
          monthly_payment: number
          next_payment_due?: string | null
          owner_id: string
          owner_signature?: string | null
          owner_signed_at?: string | null
          payments_made?: number
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          total_amount_paid?: number
          total_price: number
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          admin_witness_id?: string | null
          admin_witness_signature?: string | null
          admin_witnessed_at?: string | null
          agreement_content?: string
          allow_buyout?: boolean
          allow_conversion_to_rental?: boolean
          created_at?: string
          currency?: string
          down_payment?: number
          driver_id?: string
          driver_signature?: string | null
          driver_signed_at?: string | null
          duration_months?: number
          id?: string
          listing_id?: string
          monthly_payment?: number
          next_payment_due?: string | null
          owner_id?: string
          owner_signature?: string | null
          owner_signed_at?: string | null
          payments_made?: number
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          total_amount_paid?: number
          total_price?: number
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rent_to_own_agreements_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "rent_to_own_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_to_own_agreements_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      rent_to_own_listings: {
        Row: {
          admin_counter_down_payment: number | null
          admin_counter_duration_months: number | null
          admin_counter_monthly_payment: number | null
          admin_counter_total_price: number | null
          admin_response: string | null
          allow_buyout: boolean
          allow_conversion_to_rental: boolean
          approved_at: string | null
          approved_by: string | null
          created_at: string
          currency: string
          down_payment: number
          duration_months: number
          final_down_payment: number | null
          final_duration_months: number | null
          final_monthly_payment: number | null
          final_total_price: number | null
          id: string
          is_available: boolean
          monthly_payment: number
          owner_id: string
          owner_message: string | null
          status: string
          total_price: number
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          admin_counter_down_payment?: number | null
          admin_counter_duration_months?: number | null
          admin_counter_monthly_payment?: number | null
          admin_counter_total_price?: number | null
          admin_response?: string | null
          allow_buyout?: boolean
          allow_conversion_to_rental?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          currency?: string
          down_payment?: number
          duration_months: number
          final_down_payment?: number | null
          final_duration_months?: number | null
          final_monthly_payment?: number | null
          final_total_price?: number | null
          id?: string
          is_available?: boolean
          monthly_payment: number
          owner_id: string
          owner_message?: string | null
          status?: string
          total_price: number
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          admin_counter_down_payment?: number | null
          admin_counter_duration_months?: number | null
          admin_counter_monthly_payment?: number | null
          admin_counter_total_price?: number | null
          admin_response?: string | null
          allow_buyout?: boolean
          allow_conversion_to_rental?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          currency?: string
          down_payment?: number
          duration_months?: number
          final_down_payment?: number | null
          final_duration_months?: number | null
          final_monthly_payment?: number | null
          final_total_price?: number | null
          id?: string
          is_available?: boolean
          monthly_payment?: number
          owner_id?: string
          owner_message?: string | null
          status?: string
          total_price?: number
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rent_to_own_listings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      rent_to_own_settings: {
        Row: {
          feature_enabled: boolean
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          feature_enabled?: boolean
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          feature_enabled?: boolean
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      rentals: {
        Row: {
          created_at: string
          currency: string
          daily_rate: number
          driver_id: string
          end_date: string
          extended_end_date: string | null
          extension_approved: boolean | null
          extension_requested: boolean
          id: string
          negotiation_id: string | null
          owner_id: string
          payment_frequency: string
          pickup_location: string | null
          region: string
          return_confirmed_at: string | null
          return_inspection_notes: string | null
          return_location: string | null
          return_reminder_sent: boolean
          security_deposit_amount: number | null
          security_deposit_currency: string | null
          security_deposit_released_at: string | null
          security_deposit_status: string
          start_date: string
          status: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          daily_rate: number
          driver_id: string
          end_date: string
          extended_end_date?: string | null
          extension_approved?: boolean | null
          extension_requested?: boolean
          id?: string
          negotiation_id?: string | null
          owner_id: string
          payment_frequency?: string
          pickup_location?: string | null
          region?: string
          return_confirmed_at?: string | null
          return_inspection_notes?: string | null
          return_location?: string | null
          return_reminder_sent?: boolean
          security_deposit_amount?: number | null
          security_deposit_currency?: string | null
          security_deposit_released_at?: string | null
          security_deposit_status?: string
          start_date?: string
          status?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          daily_rate?: number
          driver_id?: string
          end_date?: string
          extended_end_date?: string | null
          extension_approved?: boolean | null
          extension_requested?: boolean
          id?: string
          negotiation_id?: string | null
          owner_id?: string
          payment_frequency?: string
          pickup_location?: string | null
          region?: string
          return_confirmed_at?: string | null
          return_inspection_notes?: string | null
          return_location?: string | null
          return_reminder_sent?: boolean
          security_deposit_amount?: number | null
          security_deposit_currency?: string | null
          security_deposit_released_at?: string | null
          security_deposit_status?: string
          start_date?: string
          status?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rentals_negotiation_id_fkey"
            columns: ["negotiation_id"]
            isOneToOne: false
            referencedRelation: "price_negotiations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rentals_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      rideshare_profile_submissions: {
        Row: {
          admin_notes: string | null
          admin_reviewed_at: string | null
          admin_reviewed_by: string | null
          created_at: string
          current_rating: number | null
          driver_id: string
          id: string
          platform: string | null
          profile_photo_url: string | null
          rating_screenshot_url: string | null
          status: string | null
          submitted_at: string | null
          updated_at: string
          vehicle_id: string | null
          week_start_date: string
        }
        Insert: {
          admin_notes?: string | null
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          created_at?: string
          current_rating?: number | null
          driver_id: string
          id?: string
          platform?: string | null
          profile_photo_url?: string | null
          rating_screenshot_url?: string | null
          status?: string | null
          submitted_at?: string | null
          updated_at?: string
          vehicle_id?: string | null
          week_start_date: string
        }
        Update: {
          admin_notes?: string | null
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          created_at?: string
          current_rating?: number | null
          driver_id?: string
          id?: string
          platform?: string | null
          profile_photo_url?: string | null
          rating_screenshot_url?: string | null
          status?: string | null
          submitted_at?: string | null
          updated_at?: string
          vehicle_id?: string | null
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "rideshare_profile_submissions_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      roadside_partners: {
        Row: {
          coverage_area: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string
          rating: number | null
          region: string
          response_time_minutes: number | null
          service_type: string
          updated_at: string
        }
        Insert: {
          coverage_area: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone: string
          rating?: number | null
          region?: string
          response_time_minutes?: number | null
          service_type: string
          updated_at?: string
        }
        Update: {
          coverage_area?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string
          rating?: number | null
          region?: string
          response_time_minutes?: number | null
          service_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          new_role: Database["public"]["Enums"]["app_role"] | null
          notes: string | null
          old_role: Database["public"]["Enums"]["app_role"] | null
          target_user_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_role?: Database["public"]["Enums"]["app_role"] | null
          notes?: string | null
          old_role?: Database["public"]["Enums"]["app_role"] | null
          target_user_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_role?: Database["public"]["Enums"]["app_role"] | null
          notes?: string | null
          old_role?: Database["public"]["Enums"]["app_role"] | null
          target_user_id?: string
        }
        Relationships: []
      }
      security_deposit_settings: {
        Row: {
          amount: number
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          region: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency: string
          description?: string | null
          id?: string
          is_active?: boolean
          region: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          region?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      settlement_reconciliation_results: {
        Row: {
          amount: number | null
          created_at: string
          currency: string | null
          id: string
          issues: Json
          ok: boolean
          payment_id: string
          provider: string | null
          provider_reference: string | null
          purpose: string | null
          repaired: Json
          run_id: string
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          id?: string
          issues?: Json
          ok?: boolean
          payment_id: string
          provider?: string | null
          provider_reference?: string | null
          purpose?: string | null
          repaired?: Json
          run_id: string
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          id?: string
          issues?: Json
          ok?: boolean
          payment_id?: string
          provider?: string | null
          provider_reference?: string | null
          purpose?: string | null
          repaired?: Json
          run_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settlement_reconciliation_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "settlement_reconciliation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_reconciliation_runs: {
        Row: {
          created_at: string
          duration_ms: number | null
          fatal_error: string | null
          finished_at: string | null
          id: string
          payment_id: string | null
          per_provider: Json
          since_hours: number | null
          started_at: string
          status: string
          total_checked: number
          total_failed: number
          total_ok: number
          total_repaired: number
          triggered_by: string
          triggered_by_user_id: string | null
          updated_at: string
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          fatal_error?: string | null
          finished_at?: string | null
          id?: string
          payment_id?: string | null
          per_provider?: Json
          since_hours?: number | null
          started_at?: string
          status?: string
          total_checked?: number
          total_failed?: number
          total_ok?: number
          total_repaired?: number
          triggered_by?: string
          triggered_by_user_id?: string | null
          updated_at?: string
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          fatal_error?: string | null
          finished_at?: string | null
          id?: string
          payment_id?: string | null
          per_provider?: Json
          since_hours?: number | null
          started_at?: string
          status?: string
          total_checked?: number
          total_failed?: number
          total_ok?: number
          total_repaired?: number
          triggered_by?: string
          triggered_by_user_id?: string | null
          updated_at?: string
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      sms_consent_records: {
        Row: {
          consent_type: string
          created_at: string
          disclosure_text: string
          disclosure_version: string
          granted: boolean
          id: string
          ip_address: string | null
          keywords_shown: Json
          page_url: string | null
          phone_number: string | null
          program_version: string | null
          source: string
          timing_shown: Json
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          consent_type: string
          created_at?: string
          disclosure_text: string
          disclosure_version: string
          granted: boolean
          id?: string
          ip_address?: string | null
          keywords_shown?: Json
          page_url?: string | null
          phone_number?: string | null
          program_version?: string | null
          source: string
          timing_shown?: Json
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          consent_type?: string
          created_at?: string
          disclosure_text?: string
          disclosure_version?: string
          granted?: boolean
          id?: string
          ip_address?: string | null
          keywords_shown?: Json
          page_url?: string | null
          phone_number?: string | null
          program_version?: string | null
          source?: string
          timing_shown?: Json
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      sms_dlq_retry_state: {
        Row: {
          attempts: number
          body: string | null
          channel: string
          created_at: string
          id: string
          last_error: string | null
          message_key: string
          next_attempt_at: string
          paused: boolean
          recipient_phone: string
          region: string | null
          resolved_at: string | null
          template_name: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          body?: string | null
          channel?: string
          created_at?: string
          id?: string
          last_error?: string | null
          message_key: string
          next_attempt_at?: string
          paused?: boolean
          recipient_phone: string
          region?: string | null
          resolved_at?: string | null
          template_name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          body?: string | null
          channel?: string
          created_at?: string
          id?: string
          last_error?: string | null
          message_key?: string
          next_attempt_at?: string
          paused?: boolean
          recipient_phone?: string
          region?: string | null
          resolved_at?: string | null
          template_name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      social_media_campaigns: {
        Row: {
          budget: number | null
          campaign_type: string
          content_text: string | null
          created_at: string
          created_by: string
          currency: string
          description: string | null
          end_date: string | null
          external_campaign_id: string | null
          id: string
          media_urls: string[] | null
          metrics: Json | null
          name: string
          platform: string
          region: string
          start_date: string | null
          status: string
          target_audience: Json | null
          updated_at: string
        }
        Insert: {
          budget?: number | null
          campaign_type: string
          content_text?: string | null
          created_at?: string
          created_by: string
          currency?: string
          description?: string | null
          end_date?: string | null
          external_campaign_id?: string | null
          id?: string
          media_urls?: string[] | null
          metrics?: Json | null
          name: string
          platform: string
          region?: string
          start_date?: string | null
          status?: string
          target_audience?: Json | null
          updated_at?: string
        }
        Update: {
          budget?: number | null
          campaign_type?: string
          content_text?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          description?: string | null
          end_date?: string | null
          external_campaign_id?: string | null
          id?: string
          media_urls?: string[] | null
          metrics?: Json | null
          name?: string
          platform?: string
          region?: string
          start_date?: string | null
          status?: string
          target_audience?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      social_media_posts: {
        Row: {
          campaign_id: string | null
          content: string
          created_at: string
          created_by: string
          engagement_metrics: Json | null
          external_post_id: string | null
          id: string
          media_urls: string[] | null
          platform: string
          published_at: string | null
          scheduled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          content: string
          created_at?: string
          created_by: string
          engagement_metrics?: Json | null
          external_post_id?: string | null
          id?: string
          media_urls?: string[] | null
          platform: string
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          content?: string
          created_at?: string
          created_by?: string
          engagement_metrics?: Json | null
          external_post_id?: string | null
          id?: string
          media_urls?: string[] | null
          platform?: string
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_media_posts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "social_media_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      social_messaging_configs: {
        Row: {
          api_status: string
          app_id: string | null
          created_at: string
          display_name: string
          id: string
          is_enabled: boolean
          last_connected_at: string | null
          metadata: Json | null
          page_id: string | null
          platform: string
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          api_status?: string
          app_id?: string | null
          created_at?: string
          display_name: string
          id?: string
          is_enabled?: boolean
          last_connected_at?: string | null
          metadata?: Json | null
          page_id?: string | null
          platform: string
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          api_status?: string
          app_id?: string | null
          created_at?: string
          display_name?: string
          id?: string
          is_enabled?: boolean
          last_connected_at?: string | null
          metadata?: Json | null
          page_id?: string | null
          platform?: string
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          billing_interval: string
          created_at: string
          currency: string
          description: string | null
          eligible_roles: string[]
          id: string
          is_active: boolean
          name: string
          plan_type: string
          price: number
          region: string
          updated_at: string
        }
        Insert: {
          billing_interval?: string
          created_at?: string
          currency?: string
          description?: string | null
          eligible_roles?: string[]
          id?: string
          is_active?: boolean
          name: string
          plan_type: string
          price: number
          region: string
          updated_at?: string
        }
        Update: {
          billing_interval?: string
          created_at?: string
          currency?: string
          description?: string | null
          eligible_roles?: string[]
          id?: string
          is_active?: boolean
          name?: string
          plan_type?: string
          price?: number
          region?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_staff: {
        Row: {
          assigned_city: string
          assigned_region: string
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          phone: string | null
          support_type: Database["public"]["Enums"]["support_task_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_city: string
          assigned_region?: string
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          support_type: Database["public"]["Enums"]["support_task_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_city?: string
          assigned_region?: string
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          support_type?: Database["public"]["Enums"]["support_task_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      support_task_updates: {
        Row: {
          attachments: Json | null
          content: string
          created_at: string
          id: string
          new_status: string | null
          previous_status: string | null
          task_id: string
          update_type: string
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          content: string
          created_at?: string
          id?: string
          new_status?: string | null
          previous_status?: string | null
          task_id: string
          update_type: string
          user_id: string
        }
        Update: {
          attachments?: Json | null
          content?: string
          created_at?: string
          id?: string
          new_status?: string | null
          previous_status?: string | null
          task_id?: string
          update_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_task_updates_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "support_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tasks: {
        Row: {
          agreement_id: string | null
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          city: string
          created_at: string
          description: string | null
          device_id: string | null
          driver_id: string | null
          estimated_duration_hours: number | null
          id: string
          insurance_status:
            | Database["public"]["Enums"]["insurance_task_status"]
            | null
          iot_status: Database["public"]["Enums"]["iot_task_status"] | null
          legal_status: Database["public"]["Enums"]["legal_task_status"] | null
          location_address: string | null
          location_lat: number | null
          location_lng: number | null
          owner_id: string | null
          priority: string
          recall_id: string | null
          region: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          staff_feedback: string | null
          staff_resolved_at: string | null
          staff_resolved_by: string | null
          task_type: Database["public"]["Enums"]["support_task_type"]
          title: string
          updated_at: string
          vehicle_id: string | null
          vehicle_status:
            | Database["public"]["Enums"]["vehicle_task_status"]
            | null
          verification_notes: string | null
          verification_state: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          agreement_id?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          city: string
          created_at?: string
          description?: string | null
          device_id?: string | null
          driver_id?: string | null
          estimated_duration_hours?: number | null
          id?: string
          insurance_status?:
            | Database["public"]["Enums"]["insurance_task_status"]
            | null
          iot_status?: Database["public"]["Enums"]["iot_task_status"] | null
          legal_status?: Database["public"]["Enums"]["legal_task_status"] | null
          location_address?: string | null
          location_lat?: number | null
          location_lng?: number | null
          owner_id?: string | null
          priority?: string
          recall_id?: string | null
          region?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          staff_feedback?: string | null
          staff_resolved_at?: string | null
          staff_resolved_by?: string | null
          task_type: Database["public"]["Enums"]["support_task_type"]
          title: string
          updated_at?: string
          vehicle_id?: string | null
          vehicle_status?:
            | Database["public"]["Enums"]["vehicle_task_status"]
            | null
          verification_notes?: string | null
          verification_state?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          agreement_id?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          city?: string
          created_at?: string
          description?: string | null
          device_id?: string | null
          driver_id?: string | null
          estimated_duration_hours?: number | null
          id?: string
          insurance_status?:
            | Database["public"]["Enums"]["insurance_task_status"]
            | null
          iot_status?: Database["public"]["Enums"]["iot_task_status"] | null
          legal_status?: Database["public"]["Enums"]["legal_task_status"] | null
          location_address?: string | null
          location_lat?: number | null
          location_lng?: number | null
          owner_id?: string | null
          priority?: string
          recall_id?: string | null
          region?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          staff_feedback?: string | null
          staff_resolved_at?: string | null
          staff_resolved_by?: string | null
          task_type?: Database["public"]["Enums"]["support_task_type"]
          title?: string
          updated_at?: string
          vehicle_id?: string | null
          vehicle_status?:
            | Database["public"]["Enums"]["vehicle_task_status"]
            | null
          verification_notes?: string | null
          verification_state?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tasks_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "legal_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "support_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tasks_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "iot_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tasks_recall_id_fkey"
            columns: ["recall_id"]
            isOneToOne: false
            referencedRelation: "vehicle_recalls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tasks_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tax_entities: {
        Row: {
          country_code: string
          created_at: string
          entity_name: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          id: string
          is_active: boolean
          is_primary: boolean
          jurisdiction_code: string
          notes: string | null
          role: string
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          country_code: string
          created_at?: string
          entity_name: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          id?: string
          is_active?: boolean
          is_primary?: boolean
          jurisdiction_code: string
          notes?: string | null
          role?: string
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          country_code?: string
          created_at?: string
          entity_name?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          id?: string
          is_active?: boolean
          is_primary?: boolean
          jurisdiction_code?: string
          notes?: string | null
          role?: string
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tax_line_items: {
        Row: {
          created_at: string
          currency: string
          exemption_reason: string | null
          id: string
          is_exempt: boolean
          jurisdiction_code: string
          payment_id: string | null
          rental_id: string | null
          tax_amount: number
          tax_rate: number
          tax_rule_id: string | null
          tax_type: Database["public"]["Enums"]["tax_type"]
          taxable_amount: number
        }
        Insert: {
          created_at?: string
          currency: string
          exemption_reason?: string | null
          id?: string
          is_exempt?: boolean
          jurisdiction_code: string
          payment_id?: string | null
          rental_id?: string | null
          tax_amount: number
          tax_rate: number
          tax_rule_id?: string | null
          tax_type: Database["public"]["Enums"]["tax_type"]
          taxable_amount: number
        }
        Update: {
          created_at?: string
          currency?: string
          exemption_reason?: string | null
          id?: string
          is_exempt?: boolean
          jurisdiction_code?: string
          payment_id?: string | null
          rental_id?: string | null
          tax_amount?: number
          tax_rate?: number
          tax_rule_id?: string | null
          tax_type?: Database["public"]["Enums"]["tax_type"]
          taxable_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_line_items_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "billing_reconciliation_view"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "tax_line_items_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_line_items_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_line_items_tax_rule_id_fkey"
            columns: ["tax_rule_id"]
            isOneToOne: false
            referencedRelation: "tax_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_nexus_tracking: {
        Row: {
          created_at: string
          cumulative_revenue: number
          cumulative_transactions: number
          currency: string
          id: string
          jurisdiction_code: string
          jurisdiction_name: string
          nexus_triggered: boolean
          nexus_triggered_at: string | null
          period_month: number
          period_year: number
          threshold_revenue: number | null
          threshold_transactions: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cumulative_revenue?: number
          cumulative_transactions?: number
          currency?: string
          id?: string
          jurisdiction_code: string
          jurisdiction_name: string
          nexus_triggered?: boolean
          nexus_triggered_at?: string | null
          period_month: number
          period_year: number
          threshold_revenue?: number | null
          threshold_transactions?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cumulative_revenue?: number
          cumulative_transactions?: number
          currency?: string
          id?: string
          jurisdiction_code?: string
          jurisdiction_name?: string
          nexus_triggered?: boolean
          nexus_triggered_at?: string | null
          period_month?: number
          period_year?: number
          threshold_revenue?: number | null
          threshold_transactions?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      tax_reporting_periods: {
        Row: {
          created_at: string
          currency: string
          entity_id: string | null
          exempt_revenue: number
          filed_at: string | null
          gross_revenue: number
          id: string
          jurisdiction_code: string
          period_quarter: number
          period_year: number
          status: string
          tax_collected: number
          tax_owed: number
          tax_remitted: number
          tax_type: Database["public"]["Enums"]["tax_type"]
          taxable_revenue: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency: string
          entity_id?: string | null
          exempt_revenue?: number
          filed_at?: string | null
          gross_revenue?: number
          id?: string
          jurisdiction_code: string
          period_quarter: number
          period_year: number
          status?: string
          tax_collected?: number
          tax_owed?: number
          tax_remitted?: number
          tax_type: Database["public"]["Enums"]["tax_type"]
          taxable_revenue?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          entity_id?: string | null
          exempt_revenue?: number
          filed_at?: string | null
          gross_revenue?: number
          id?: string
          jurisdiction_code?: string
          period_quarter?: number
          period_year?: number
          status?: string
          tax_collected?: number
          tax_owed?: number
          tax_remitted?: number
          tax_type?: Database["public"]["Enums"]["tax_type"]
          taxable_revenue?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_reporting_periods_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "tax_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rules: {
        Row: {
          applies_to: string
          created_at: string
          effective_from: string
          effective_to: string | null
          exemption_reason: string | null
          id: string
          is_active: boolean
          is_exempt: boolean
          jurisdiction_code: string
          jurisdiction_level: Database["public"]["Enums"]["tax_jurisdiction_level"]
          jurisdiction_name: string
          notes: string | null
          rate_percent: number
          tax_type: Database["public"]["Enums"]["tax_type"]
          threshold_amount: number | null
          threshold_currency: string | null
          threshold_transactions: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          applies_to?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          exemption_reason?: string | null
          id?: string
          is_active?: boolean
          is_exempt?: boolean
          jurisdiction_code: string
          jurisdiction_level: Database["public"]["Enums"]["tax_jurisdiction_level"]
          jurisdiction_name: string
          notes?: string | null
          rate_percent?: number
          tax_type: Database["public"]["Enums"]["tax_type"]
          threshold_amount?: number | null
          threshold_currency?: string | null
          threshold_transactions?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          applies_to?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          exemption_reason?: string | null
          id?: string
          is_active?: boolean
          is_exempt?: boolean
          jurisdiction_code?: string
          jurisdiction_level?: Database["public"]["Enums"]["tax_jurisdiction_level"]
          jurisdiction_name?: string
          notes?: string | null
          rate_percent?: number
          tax_type?: Database["public"]["Enums"]["tax_type"]
          threshold_amount?: number | null
          threshold_currency?: string | null
          threshold_transactions?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      telemetry_ingest_runs: {
        Row: {
          analytics_emitted: number
          broker_reachable: boolean
          created_at: string
          deduped: number | null
          degraded_reason: string | null
          devices_seen: number
          duration_ms: number | null
          error: string | null
          events_processed: number
          gps_disabled: number | null
          id: string
          passes: number | null
          provider: string | null
          source: string
          unmapped: number | null
        }
        Insert: {
          analytics_emitted?: number
          broker_reachable?: boolean
          created_at?: string
          deduped?: number | null
          degraded_reason?: string | null
          devices_seen?: number
          duration_ms?: number | null
          error?: string | null
          events_processed?: number
          gps_disabled?: number | null
          id?: string
          passes?: number | null
          provider?: string | null
          source: string
          unmapped?: number | null
        }
        Update: {
          analytics_emitted?: number
          broker_reachable?: boolean
          created_at?: string
          deduped?: number | null
          degraded_reason?: string | null
          devices_seen?: number
          duration_ms?: number | null
          error?: string | null
          events_processed?: number
          gps_disabled?: number | null
          id?: string
          passes?: number | null
          provider?: string | null
          source?: string
          unmapped?: number | null
        }
        Relationships: []
      }
      telemetry_providers: {
        Row: {
          api_key_secret_name: string | null
          base_url: string | null
          config: Json
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          name: string
          priority: number
          region_scope: string
          updated_at: string
        }
        Insert: {
          api_key_secret_name?: string | null
          base_url?: string | null
          config?: Json
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          name: string
          priority?: number
          region_scope?: string
          updated_at?: string
        }
        Update: {
          api_key_secret_name?: string | null
          base_url?: string | null
          config?: Json
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          name?: string
          priority?: number
          region_scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      telemetry_shadow_log: {
        Row: {
          created_at: string
          device_id: string | null
          divergence_score: number | null
          id: string
          notes: string | null
          primary_lat: number | null
          primary_lng: number | null
          primary_online: boolean | null
          primary_provider: string
          shadow_lat: number | null
          shadow_lng: number | null
          shadow_online: boolean | null
          shadow_provider: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          divergence_score?: number | null
          id?: string
          notes?: string | null
          primary_lat?: number | null
          primary_lng?: number | null
          primary_online?: boolean | null
          primary_provider: string
          shadow_lat?: number | null
          shadow_lng?: number | null
          shadow_online?: boolean | null
          shadow_provider: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string | null
          divergence_score?: number | null
          id?: string
          notes?: string | null
          primary_lat?: number | null
          primary_lng?: number | null
          primary_online?: boolean | null
          primary_provider?: string
          shadow_lat?: number | null
          shadow_lng?: number | null
          shadow_online?: boolean | null
          shadow_provider?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_shadow_log_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_analytics_events: {
        Row: {
          country: string
          created_at: string
          event_type: string
          extra: Json | null
          id: string
          step_id: string | null
          step_index: number | null
          total_steps: number | null
          tour_name: string
          user_id: string | null
        }
        Insert: {
          country: string
          created_at?: string
          event_type: string
          extra?: Json | null
          id?: string
          step_id?: string | null
          step_index?: number | null
          total_steps?: number | null
          tour_name: string
          user_id?: string | null
        }
        Update: {
          country?: string
          created_at?: string
          event_type?: string
          extra?: Json | null
          id?: string
          step_id?: string | null
          step_index?: number | null
          total_steps?: number | null
          tour_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      tour_step_config_audit: {
        Row: {
          action: string
          actor_id: string | null
          changed_at: string
          config_id: string | null
          country: string
          id: string
          new_is_active: boolean | null
          new_steps: Json | null
          previous_is_active: boolean | null
          previous_steps: Json | null
          tour_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          changed_at?: string
          config_id?: string | null
          country: string
          id?: string
          new_is_active?: boolean | null
          new_steps?: Json | null
          previous_is_active?: boolean | null
          previous_steps?: Json | null
          tour_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          changed_at?: string
          config_id?: string | null
          country?: string
          id?: string
          new_is_active?: boolean | null
          new_steps?: Json | null
          previous_is_active?: boolean | null
          previous_steps?: Json | null
          tour_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_step_config_audit_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "tour_step_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_step_configs: {
        Row: {
          country: string
          created_at: string
          id: string
          is_active: boolean
          steps: Json
          tour_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          country: string
          created_at?: string
          id?: string
          is_active?: boolean
          steps?: Json
          tour_name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          country?: string
          created_at?: string
          id?: string
          is_active?: boolean
          steps?: Json
          tour_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      training_completions: {
        Row: {
          completed_at: string
          id: string
          module_id: string
          review_notes: string | null
          score: number | null
          user_id: string
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          completed_at?: string
          id?: string
          module_id: string
          review_notes?: string | null
          score?: number | null
          user_id: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          completed_at?: string
          id?: string
          module_id?: string
          review_notes?: string | null
          score?: number | null
          user_id?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_completions_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "training_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      training_modules: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          is_active: boolean
          module_order: number
          region: string
          script_content: string | null
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean
          module_order?: number
          region?: string
          script_content?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean
          module_order?: number
          region?: string
          script_content?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      training_refresh_requirements: {
        Row: {
          created_at: string
          id: string
          last_completed_at: string | null
          next_due_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_completed_at?: string | null
          next_due_at: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_completed_at?: string | null
          next_due_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      twilio_message_templates: {
        Row: {
          body: string
          channel: string
          country_code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          language: string
          name: string
          placeholders: string[]
          template_key: string
          twilio_content_sid: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          channel?: string
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          language?: string
          name: string
          placeholders?: string[]
          template_key: string
          twilio_content_sid?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          channel?: string
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          language?: string
          name?: string
          placeholders?: string[]
          template_key?: string
          twilio_content_sid?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      two_factor_audit_log: {
        Row: {
          action: string
          channel: string | null
          created_at: string
          failure_reason: string | null
          id: string
          ip_address: string | null
          phone_number: string | null
          success: boolean
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          channel?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          phone_number?: string | null
          success?: boolean
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          channel?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          phone_number?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      two_factor_settings: {
        Row: {
          created_at: string
          enabled_at: string | null
          id: string
          is_enabled: boolean
          is_mandatory: boolean
          phone_number: string | null
          preferred_channel: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled_at?: string | null
          id?: string
          is_enabled?: boolean
          is_mandatory?: boolean
          phone_number?: string | null
          preferred_channel?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled_at?: string | null
          id?: string
          is_enabled?: boolean
          is_mandatory?: boolean
          phone_number?: string | null
          preferred_channel?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      unified_message_log: {
        Row: {
          conversation_id: string | null
          created_at: string
          delivery_status: string
          direction: string
          error_message: string | null
          event_count: number | null
          forwarded_at: string | null
          forwarded_message_id: string | null
          forwarded_to: string | null
          id: string
          interactive_reply: boolean | null
          is_negotiation: boolean | null
          language: string | null
          last_event_at: string | null
          last_event_type: string | null
          message_body: string
          message_type: string
          metadata: Json | null
          priority: string | null
          provider: string
          provider_message_id: string | null
          region: string
          response_time_ms: number | null
          retry_count: number
          template_name: string | null
          updated_at: string
          user_id: string | null
          user_name: string | null
          user_phone: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          delivery_status?: string
          direction: string
          error_message?: string | null
          event_count?: number | null
          forwarded_at?: string | null
          forwarded_message_id?: string | null
          forwarded_to?: string | null
          id?: string
          interactive_reply?: boolean | null
          is_negotiation?: boolean | null
          language?: string | null
          last_event_at?: string | null
          last_event_type?: string | null
          message_body: string
          message_type?: string
          metadata?: Json | null
          priority?: string | null
          provider: string
          provider_message_id?: string | null
          region: string
          response_time_ms?: number | null
          retry_count?: number
          template_name?: string | null
          updated_at?: string
          user_id?: string | null
          user_name?: string | null
          user_phone?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          delivery_status?: string
          direction?: string
          error_message?: string | null
          event_count?: number | null
          forwarded_at?: string | null
          forwarded_message_id?: string | null
          forwarded_to?: string | null
          id?: string
          interactive_reply?: boolean | null
          is_negotiation?: boolean | null
          language?: string | null
          last_event_at?: string | null
          last_event_type?: string | null
          message_body?: string
          message_type?: string
          metadata?: Json | null
          priority?: string | null
          provider?: string
          provider_message_id?: string | null
          region?: string
          response_time_ms?: number | null
          retry_count?: number
          template_name?: string | null
          updated_at?: string
          user_id?: string | null
          user_name?: string | null
          user_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unified_message_log_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "inbox_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_documents: {
        Row: {
          created_at: string
          document_category: string
          document_type: string
          expires_at: string | null
          expiry_date: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          rejection_reason: string | null
          status: string
          updated_at: string
          user_id: string
          vehicle_id: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          document_category: string
          document_type: string
          expires_at?: string | null
          expiry_date?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          document_category?: string
          document_type?: string
          expires_at?: string | null
          expiry_date?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_documents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          auto_renew: boolean
          created_at: string
          expires_at: string
          id: string
          payment_method: string | null
          payment_reference: string | null
          plan_id: string
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_renew?: boolean
          created_at?: string
          expires_at: string
          id?: string
          payment_method?: string | null
          payment_reference?: string | null
          plan_id: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_renew?: boolean
          created_at?: string
          expires_at?: string
          id?: string
          payment_method?: string | null
          payment_reference?: string | null
          plan_id?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_uuid_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          metadata: Json | null
          public_uuid: string
          role: string | null
          source: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          metadata?: Json | null
          public_uuid: string
          role?: string | null
          source?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          metadata?: Json | null
          public_uuid?: string
          role?: string | null
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      vehicle_analytics_events: {
        Row: {
          category: string
          created_at: string
          event_type: string
          id: string
          payload: Json
          severity: string
          source: string
          vehicle_id: string
        }
        Insert: {
          category: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          severity?: string
          source?: string
          vehicle_id: string
        }
        Update: {
          category?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          severity?: string
          source?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_analytics_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          batch_id: string | null
          changed_fields: string[]
          created_at: string
          id: string
          new_values: Json
          old_values: Json
          owner_id: string | null
          review_notes: string | null
          vehicle_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          batch_id?: string | null
          changed_fields?: string[]
          created_at?: string
          id?: string
          new_values?: Json
          old_values?: Json
          owner_id?: string | null
          review_notes?: string | null
          vehicle_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          batch_id?: string | null
          changed_fields?: string[]
          created_at?: string
          id?: string
          new_values?: Json
          old_values?: Json
          owner_id?: string | null
          review_notes?: string | null
          vehicle_id?: string
        }
        Relationships: []
      }
      vehicle_booking_requests: {
        Row: {
          created_at: string
          driver_id: string
          driver_message: string | null
          end_date: string
          id: string
          offer_currency: string | null
          offer_expires_at: string | null
          offer_note: string | null
          offer_sent_at: string | null
          offer_sent_by: string | null
          offered_rate: number | null
          region: string | null
          responded_at: string | null
          review_note: string | null
          reviewed_by: string | null
          start_date: string
          status: Database["public"]["Enums"]["booking_request_status"]
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          driver_message?: string | null
          end_date: string
          id?: string
          offer_currency?: string | null
          offer_expires_at?: string | null
          offer_note?: string | null
          offer_sent_at?: string | null
          offer_sent_by?: string | null
          offered_rate?: number | null
          region?: string | null
          responded_at?: string | null
          review_note?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["booking_request_status"]
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          driver_message?: string | null
          end_date?: string
          id?: string
          offer_currency?: string | null
          offer_expires_at?: string | null
          offer_note?: string | null
          offer_sent_at?: string | null
          offer_sent_by?: string | null
          offered_rate?: number | null
          region?: string | null
          responded_at?: string | null
          review_note?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["booking_request_status"]
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_booking_requests_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_catalogue_listings: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          make: string | null
          model: string | null
          photo_urls: string[] | null
          pickup_city: string | null
          pickup_location: string | null
          status: string | null
          year: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id: string
          make?: string | null
          model?: string | null
          photo_urls?: string[] | null
          pickup_city?: string | null
          pickup_location?: string | null
          status?: string | null
          year?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          make?: string | null
          model?: string | null
          photo_urls?: string[] | null
          pickup_city?: string | null
          pickup_location?: string | null
          status?: string | null
          year?: number | null
        }
        Relationships: []
      }
      vehicle_category_prices: {
        Row: {
          category: string
          created_at: string
          currency: string
          id: string
          min_price: number | null
          price: number
          region: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          currency?: string
          id?: string
          min_price?: number | null
          price: number
          region: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          currency?: string
          id?: string
          min_price?: number | null
          price?: number
          region?: string
          updated_at?: string
        }
        Relationships: []
      }
      vehicle_category_year_specs: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          label: string
          max_year: number
          min_year: number
          region: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label: string
          max_year: number
          min_year: number
          region: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label?: string
          max_year?: number
          min_year?: number
          region?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      vehicle_geofences: {
        Row: {
          active: boolean
          breached_at: string | null
          call_in_id: string
          center_lat: number
          center_lng: number
          created_at: string
          created_by: string | null
          id: string
          last_checked_at: string | null
          last_distance_m: number | null
          name: string | null
          radius_m: number
          updated_at: string
          updated_by: string | null
          vehicle_id: string
        }
        Insert: {
          active?: boolean
          breached_at?: string | null
          call_in_id: string
          center_lat: number
          center_lng: number
          created_at?: string
          created_by?: string | null
          id?: string
          last_checked_at?: string | null
          last_distance_m?: number | null
          name?: string | null
          radius_m?: number
          updated_at?: string
          updated_by?: string | null
          vehicle_id: string
        }
        Update: {
          active?: boolean
          breached_at?: string | null
          call_in_id?: string
          center_lat?: number
          center_lng?: number
          created_at?: string
          created_by?: string | null
          id?: string
          last_checked_at?: string | null
          last_distance_m?: number | null
          name?: string | null
          radius_m?: number
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_geofences_call_in_id_fkey"
            columns: ["call_in_id"]
            isOneToOne: false
            referencedRelation: "driver_call_ins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_geofences_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_import_items: {
        Row: {
          application_id: string
          color: string | null
          created_at: string
          existing_vehicle_id: string | null
          id: string
          license_plate: string | null
          make: string | null
          model: string | null
          normalized_plate: string | null
          outcome: string
          owner_id: string | null
          resolution: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          run_id: string | null
          skip_reason: string | null
          updated_at: string
          vehicle_id: string | null
          year: number | null
        }
        Insert: {
          application_id: string
          color?: string | null
          created_at?: string
          existing_vehicle_id?: string | null
          id?: string
          license_plate?: string | null
          make?: string | null
          model?: string | null
          normalized_plate?: string | null
          outcome: string
          owner_id?: string | null
          resolution?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          run_id?: string | null
          skip_reason?: string | null
          updated_at?: string
          vehicle_id?: string | null
          year?: number | null
        }
        Update: {
          application_id?: string
          color?: string | null
          created_at?: string
          existing_vehicle_id?: string | null
          id?: string
          license_plate?: string | null
          make?: string | null
          model?: string | null
          normalized_plate?: string | null
          outcome?: string
          owner_id?: string | null
          resolution?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          run_id?: string | null
          skip_reason?: string | null
          updated_at?: string
          vehicle_id?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_import_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "vehicle_import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_import_runs: {
        Row: {
          created_at: string
          error_count: number
          finished_at: string | null
          id: string
          imported_count: number
          scanned_count: number
          skipped_count: number
          source: string
          started_at: string
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          error_count?: number
          finished_at?: string | null
          id?: string
          imported_count?: number
          scanned_count?: number
          skipped_count?: number
          source?: string
          started_at?: string
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          error_count?: number
          finished_at?: string | null
          id?: string
          imported_count?: number
          scanned_count?: number
          skipped_count?: number
          source?: string
          started_at?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      vehicle_incidents: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          actual_downtime_hours: number | null
          created_at: string
          description: string
          driver_id: string
          estimated_downtime_hours: number | null
          id: string
          incident_type: Database["public"]["Enums"]["incident_type"]
          iot_data: Json | null
          iot_deceleration_g: number | null
          iot_impact_severity: string | null
          iot_speed_at_impact: number | null
          iot_trigger_type: string | null
          iot_triggered_at: string | null
          is_iot_detected: boolean
          is_late_report: boolean
          location_address: string | null
          location_lat: number | null
          location_lng: number | null
          occurred_at: string
          owner_id: string | null
          photos: string[] | null
          reported_at: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["incident_severity"]
          status: Database["public"]["Enums"]["incident_status"]
          title: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          actual_downtime_hours?: number | null
          created_at?: string
          description: string
          driver_id: string
          estimated_downtime_hours?: number | null
          id?: string
          incident_type: Database["public"]["Enums"]["incident_type"]
          iot_data?: Json | null
          iot_deceleration_g?: number | null
          iot_impact_severity?: string | null
          iot_speed_at_impact?: number | null
          iot_trigger_type?: string | null
          iot_triggered_at?: string | null
          is_iot_detected?: boolean
          is_late_report?: boolean
          location_address?: string | null
          location_lat?: number | null
          location_lng?: number | null
          occurred_at: string
          owner_id?: string | null
          photos?: string[] | null
          reported_at?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["incident_severity"]
          status?: Database["public"]["Enums"]["incident_status"]
          title: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          actual_downtime_hours?: number | null
          created_at?: string
          description?: string
          driver_id?: string
          estimated_downtime_hours?: number | null
          id?: string
          incident_type?: Database["public"]["Enums"]["incident_type"]
          iot_data?: Json | null
          iot_deceleration_g?: number | null
          iot_impact_severity?: string | null
          iot_speed_at_impact?: number | null
          iot_trigger_type?: string | null
          iot_triggered_at?: string | null
          is_iot_detected?: boolean
          is_late_report?: boolean
          location_address?: string | null
          location_lat?: number | null
          location_lng?: number | null
          occurred_at?: string
          owner_id?: string | null
          photos?: string[] | null
          reported_at?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["incident_severity"]
          status?: Database["public"]["Enums"]["incident_status"]
          title?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_incidents_vehicle_owner_fk"
            columns: ["vehicle_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      vehicle_mileage_logs: {
        Row: {
          created_at: string
          driver_id: string | null
          id: string
          log_date: string
          miles: number
          odometer_end: number | null
          odometer_start: number | null
          owner_id: string | null
          region: string | null
          source: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          driver_id?: string | null
          id?: string
          log_date?: string
          miles?: number
          odometer_end?: number | null
          odometer_start?: number | null
          owner_id?: string | null
          region?: string | null
          source?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          driver_id?: string | null
          id?: string
          log_date?: string
          miles?: number
          odometer_end?: number | null
          odometer_start?: number | null
          owner_id?: string | null
          region?: string | null
          source?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: []
      }
      vehicle_mqtt_credentials: {
        Row: {
          broker_port: number
          broker_url: string
          client_id: string
          created_at: string
          id: string
          installed_at: string | null
          installed_by: string | null
          iot_device_id: string | null
          is_active: boolean
          jwt_expires_at: string | null
          jwt_issued_at: string | null
          jwt_token: string | null
          last_connected_at: string | null
          mqtt_username: string
          notes: string | null
          password_hash: string
          password_hint: string | null
          publish_topics: string[]
          subscribe_topics: string[]
          tls_enabled: boolean
          topic_prefix: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          broker_port?: number
          broker_url?: string
          client_id: string
          created_at?: string
          id?: string
          installed_at?: string | null
          installed_by?: string | null
          iot_device_id?: string | null
          is_active?: boolean
          jwt_expires_at?: string | null
          jwt_issued_at?: string | null
          jwt_token?: string | null
          last_connected_at?: string | null
          mqtt_username: string
          notes?: string | null
          password_hash: string
          password_hint?: string | null
          publish_topics?: string[]
          subscribe_topics?: string[]
          tls_enabled?: boolean
          topic_prefix: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          broker_port?: number
          broker_url?: string
          client_id?: string
          created_at?: string
          id?: string
          installed_at?: string | null
          installed_by?: string | null
          iot_device_id?: string | null
          is_active?: boolean
          jwt_expires_at?: string | null
          jwt_issued_at?: string | null
          jwt_token?: string | null
          last_connected_at?: string | null
          mqtt_username?: string
          notes?: string | null
          password_hash?: string
          password_hint?: string | null
          publish_topics?: string[]
          subscribe_topics?: string[]
          tls_enabled?: boolean
          topic_prefix?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_mqtt_credentials_iot_device_id_fkey"
            columns: ["iot_device_id"]
            isOneToOne: false
            referencedRelation: "iot_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_recalls: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          admin_validated_at: string | null
          admin_validated_by: string | null
          admin_validation_status: string | null
          created_at: string
          driver_id: string | null
          driver_notified_at: string | null
          failed_capture_attempts: number | null
          id: string
          iot_failure_type: string | null
          last_known_location_address: string | null
          last_known_location_lat: number | null
          last_known_location_lng: number | null
          last_successful_ping: string | null
          last_telemetry_snapshot: Json | null
          owner_approval_status: string | null
          owner_approved_at: string | null
          owner_id: string | null
          owner_notified_at: string | null
          priority: string
          recall_reason: string
          recall_type: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          triggered_by_call_ins: string[] | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          admin_validated_at?: string | null
          admin_validated_by?: string | null
          admin_validation_status?: string | null
          created_at?: string
          driver_id?: string | null
          driver_notified_at?: string | null
          failed_capture_attempts?: number | null
          id?: string
          iot_failure_type?: string | null
          last_known_location_address?: string | null
          last_known_location_lat?: number | null
          last_known_location_lng?: number | null
          last_successful_ping?: string | null
          last_telemetry_snapshot?: Json | null
          owner_approval_status?: string | null
          owner_approved_at?: string | null
          owner_id?: string | null
          owner_notified_at?: string | null
          priority?: string
          recall_reason: string
          recall_type?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          triggered_by_call_ins?: string[] | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          admin_validated_at?: string | null
          admin_validated_by?: string | null
          admin_validation_status?: string | null
          created_at?: string
          driver_id?: string | null
          driver_notified_at?: string | null
          failed_capture_attempts?: number | null
          id?: string
          iot_failure_type?: string | null
          last_known_location_address?: string | null
          last_known_location_lat?: number | null
          last_known_location_lng?: number | null
          last_successful_ping?: string | null
          last_telemetry_snapshot?: Json | null
          owner_approval_status?: string | null
          owner_approved_at?: string | null
          owner_id?: string | null
          owner_notified_at?: string | null
          priority?: string
          recall_reason?: string
          recall_type?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          triggered_by_call_ins?: string[] | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_recalls_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_rental_authorizations: {
        Row: {
          audit_trail: Json
          authorization_text: string
          authorized_at: string
          cancellation_reason: string | null
          cancellation_token: string
          cancelled_at: string | null
          cancelled_by: string | null
          color: string | null
          created_at: string
          id: string
          ip_address: string | null
          license_plate: string | null
          matched_driver_id: string | null
          matched_driver_name: string | null
          matching_status: string
          owner_email: string | null
          owner_id: string
          owner_name: string | null
          owner_phone: string | null
          photo_urls: string[]
          pickup_city: string | null
          pickup_location: string | null
          status: string
          terms_version: string
          updated_at: string
          user_agent: string | null
          vehicle_id: string
          vehicle_make: string
          vehicle_model: string
          vehicle_year: number | null
          vin: string | null
        }
        Insert: {
          audit_trail?: Json
          authorization_text?: string
          authorized_at?: string
          cancellation_reason?: string | null
          cancellation_token: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          color?: string | null
          created_at?: string
          id: string
          ip_address?: string | null
          license_plate?: string | null
          matched_driver_id?: string | null
          matched_driver_name?: string | null
          matching_status?: string
          owner_email?: string | null
          owner_id: string
          owner_name?: string | null
          owner_phone?: string | null
          photo_urls?: string[]
          pickup_city?: string | null
          pickup_location?: string | null
          status?: string
          terms_version?: string
          updated_at?: string
          user_agent?: string | null
          vehicle_id: string
          vehicle_make?: string
          vehicle_model?: string
          vehicle_year?: number | null
          vin?: string | null
        }
        Update: {
          audit_trail?: Json
          authorization_text?: string
          authorized_at?: string
          cancellation_reason?: string | null
          cancellation_token?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          color?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          license_plate?: string | null
          matched_driver_id?: string | null
          matched_driver_name?: string | null
          matching_status?: string
          owner_email?: string | null
          owner_id?: string
          owner_name?: string | null
          owner_phone?: string | null
          photo_urls?: string[]
          pickup_city?: string | null
          pickup_location?: string | null
          status?: string
          terms_version?: string
          updated_at?: string
          user_agent?: string | null
          vehicle_id?: string
          vehicle_make?: string
          vehicle_model?: string
          vehicle_year?: number | null
          vin?: string | null
        }
        Relationships: []
      }
      vehicle_telemetry_state: {
        Row: {
          address: string | null
          altitude: number | null
          battery: number | null
          created_at: string
          fuel: number | null
          gps_timestamp: string | null
          heading: number | null
          ignition: boolean | null
          is_historic: boolean
          last_event_at: string | null
          last_event_type: string | null
          last_source: string | null
          latitude: number | null
          longitude: number | null
          payload: Json
          provider: string | null
          provider_device_id: string | null
          received_at: string | null
          speed: number | null
          temperature: number | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          address?: string | null
          altitude?: number | null
          battery?: number | null
          created_at?: string
          fuel?: number | null
          gps_timestamp?: string | null
          heading?: number | null
          ignition?: boolean | null
          is_historic?: boolean
          last_event_at?: string | null
          last_event_type?: string | null
          last_source?: string | null
          latitude?: number | null
          longitude?: number | null
          payload?: Json
          provider?: string | null
          provider_device_id?: string | null
          received_at?: string | null
          speed?: number | null
          temperature?: number | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          address?: string | null
          altitude?: number | null
          battery?: number | null
          created_at?: string
          fuel?: number | null
          gps_timestamp?: string | null
          heading?: number | null
          ignition?: boolean | null
          is_historic?: boolean
          last_event_at?: string | null
          last_event_type?: string | null
          last_source?: string | null
          latitude?: number | null
          longitude?: number | null
          payload?: Json
          provider?: string | null
          provider_device_id?: string | null
          received_at?: string | null
          speed?: number | null
          temperature?: number | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          color: string | null
          created_at: string | null
          gps_tracking_enabled: boolean
          id: string
          inspection_expiry: string | null
          insurance_expiry: string | null
          is_public: boolean
          license_plate: string
          make: string
          model: string
          owner_id: string
          photo_urls: string[]
          pickup_address: string | null
          pickup_city: string | null
          pickup_instructions: string | null
          pickup_location: string | null
          published_at: string | null
          registration_expiry: string | null
          review_notes: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          submitted_at: string
          updated_at: string | null
          vin: string | null
          year: number
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          gps_tracking_enabled?: boolean
          id?: string
          inspection_expiry?: string | null
          insurance_expiry?: string | null
          is_public?: boolean
          license_plate: string
          make: string
          model: string
          owner_id: string
          photo_urls?: string[]
          pickup_address?: string | null
          pickup_city?: string | null
          pickup_instructions?: string | null
          pickup_location?: string | null
          published_at?: string | null
          registration_expiry?: string | null
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          submitted_at?: string
          updated_at?: string | null
          vin?: string | null
          year: number
        }
        Update: {
          color?: string | null
          created_at?: string | null
          gps_tracking_enabled?: boolean
          id?: string
          inspection_expiry?: string | null
          insurance_expiry?: string | null
          is_public?: boolean
          license_plate?: string
          make?: string
          model?: string
          owner_id?: string
          photo_urls?: string[]
          pickup_address?: string | null
          pickup_city?: string | null
          pickup_instructions?: string | null
          pickup_location?: string | null
          published_at?: string | null
          registration_expiry?: string | null
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          submitted_at?: string
          updated_at?: string | null
          vin?: string | null
          year?: number
        }
        Relationships: []
      }
      verification_event_log: {
        Row: {
          context: Json
          correlation_id: string
          created_at: string
          failure_code: string | null
          failure_domain: string | null
          id: string
          message: string | null
          outcome: string
          provider: string | null
          retryable: boolean | null
          stage: string
          step: string
          user_id: string | null
        }
        Insert: {
          context?: Json
          correlation_id: string
          created_at?: string
          failure_code?: string | null
          failure_domain?: string | null
          id?: string
          message?: string | null
          outcome: string
          provider?: string | null
          retryable?: boolean | null
          stage: string
          step: string
          user_id?: string | null
        }
        Update: {
          context?: Json
          correlation_id?: string
          created_at?: string
          failure_code?: string | null
          failure_domain?: string | null
          id?: string
          message?: string | null
          outcome?: string
          provider?: string | null
          retryable?: boolean | null
          stage?: string
          step?: string
          user_id?: string | null
        }
        Relationships: []
      }
      voice_call_permissions: {
        Row: {
          caller_role: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          receiver_role: string
          requires_rental_link: boolean
          updated_at: string
        }
        Insert: {
          caller_role: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          receiver_role: string
          requires_rental_link?: boolean
          updated_at?: string
        }
        Update: {
          caller_role?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          receiver_role?: string
          requires_rental_link?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      voice_call_requests: {
        Row: {
          assigned_to: string | null
          call_id: string | null
          created_at: string
          id: string
          reason: string | null
          region: string
          requester_id: string
          requester_role: string
          resolved_at: string | null
          status: string
          target_id: string | null
          target_role: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          call_id?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          region?: string
          requester_id: string
          requester_role: string
          resolved_at?: string | null
          status?: string
          target_id?: string | null
          target_role: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          call_id?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          region?: string
          requester_id?: string
          requester_role?: string
          resolved_at?: string | null
          status?: string
          target_id?: string | null
          target_role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_call_requests_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "voip_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      voicemail_logs: {
        Row: {
          call_sid: string | null
          callback_queue: string | null
          created_at: string
          id: string
          personalized_message: string | null
          region: string | null
          script_type: string
          sms_followup_sent: boolean | null
          sms_link_sent: boolean | null
          updated_at: string
          user_id: string
          voicemail_detected: boolean | null
        }
        Insert: {
          call_sid?: string | null
          callback_queue?: string | null
          created_at?: string
          id?: string
          personalized_message?: string | null
          region?: string | null
          script_type: string
          sms_followup_sent?: boolean | null
          sms_link_sent?: boolean | null
          updated_at?: string
          user_id: string
          voicemail_detected?: boolean | null
        }
        Update: {
          call_sid?: string | null
          callback_queue?: string | null
          created_at?: string
          id?: string
          personalized_message?: string | null
          region?: string | null
          script_type?: string
          sms_followup_sent?: boolean | null
          sms_link_sent?: boolean | null
          updated_at?: string
          user_id?: string
          voicemail_detected?: boolean | null
        }
        Relationships: []
      }
      voip_call_groups: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          region: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          region: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          region?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voip_call_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      voip_call_participants: {
        Row: {
          call_id: string
          created_at: string
          display_name: string | null
          id: string
          joined_at: string | null
          left_at: string | null
          participant_type: string
          phone_number: string
          region: string
          status: string
          user_id: string | null
        }
        Insert: {
          call_id: string
          created_at?: string
          display_name?: string | null
          id?: string
          joined_at?: string | null
          left_at?: string | null
          participant_type: string
          phone_number: string
          region: string
          status?: string
          user_id?: string | null
        }
        Update: {
          call_id?: string
          created_at?: string
          display_name?: string | null
          id?: string
          joined_at?: string | null
          left_at?: string | null
          participant_type?: string
          phone_number?: string
          region?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voip_call_participants_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "voip_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voip_call_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      voip_call_requests: {
        Row: {
          admin_notes: string | null
          callback_scheduled_at: string | null
          called_back_at: string | null
          called_back_by: string | null
          created_at: string
          id: string
          phone_number: string
          priority: string
          reason: string | null
          region: string
          status: string
          updated_at: string
          user_id: string
          user_type: string
        }
        Insert: {
          admin_notes?: string | null
          callback_scheduled_at?: string | null
          called_back_at?: string | null
          called_back_by?: string | null
          created_at?: string
          id?: string
          phone_number: string
          priority?: string
          reason?: string | null
          region: string
          status?: string
          updated_at?: string
          user_id: string
          user_type: string
        }
        Update: {
          admin_notes?: string | null
          callback_scheduled_at?: string | null
          called_back_at?: string | null
          called_back_by?: string | null
          created_at?: string
          id?: string
          phone_number?: string
          priority?: string
          reason?: string | null
          region?: string
          status?: string
          updated_at?: string
          user_id?: string
          user_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "voip_call_requests_called_back_by_fkey"
            columns: ["called_back_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "voip_call_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      voip_call_transcripts: {
        Row: {
          audio_bytes: number | null
          audio_storage_path: string | null
          call_id: string
          created_at: string
          created_by: string | null
          duration_ms: number | null
          id: string
          language_code: string | null
          segment_ended_at: string | null
          segment_index: number
          segment_started_at: string | null
          source: string
          speaker: string | null
          transcript_text: string
          words: Json | null
        }
        Insert: {
          audio_bytes?: number | null
          audio_storage_path?: string | null
          call_id: string
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          id?: string
          language_code?: string | null
          segment_ended_at?: string | null
          segment_index?: number
          segment_started_at?: string | null
          source?: string
          speaker?: string | null
          transcript_text: string
          words?: Json | null
        }
        Update: {
          audio_bytes?: number | null
          audio_storage_path?: string | null
          call_id?: string
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          id?: string
          language_code?: string | null
          segment_ended_at?: string | null
          segment_index?: number
          segment_started_at?: string | null
          source?: string
          speaker?: string | null
          transcript_text?: string
          words?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "voip_call_transcripts_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "voip_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      voip_calls: {
        Row: {
          call_sid: string | null
          call_type: string
          caller_role: string | null
          created_at: string
          direction: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          initiated_by: string | null
          receiver_id: string | null
          receiver_role: string | null
          recording_duration_seconds: number | null
          recording_size_bytes: number | null
          recording_status: string | null
          recording_stored_at: string | null
          recording_url: string | null
          region: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          call_sid?: string | null
          call_type: string
          caller_role?: string | null
          created_at?: string
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          initiated_by?: string | null
          receiver_id?: string | null
          receiver_role?: string | null
          recording_duration_seconds?: number | null
          recording_size_bytes?: number | null
          recording_status?: string | null
          recording_stored_at?: string | null
          recording_url?: string | null
          region: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          call_sid?: string | null
          call_type?: string
          caller_role?: string | null
          created_at?: string
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          initiated_by?: string | null
          receiver_id?: string | null
          receiver_role?: string | null
          recording_duration_seconds?: number | null
          recording_size_bytes?: number | null
          recording_status?: string | null
          recording_stored_at?: string | null
          recording_url?: string | null
          region?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voip_calls_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      voip_group_members: {
        Row: {
          added_at: string
          display_name: string | null
          group_id: string
          id: string
          is_active: boolean
          phone_number: string
          region: string
          user_id: string | null
        }
        Insert: {
          added_at?: string
          display_name?: string | null
          group_id: string
          id?: string
          is_active?: boolean
          phone_number: string
          region: string
          user_id?: string | null
        }
        Update: {
          added_at?: string
          display_name?: string | null
          group_id?: string
          id?: string
          is_active?: boolean
          phone_number?: string
          region?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voip_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "voip_call_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voip_group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      voip_settings: {
        Row: {
          created_at: string
          description: string | null
          feature_key: string
          id: string
          is_enabled: boolean
          region: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          feature_key: string
          id?: string
          is_enabled?: boolean
          region?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          feature_key?: string
          id?: string
          is_enabled?: boolean
          region?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voip_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      wallet_accounts: {
        Row: {
          account_type: string
          available_balance: number
          created_at: string
          currency: string
          id: string
          lifetime_credits: number
          lifetime_debits: number
          pending_balance: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type: string
          available_balance?: number
          created_at?: string
          currency: string
          id?: string
          lifetime_credits?: number
          lifetime_debits?: number
          pending_balance?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: string
          available_balance?: number
          created_at?: string
          currency?: string
          id?: string
          lifetime_credits?: number
          lifetime_debits?: number
          pending_balance?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_ledger_entries: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          direction: string
          entry_type: string
          id: string
          idempotency_key: string | null
          metadata: Json
          provider: string | null
          provider_reference: string | null
          reference_id: string | null
          reference_table: string | null
          status: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          created_by?: string | null
          currency: string
          description?: string | null
          direction: string
          entry_type: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          provider?: string | null
          provider_reference?: string | null
          reference_id?: string | null
          reference_table?: string | null
          status?: string
          user_id: string
          wallet_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          direction?: string
          entry_type?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          provider?: string | null
          provider_reference?: string | null
          reference_id?: string | null
          reference_table?: string | null
          status?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_ledger_entries_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallet_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempt_number: number
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          event_type: string
          id: string
          payload: Json
          response_body: string | null
          response_headers: Json | null
          response_status: number | null
          status: string
          webhook_id: string
        }
        Insert: {
          attempt_number?: number
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          event_type: string
          id?: string
          payload: Json
          response_body?: string | null
          response_headers?: Json | null
          response_status?: number | null
          status?: string
          webhook_id: string
        }
        Update: {
          attempt_number?: number
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json
          response_body?: string | null
          response_headers?: Json | null
          response_status?: number | null
          status?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          events: string[]
          failure_count: number
          headers: Json | null
          id: string
          is_active: boolean
          last_triggered_at: string | null
          name: string
          retry_count: number
          secret: string | null
          success_count: number
          timeout_seconds: number
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          events?: string[]
          failure_count?: number
          headers?: Json | null
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name: string
          retry_count?: number
          secret?: string | null
          success_count?: number
          timeout_seconds?: number
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          events?: string[]
          failure_count?: number
          headers?: Json | null
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name?: string
          retry_count?: number
          secret?: string | null
          success_count?: number
          timeout_seconds?: number
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      weekly_inspection_reports: {
        Row: {
          admin_decision: string | null
          admin_id: string | null
          admin_notes: string | null
          admin_reviewed_at: string | null
          created_at: string | null
          driver_accepted_withdrawal: boolean | null
          driver_id: string
          driver_responded_at: string | null
          id: string
          owner_action: string | null
          owner_id: string | null
          owner_notes: string | null
          owner_reviewed_at: string | null
          photo_back_left_tyre: string | null
          photo_back_right_tyre: string | null
          photo_back_view: string | null
          photo_dashboard: string | null
          photo_driver_side: string | null
          photo_front_left_tyre: string | null
          photo_front_right_tyre: string | null
          photo_front_view: string | null
          photo_interior: string | null
          photo_passenger_side: string | null
          photo_rideshare_profile: string | null
          photo_timestamps: Json | null
          region: string | null
          report_frequency: string | null
          report_type: string | null
          status: string | null
          submitted_at: string | null
          updated_at: string | null
          vehicle_id: string
          week_start_date: string
        }
        Insert: {
          admin_decision?: string | null
          admin_id?: string | null
          admin_notes?: string | null
          admin_reviewed_at?: string | null
          created_at?: string | null
          driver_accepted_withdrawal?: boolean | null
          driver_id: string
          driver_responded_at?: string | null
          id?: string
          owner_action?: string | null
          owner_id?: string | null
          owner_notes?: string | null
          owner_reviewed_at?: string | null
          photo_back_left_tyre?: string | null
          photo_back_right_tyre?: string | null
          photo_back_view?: string | null
          photo_dashboard?: string | null
          photo_driver_side?: string | null
          photo_front_left_tyre?: string | null
          photo_front_right_tyre?: string | null
          photo_front_view?: string | null
          photo_interior?: string | null
          photo_passenger_side?: string | null
          photo_rideshare_profile?: string | null
          photo_timestamps?: Json | null
          region?: string | null
          report_frequency?: string | null
          report_type?: string | null
          status?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          vehicle_id: string
          week_start_date: string
        }
        Update: {
          admin_decision?: string | null
          admin_id?: string | null
          admin_notes?: string | null
          admin_reviewed_at?: string | null
          created_at?: string | null
          driver_accepted_withdrawal?: boolean | null
          driver_id?: string
          driver_responded_at?: string | null
          id?: string
          owner_action?: string | null
          owner_id?: string | null
          owner_notes?: string | null
          owner_reviewed_at?: string | null
          photo_back_left_tyre?: string | null
          photo_back_right_tyre?: string | null
          photo_back_view?: string | null
          photo_dashboard?: string | null
          photo_driver_side?: string | null
          photo_front_left_tyre?: string | null
          photo_front_right_tyre?: string | null
          photo_front_view?: string | null
          photo_interior?: string | null
          photo_passenger_side?: string | null
          photo_rideshare_profile?: string | null
          photo_timestamps?: Json | null
          region?: string | null
          report_frequency?: string | null
          report_type?: string | null
          status?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          vehicle_id?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_inspection_reports_vehicle_owner_fk"
            columns: ["vehicle_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      weekly_report_settings: {
        Row: {
          feature_enabled: boolean | null
          grace_period_hours: number | null
          id: string
          report_due_day: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          feature_enabled?: boolean | null
          grace_period_hours?: number | null
          id?: string
          report_due_day?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          feature_enabled?: boolean | null
          grace_period_hours?: number | null
          id?: string
          report_due_day?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      whatsapp_interactive_flows: {
        Row: {
          completed: boolean | null
          created_at: string
          current_step: number | null
          data: Json | null
          flow_id: string | null
          flow_type: string
          id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          completed?: boolean | null
          created_at?: string
          current_step?: number | null
          data?: Json | null
          flow_id?: string | null
          flow_type: string
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          completed?: boolean | null
          created_at?: string
          current_step?: number | null
          data?: Json | null
          flow_id?: string | null
          flow_type?: string
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      whatsapp_message_delivery: {
        Row: {
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          message_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          message_id?: string | null
          status: string
        }
        Update: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          message_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_message_delivery_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["message_id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          content: string | null
          created_at: string
          direction: string
          id: string
          language: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          metadata: Json | null
          status: string | null
          template_name: string | null
          user_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          direction: string
          id?: string
          language?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type: string
          metadata?: Json | null
          status?: string | null
          template_name?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          direction?: string
          id?: string
          language?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          metadata?: Json | null
          status?: string | null
          template_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      whatsapp_sessions: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          last_activity: string | null
          session_data: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_activity?: string | null
          session_data?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_activity?: string | null
          session_data?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      whatsapp_template_usage: {
        Row: {
          created_at: string
          id: string
          language: string | null
          status: string | null
          template_name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          language?: string | null
          status?: string | null
          template_name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          language?: string | null
          status?: string | null
          template_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      withdrawal_authorizations: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          consumed_at: string | null
          consumed_reference: string | null
          created_at: string
          currency: string
          decision_reason: string | null
          destination_ref: string | null
          device_fingerprint: string | null
          expires_at: string
          id: string
          ip_address: string | null
          metadata: Json
          request_type: string
          requested_by: string
          requires_dual_auth: boolean
          risk_flags: string[]
          risk_score: number
          status: string
          subject_user_id: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          consumed_at?: string | null
          consumed_reference?: string | null
          created_at?: string
          currency: string
          decision_reason?: string | null
          destination_ref?: string | null
          device_fingerprint?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          request_type: string
          requested_by: string
          requires_dual_auth?: boolean
          risk_flags?: string[]
          risk_score?: number
          status?: string
          subject_user_id: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          consumed_at?: string | null
          consumed_reference?: string | null
          created_at?: string
          currency?: string
          decision_reason?: string | null
          destination_ref?: string | null
          device_fingerprint?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          request_type?: string
          requested_by?: string
          requires_dual_auth?: boolean
          risk_flags?: string[]
          risk_score?: number
          status?: string
          subject_user_id?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      billing_reconciliation_view: {
        Row: {
          created_at: string | null
          currency: string | null
          discrepancy: string | null
          driver_id: string | null
          invoice_id: string | null
          invoice_number: string | null
          invoice_paid_at: string | null
          invoice_status: string | null
          payment_amount: number | null
          payment_id: string | null
          payment_status: string | null
          processed_at: string | null
          receipt_id: string | null
          receipt_number: string | null
          receipt_status: string | null
          rental_id: string | null
          transaction_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
        ]
      }
      device_identity_status: {
        Row: {
          bundle_level: number | null
          created_at: string | null
          driver_id: string | null
          id: string | null
          last_synced_at: string | null
          owner_id: string | null
          rental_id: string | null
          status: string | null
          telemetry_provider: string | null
          updated_at: string | null
          vehicle_id: string | null
          verified_at: string | null
        }
        Insert: {
          bundle_level?: number | null
          created_at?: string | null
          driver_id?: string | null
          id?: string | null
          last_synced_at?: string | null
          owner_id?: string | null
          rental_id?: string | null
          status?: string | null
          telemetry_provider?: string | null
          updated_at?: string | null
          vehicle_id?: string | null
          verified_at?: string | null
        }
        Update: {
          bundle_level?: number | null
          created_at?: string | null
          driver_id?: string | null
          id?: string | null
          last_synced_at?: string | null
          owner_id?: string | null
          rental_id?: string | null
          status?: string | null
          telemetry_provider?: string | null
          updated_at?: string | null
          vehicle_id?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_identities_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_identities_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      latest_application_pipeline_status: {
        Row: {
          actor_id: string | null
          application_id: string | null
          created_at: string | null
          details: Json | null
          event_type: string | null
          message: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_pipeline_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      public_vehicle_listings: {
        Row: {
          color: string | null
          created_at: string | null
          id: string | null
          make: string | null
          model: string | null
          photo_urls: string[] | null
          pickup_city: string | null
          pickup_location: string | null
          status: string | null
          year: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string | null
          make?: string | null
          model?: string | null
          photo_urls?: string[] | null
          pickup_city?: string | null
          pickup_location?: string | null
          status?: string | null
          year?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string | null
          make?: string | null
          model?: string | null
          photo_urls?: string[] | null
          pickup_city?: string | null
          pickup_location?: string | null
          status?: string | null
          year?: number | null
        }
        Relationships: []
      }
      vehicle_mileage_monthly: {
        Row: {
          days_logged: number | null
          driver_id: string | null
          last_log_date: string | null
          miles: number | null
          month: string | null
          vehicle_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _match_broadcast: {
        Args: {
          _driver_body: string
          _match: Database["public"]["Tables"]["driver_vehicle_matches"]["Row"]
          _owner_body: string
          _stage: string
          _subject: string
          _task_description: string
          _task_title: string
        }
        Returns: undefined
      }
      _testkit_run_trigger_guard_tests: {
        Args: { _confirm: string }
        Returns: string
      }
      activate_user_subscription: {
        Args: {
          _payment_method: string
          _payment_reference: string
          _plan_id: string
          _user_id: string
        }
        Returns: string
      }
      admin_accredit_match: { Args: { _match_id: string }; Returns: Json }
      admin_assign_driver_to_vehicle: {
        Args: {
          _distance_miles?: number
          _driver_id: string
          _notes?: string
          _vehicle_id: string
        }
        Returns: string
      }
      admin_cancel_match: {
        Args: { _match_id: string; _reason?: string }
        Returns: undefined
      }
      admin_cancel_subscription: {
        Args: { _reason?: string; _subscription_id: string }
        Returns: {
          cancelled_id: string
          cascaded_ids: string[]
        }[]
      }
      admin_create_staff_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      admin_delete_elevenlabs_test_log: {
        Args: { _log_id: string }
        Returns: undefined
      }
      admin_generate_next_rental_invoice: {
        Args: { _period_end: string; _period_start: string; _rental_id: string }
        Returns: Json
      }
      admin_initiate_match_agreement: {
        Args: { _agreement_id?: string; _match_id: string }
        Returns: undefined
      }
      admin_list_disputes: {
        Args: { _limit?: number; _status?: string }
        Returns: Json
      }
      admin_list_owner_withdrawals: {
        Args: { _limit?: number; _status?: string }
        Returns: {
          amount: number
          authorization_status: string
          created_at: string
          currency: string
          failure_reason: string
          gross_earnings: number
          initiated_by: string
          ledger_amount: number
          ledger_entries: number
          ledger_posted_amount: number
          owner_balance: number
          owner_email: string
          owner_id: string
          owner_name: string
          payout_id: string
          processed_at: string
          provider: string
          reconciliation: Json
          requires_dual_auth: boolean
          risk_flags: string[]
          risk_score: number
          status: string
          transfer_reference: string
        }[]
      }
      admin_list_pending_training_completions: {
        Args: { _status?: string }
        Returns: {
          completed_at: string
          email: string
          full_name: string
          id: string
          module_id: string
          module_region: string
          module_title: string
          phone: string
          review_notes: string
          score: number
          user_id: string
          verification_status: string
          verified_at: string
        }[]
      }
      admin_list_withdrawal_authorizations: {
        Args: { _limit?: number; _status?: string }
        Returns: Json
      }
      admin_mark_match_agreement_signed: {
        Args: { _match_id: string }
        Returns: undefined
      }
      admin_mark_match_picked_up: {
        Args: { _match_id: string }
        Returns: undefined
      }
      admin_provider_billing_summary: {
        Args: { _end?: string; _start?: string }
        Returns: Json
      }
      admin_provision_rental_from_negotiation: {
        Args: {
          _end_date: string
          _negotiation_id: string
          _payment_frequency?: string
          _pickup_location?: string
          _return_location?: string
          _start_date: string
        }
        Returns: Json
      }
      admin_reconcile_payment_ledger: {
        Args: { _owner_share_pct?: number; _payment_id: string }
        Returns: Json
      }
      admin_release_security_deposit: {
        Args: { _reason?: string; _rental_id: string }
        Returns: Json
      }
      admin_resolve_dispute: {
        Args: {
          _dispute_id: string
          _notes?: string
          _override_state?: string
          _resolution: string
        }
        Returns: Json
      }
      admin_review_booking_request: {
        Args: { _note?: string; _request_id: string; _status: string }
        Returns: undefined
      }
      admin_review_persona_inquiry: {
        Args: { _action: string; _inquiry_row_id: string; _notes?: string }
        Returns: Json
      }
      admin_review_proxy_billing: {
        Args: { _decision: string; _notes?: string; _proxy_id: string }
        Returns: {
          activated_at: string | null
          admin_review_notes: string | null
          admin_review_status: string
          admin_reviewed_at: string | null
          admin_reviewed_by: string | null
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_fingerprint: string | null
          card_last4: string | null
          card_provider: string | null
          card_token: string | null
          consent_channels: string[] | null
          consent_ip: string | null
          consent_pdf_url: string | null
          consent_sent_at: string | null
          consent_signature: string | null
          consent_signed_at: string | null
          consent_status: string
          consent_token: string
          consent_token_expires_at: string
          consent_user_agent: string | null
          created_at: string
          driver_id: string
          expired_at: string | null
          id: string
          identity_status: string
          identity_verified_at: string | null
          max_uses: number | null
          notification_prefs: Json
          persona_inquiry_id: string | null
          proxy_email: string
          proxy_full_name: string
          proxy_phone: string | null
          proxy_relationship: string | null
          region: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          updated_at: string
          use_type: string
          uses_count: number
          validity_expires_at: string | null
          validity_starts_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "driver_proxy_billing_accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_review_training_completion: {
        Args: { _approve: boolean; _completion_id: string; _notes?: string }
        Returns: Json
      }
      admin_review_vehicle: {
        Args: { _decision: string; _reason?: string; _vehicle_id: string }
        Returns: {
          color: string | null
          created_at: string | null
          gps_tracking_enabled: boolean
          id: string
          inspection_expiry: string | null
          insurance_expiry: string | null
          is_public: boolean
          license_plate: string
          make: string
          model: string
          owner_id: string
          photo_urls: string[]
          pickup_address: string | null
          pickup_city: string | null
          pickup_instructions: string | null
          pickup_location: string | null
          published_at: string | null
          registration_expiry: string | null
          review_notes: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          submitted_at: string
          updated_at: string | null
          vin: string | null
          year: number
        }
        SetofOptions: {
          from: "*"
          to: "vehicles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_review_vehicles_bulk: {
        Args: {
          _batch_id?: string
          _decision: string
          _reasons?: Json
          _vehicle_ids: string[]
        }
        Returns: Json
      }
      admin_revoke_proxy_billing: {
        Args: { _proxy_id: string; _reason: string }
        Returns: {
          activated_at: string | null
          admin_review_notes: string | null
          admin_review_status: string
          admin_reviewed_at: string | null
          admin_reviewed_by: string | null
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_fingerprint: string | null
          card_last4: string | null
          card_provider: string | null
          card_token: string | null
          consent_channels: string[] | null
          consent_ip: string | null
          consent_pdf_url: string | null
          consent_sent_at: string | null
          consent_signature: string | null
          consent_signed_at: string | null
          consent_status: string
          consent_token: string
          consent_token_expires_at: string
          consent_user_agent: string | null
          created_at: string
          driver_id: string
          expired_at: string | null
          id: string
          identity_status: string
          identity_verified_at: string | null
          max_uses: number | null
          notification_prefs: Json
          persona_inquiry_id: string | null
          proxy_email: string
          proxy_full_name: string
          proxy_phone: string | null
          proxy_relationship: string | null
          region: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          updated_at: string
          use_type: string
          uses_count: number
          validity_expires_at: string | null
          validity_starts_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "driver_proxy_billing_accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_scan_ledger_mismatches: {
        Args: { _limit?: number; _owner_share_pct?: number; _since?: string }
        Returns: Json
      }
      admin_scan_settlement_integrity: {
        Args: { _limit?: number; _since?: string }
        Returns: {
          amount: number
          currency: string
          payment_id: string
          purpose: string
          report: Json
          settled_at: string
          user_id: string
        }[]
      }
      admin_search_persona_users: {
        Args: { _limit?: number; _query?: string; _status?: string }
        Returns: {
          email: string
          full_name: string
          identity_verification_status: string
          identity_verified_at: string
          latest_inquiry_id: string
          latest_inquiry_row_id: string
          latest_inquiry_status: string
          latest_inquiry_updated_at: string
          latest_mismatch_fields: Json
          latest_region: string
          user_id: string
        }[]
      }
      admin_send_booking_offer: {
        Args: {
          _currency: string
          _expires_at?: string
          _note?: string
          _offered_rate: number
          _request_id: string
        }
        Returns: undefined
      }
      admin_update_elevenlabs_retention: {
        Args: { _audio_days: number; _transcript_days: number }
        Returns: {
          audio_retention_days: number
          id: string
          transcript_retention_days: number
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "elevenlabs_retention_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_verify_support_task: {
        Args: { _approve: boolean; _notes?: string; _task_id: string }
        Returns: undefined
      }
      advance_registration_stage: {
        Args: {
          _target: Database["public"]["Enums"]["registration_stage_enum"]
        }
        Returns: Database["public"]["Enums"]["registration_stage_enum"]
      }
      approve_application: {
        Args: { _app_id: string; _notes?: string }
        Returns: string
      }
      assistant_can_access_user: { Args: { _target: string }; Returns: boolean }
      can_delete_user_account: {
        Args: { _target_user_id: string }
        Returns: boolean
      }
      can_review_applications: { Args: never; Returns: boolean }
      cancel_authorization_by_token: {
        Args: { p_by_name?: string; p_reason?: string; p_token: string }
        Returns: Json
      }
      check_auth_rate_limit: {
        Args: {
          _endpoint: string
          _identifier: string
          _max_requests?: number
          _window_seconds?: number
        }
        Returns: boolean
      }
      check_unique_credentials: {
        Args: { p_email: string; p_phone: string; p_username: string }
        Returns: boolean
      }
      check_vehicle_booking_availability: {
        Args: { _end: string; _start: string; _vehicle_id: string }
        Returns: Json
      }
      claim_idempotency_key: {
        Args: {
          _key: string
          _request_hash?: string
          _scope: string
          _user_id?: string
        }
        Returns: Json
      }
      classify_onboarding_error: { Args: { _msg: string }; Returns: string }
      complete_idempotency_key: {
        Args: { _key: string; _response?: Json; _status: string }
        Returns: undefined
      }
      complete_onboarding: { Args: never; Returns: string }
      complete_training_module: {
        Args: { _module_id: string; _score?: number }
        Returns: string
      }
      consume_proxy_charge: {
        Args: { _proxy_id: string }
        Returns: {
          card_token: string
          ok: boolean
          provider: string
          reason: string
        }[]
      }
      consume_withdrawal_authorization: {
        Args: { _id: string; _reference?: string }
        Returns: Json
      }
      decide_withdrawal_authorization: {
        Args: { _decision: string; _id: string; _reason?: string }
        Returns: Json
      }
      decline_application_recovery: {
        Args: { _notes?: string; _request_id: string }
        Returns: undefined
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      driver_accreditation_status: {
        Args: { _driver_id: string }
        Returns: Json
      }
      driver_request_rental_extension: {
        Args: { _rental_id: string }
        Returns: {
          created_at: string
          currency: string
          daily_rate: number
          driver_id: string
          end_date: string
          extended_end_date: string | null
          extension_approved: boolean | null
          extension_requested: boolean
          id: string
          negotiation_id: string | null
          owner_id: string
          payment_frequency: string
          pickup_location: string | null
          region: string
          return_confirmed_at: string | null
          return_inspection_notes: string | null
          return_location: string | null
          return_reminder_sent: boolean
          security_deposit_amount: number | null
          security_deposit_currency: string | null
          security_deposit_released_at: string | null
          security_deposit_status: string
          start_date: string
          status: string
          updated_at: string
          vehicle_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rentals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      driver_respond_to_booking_offer: {
        Args: { _accept: boolean; _request_id: string }
        Returns: undefined
      }
      driver_update_proxy_terms: {
        Args: {
          _max_uses: number
          _proxy_id: string
          _use_type: string
          _validity_expires_at: string
          _validity_starts_at: string
        }
        Returns: {
          activated_at: string | null
          admin_review_notes: string | null
          admin_review_status: string
          admin_reviewed_at: string | null
          admin_reviewed_by: string | null
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_fingerprint: string | null
          card_last4: string | null
          card_provider: string | null
          card_token: string | null
          consent_channels: string[] | null
          consent_ip: string | null
          consent_pdf_url: string | null
          consent_sent_at: string | null
          consent_signature: string | null
          consent_signed_at: string | null
          consent_status: string
          consent_token: string
          consent_token_expires_at: string
          consent_user_agent: string | null
          created_at: string
          driver_id: string
          expired_at: string | null
          id: string
          identity_status: string
          identity_verified_at: string | null
          max_uses: number | null
          notification_prefs: Json
          persona_inquiry_id: string | null
          proxy_email: string
          proxy_full_name: string
          proxy_phone: string | null
          proxy_relationship: string | null
          region: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          updated_at: string
          use_type: string
          uses_count: number
          validity_expires_at: string | null
          validity_starts_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "driver_proxy_billing_accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      driver_withdraw_booking_request: {
        Args: { _request_id: string }
        Returns: undefined
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      email_queue_stats: { Args: never; Returns: Json }
      email_signup_status: { Args: { _email: string }; Returns: Json }
      emit_owner_vehicle_notification: {
        Args: {
          _body: string
          _kind: string
          _owner: string
          _payload: Json
          _title: string
          _vehicle_id: string
        }
        Returns: undefined
      }
      emqx_activate_credentials: {
        Args: { _version_id: string }
        Returns: Json
      }
      emqx_read_credentials: {
        Args: { _version_id?: string }
        Returns: {
          api_key: string
          api_secret: string
          id: string
          status: string
        }[]
      }
      emqx_record_verification: {
        Args: { _ok: boolean; _result: Json; _version_id: string }
        Returns: undefined
      }
      emqx_rollback_credentials: { Args: never; Returns: Json }
      emqx_stage_credentials: {
        Args: { _api_key: string; _api_secret: string; _notes?: string }
        Returns: string
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_wallet_account: {
        Args: { _account_type: string; _currency: string; _user_id: string }
        Returns: string
      }
      evaluate_withdrawal_risk: {
        Args: {
          _amount: number
          _currency: string
          _device_fingerprint?: string
          _request_type?: string
          _user_id: string
        }
        Returns: Json
      }
      event_deep_link: {
        Args: { _recipient: string; _record_id: string; _table: string }
        Returns: string
      }
      get_allowed_regions: {
        Args: never
        Returns: {
          built_in: boolean
          country_code: string
          currency: string
          currency_symbol: string
          flag: string
          label: string
          phone_prefix: string
          value: string
        }[]
      }
      get_authorization_by_token: { Args: { p_token: string }; Returns: Json }
      get_ledger_balance: {
        Args: {
          _account_type: string
          _currency: string
          _include_pending?: boolean
          _user_id: string
        }
        Returns: number
      }
      get_linked_user_ids: {
        Args: { _user_id: string }
        Returns: {
          linked_user_id: string
        }[]
      }
      get_my_activation_blockers: { Args: never; Returns: Json }
      get_my_cookie_consent: { Args: never; Returns: Json }
      get_my_identity_verification: { Args: never; Returns: Json }
      get_my_messaging_preferences: {
        Args: never
        Returns: {
          channel: string
          opted_out: boolean
          phone: string
          updated_at: string
        }[]
      }
      get_my_pickup_details: { Args: never; Returns: Json }
      get_my_registration_progress: { Args: never; Returns: Json }
      get_my_role_change_status: { Args: never; Returns: Json }
      get_my_training_status: { Args: never; Returns: Json }
      get_my_wallet_summary: { Args: { _currency?: string }; Returns: Json }
      get_onboarding_next_step: { Args: never; Returns: Json }
      get_owner_available_balance: {
        Args: { _currency: string; _owner_id: string }
        Returns: number
      }
      get_profile_completion_status: { Args: never; Returns: Json }
      get_proxy_consent_context: {
        Args: { _token: string }
        Returns: {
          consent_status: string
          driver_name: string
          identity_status: string
          notification_prefs: Json
          proxy_account_id: string
          proxy_full_name: string
          proxy_phone: string
          region: string
          token_expires_at: string
        }[]
      }
      get_reply_placeholder_values: {
        Args: { _conversation_id: string }
        Returns: Json
      }
      get_support_staff_city: {
        Args: {
          _type: Database["public"]["Enums"]["support_task_type"]
          _user_id: string
        }
        Returns: string
      }
      get_verification_trace: {
        Args: { p_correlation_id: string }
        Returns: {
          context: Json
          correlation_id: string
          created_at: string
          failure_code: string | null
          failure_domain: string | null
          id: string
          message: string | null
          outcome: string
          provider: string | null
          retryable: boolean | null
          stage: string
          step: string
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "verification_event_log"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      grant_full_access: { Args: { _user_id: string }; Returns: undefined }
      has_active_subscription: {
        Args: { _plan_type: string; _region?: string; _user_id: string }
        Returns: boolean
      }
      has_admin_assistant_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_admin_privilege: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_full_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin:
        | { Args: never; Returns: boolean }
        | { Args: { _user_id: string }; Returns: boolean }
      is_allowed_region: { Args: { _country: string }; Returns: boolean }
      is_any_support_staff: { Args: { _user_id: string }; Returns: boolean }
      is_messaging_opted_out: {
        Args: { _channel?: string; _phone: string }
        Returns: boolean
      }
      is_support_staff: {
        Args: {
          _type: Database["public"]["Enums"]["support_task_type"]
          _user_id: string
        }
        Returns: boolean
      }
      is_valid_e164: { Args: { p: string }; Returns: boolean }
      is_valid_payment_transition: {
        Args: { _entity: string; _from: string; _to: string }
        Returns: boolean
      }
      log_admin_action: {
        Args: {
          _action: string
          _details?: Json
          _target_id?: string
          _target_table?: string
        }
        Returns: string
      }
      log_auth_event: {
        Args: {
          _email?: string
          _error_code?: string
          _event_type: string
          _metadata?: Json
          _provider?: string
          _success?: boolean
        }
        Returns: undefined
      }
      log_permission_denied: {
        Args: {
          _fields?: string[]
          _reason: string
          _table: string
          _target_id: string
          _values?: Json
        }
        Returns: undefined
      }
      log_registration_event: {
        Args: {
          _application_id?: string
          _application_type?: string
          _email?: string
          _event_type: string
          _metadata?: Json
        }
        Returns: undefined
      }
      log_verification_event: {
        Args: {
          p_context?: Json
          p_correlation_id: string
          p_failure_code?: string
          p_failure_domain?: string
          p_message?: string
          p_outcome: string
          p_provider?: string
          p_retryable?: boolean
          p_stage: string
          p_step: string
        }
        Returns: string
      }
      mark_all_admin_notifications_read: { Args: never; Returns: number }
      mark_in_app_messages_read: { Args: { _ids: string[] }; Returns: number }
      mask_secret_value: { Args: { _v: string }; Returns: string }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      my_application_appeals: {
        Args: never
        Returns: {
          application_id: string
          application_status: string
          application_type: string
          created_at: string
          documents: Json
          id: string
          reason: string
          rejection_reason: string
          resolution_notes: string
          reviewed_at: string
          status: string
        }[]
      }
      needs_latest_agreement_acceptance: {
        Args: { _agreement_type: string; _region: string }
        Returns: {
          accepted_template_id: string
          latest_template_id: string
          needs: boolean
        }[]
      }
      no_pending_application_for_email: {
        Args: { _email: string }
        Returns: boolean
      }
      normalize_country_label: { Args: { _v: string }; Returns: string }
      normalize_msisdn: { Args: { _phone: string }; Returns: string }
      notification_category_for: { Args: { _kind: string }; Returns: string }
      notification_is_otp_like: {
        Args: { _body: string; _kind: string; _title: string }
        Returns: boolean
      }
      notify_settlement_invoice_failure: {
        Args: { _payment_id: string; _reason: string }
        Returns: undefined
      }
      onboarding_diagnostics: { Args: never; Returns: Json }
      owner_resubmit_vehicle_for_review: {
        Args: { p_vehicle_id: string }
        Returns: Json
      }
      owns_vehicle_text: { Args: { _vehicle_id: string }; Returns: boolean }
      payment_preflight: {
        Args: { _context?: Json; _operation: string }
        Returns: Json
      }
      post_wallet_entry: {
        Args: {
          _account_type: string
          _amount: number
          _currency: string
          _description?: string
          _direction: string
          _entry_type: string
          _idempotency_key?: string
          _metadata?: Json
          _provider?: string
          _provider_reference?: string
          _reference_id?: string
          _reference_table?: string
          _status?: string
          _user_id: string
        }
        Returns: Json
      }
      profile_insert_fields_safe: {
        Args: { _new: Database["public"]["Tables"]["profiles"]["Row"] }
        Returns: boolean
      }
      profile_privileged_fields_unchanged: {
        Args: { _new: Database["public"]["Tables"]["profiles"]["Row"] }
        Returns: boolean
      }
      provider_read_credentials: { Args: { _provider: string }; Returns: Json }
      provider_revoke_credentials: {
        Args: { _notes?: string; _provider: string }
        Returns: number
      }
      provider_write_credentials: {
        Args: { _notes?: string; _provider: string; _values: Json }
        Returns: string
      }
      provision_user_account: {
        Args: {
          _email?: string
          _role?: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      purge_expired_elevenlabs_test_logs: {
        Args: never
        Returns: {
          audio_deleted: number
          logs_deleted: number
        }[]
      }
      purge_user_account: { Args: { _target_user_id: string }; Returns: Json }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      rebuild_all_device_identities: { Args: never; Returns: number }
      reconcile_owner_payout: { Args: { _payout_id: string }; Returns: Json }
      record_onboarding_rpc_event: {
        Args: {
          _details?: Json
          _error_message?: string
          _rpc_name: string
          _status: string
          _user_id: string
        }
        Returns: undefined
      }
      record_payment_dispute: {
        Args: {
          _amount?: number
          _correlation_id?: string
          _currency?: string
          _payment_id: string
          _provider: string
          _provider_reference?: string
          _reason?: string
        }
        Returns: string
      }
      record_vehicle_mileage: {
        Args: {
          _driver_id: string
          _log_date?: string
          _miles: number
          _source?: string
          _vehicle_id: string
        }
        Returns: string
      }
      recover_application: {
        Args: { _app_id: string; _notes?: string }
        Returns: undefined
      }
      recycle_application: {
        Args: { _app_id: string; _notes?: string }
        Returns: string
      }
      register_push_device: {
        Args: { _device_label?: string; _platform: string; _token: string }
        Returns: string
      }
      reject_application: {
        Args: { _app_id: string; _notes?: string; _reason: string }
        Returns: undefined
      }
      request_application_recovery:
        | { Args: { _app_id: string; _reason: string }; Returns: string }
        | {
            Args: { _app_id: string; _documents?: Json; _reason: string }
            Returns: string
          }
      request_withdrawal_authorization: {
        Args: {
          _amount: number
          _currency: string
          _destination_ref?: string
          _device_fingerprint?: string
          _metadata?: Json
          _request_type: string
          _subject_user_id?: string
          _user_agent?: string
        }
        Returns: Json
      }
      resolve_tax_jurisdiction: {
        Args: { _currency: string; _region?: string }
        Returns: string
      }
      resolve_vehicle_import_duplicate: {
        Args: { p_action: string; p_item_id: string; p_notes?: string }
        Returns: Json
      }
      reverse_wallet_entry: {
        Args: { _entry_id: string; _reason?: string }
        Returns: Json
      }
      revoke_full_access: {
        Args: { _reason?: string; _user_id: string }
        Returns: undefined
      }
      run_payment_preflight: {
        Args: { _context?: Json; _operation: string }
        Returns: Json
      }
      save_my_cookie_consent: { Args: { _prefs: Json }; Returns: Json }
      save_voice_agent_transcript: {
        Args: {
          _agent_id: string
          _duration_ms: number
          _region: string
          _transcript_text: string
          _turns: Json
        }
        Returns: string
      }
      set_messaging_opt_out: {
        Args: {
          _channel?: string
          _keyword?: string
          _opted_out: boolean
          _phone: string
          _source?: string
          _user_id?: string
        }
        Returns: undefined
      }
      set_my_messaging_preference: {
        Args: { _channel: string; _opted_out: boolean }
        Returns: undefined
      }
      set_my_region: {
        Args: { _country: string; _mode?: string }
        Returns: Json
      }
      set_onboarding_last_visited: { Args: { _step: string }; Returns: Json }
      settle_payment_financials: {
        Args: {
          _payment_id: string
          _provider?: string
          _provider_reference?: string
        }
        Returns: Json
      }
      sign_legal_agreement: {
        Args: { _agreement_id: string; _signature: string }
        Returns: {
          admin_witness_id: string | null
          admin_witness_signature: string | null
          admin_witnessed_at: string | null
          agreement_content: string
          agreement_type: string
          agreement_version: string
          created_at: string
          driver_id: string
          driver_signature: string | null
          driver_signed_at: string | null
          email_sent_at: string | null
          email_sent_to: Json | null
          expires_at: string | null
          id: string
          is_compulsory: boolean
          owner_id: string
          owner_signature: string | null
          owner_signed_at: string | null
          parent_agreement_id: string | null
          pdf_url: string | null
          renewal_count: number
          renewal_notified_at: string | null
          status: string
          updated_at: string
          vehicle_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "legal_agreements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sign_rent_to_own_agreement: {
        Args: { _agreement_id: string; _signature: string }
        Returns: {
          admin_witness_id: string | null
          admin_witness_signature: string | null
          admin_witnessed_at: string | null
          agreement_content: string
          allow_buyout: boolean
          allow_conversion_to_rental: boolean
          created_at: string
          currency: string
          down_payment: number
          driver_id: string
          driver_signature: string | null
          driver_signed_at: string | null
          duration_months: number
          id: string
          listing_id: string
          monthly_payment: number
          next_payment_due: string | null
          owner_id: string
          owner_signature: string | null
          owner_signed_at: string | null
          payments_made: number
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          total_amount_paid: number
          total_price: number
          updated_at: string
          vehicle_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rent_to_own_agreements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sms_delivery_stats: { Args: { _hours?: number }; Returns: Json }
      submit_booking_request: {
        Args: {
          _end_date: string
          _message?: string
          _region?: string
          _start_date: string
          _vehicle_id: string
        }
        Returns: string
      }
      submit_driver_referees: { Args: { _referees: Json }; Returns: string }
      submit_proxy_consent: {
        Args: {
          _ip?: string
          _signature: string
          _token: string
          _user_agent?: string
        }
        Returns: {
          activated_at: string | null
          admin_review_notes: string | null
          admin_review_status: string
          admin_reviewed_at: string | null
          admin_reviewed_by: string | null
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_fingerprint: string | null
          card_last4: string | null
          card_provider: string | null
          card_token: string | null
          consent_channels: string[] | null
          consent_ip: string | null
          consent_pdf_url: string | null
          consent_sent_at: string | null
          consent_signature: string | null
          consent_signed_at: string | null
          consent_status: string
          consent_token: string
          consent_token_expires_at: string
          consent_user_agent: string | null
          created_at: string
          driver_id: string
          expired_at: string | null
          id: string
          identity_status: string
          identity_verified_at: string | null
          max_uses: number | null
          notification_prefs: Json
          persona_inquiry_id: string | null
          proxy_email: string
          proxy_full_name: string
          proxy_phone: string | null
          proxy_relationship: string | null
          region: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          updated_at: string
          use_type: string
          uses_count: number
          validity_expires_at: string | null
          validity_starts_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "driver_proxy_billing_accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      support_staff_can_view_application: {
        Args: { _city: string; _country: string; _region: string }
        Returns: boolean
      }
      support_staff_can_view_task: {
        Args: {
          _city: string
          _region: string
          _type: Database["public"]["Enums"]["support_task_type"]
        }
        Returns: boolean
      }
      support_staff_region_match: {
        Args: { _region: string }
        Returns: boolean
      }
      switch_primary_role: {
        Args: { _new_role: Database["public"]["Enums"]["app_role"] }
        Returns: Json
      }
      sync_approved_application_vehicles: {
        Args: { p_source?: string }
        Returns: Json
      }
      sync_device_identity: { Args: { _device_id: string }; Returns: string }
      transition_payment_state: {
        Args: {
          _entity: string
          _entity_id: string
          _metadata?: Json
          _reason?: string
          _to_state: string
        }
        Returns: Json
      }
      update_proxy_notification_prefs: {
        Args: { _prefs: Json; _proxy_id: string; _token?: string }
        Returns: {
          activated_at: string | null
          admin_review_notes: string | null
          admin_review_status: string
          admin_reviewed_at: string | null
          admin_reviewed_by: string | null
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_fingerprint: string | null
          card_last4: string | null
          card_provider: string | null
          card_token: string | null
          consent_channels: string[] | null
          consent_ip: string | null
          consent_pdf_url: string | null
          consent_sent_at: string | null
          consent_signature: string | null
          consent_signed_at: string | null
          consent_status: string
          consent_token: string
          consent_token_expires_at: string
          consent_user_agent: string | null
          created_at: string
          driver_id: string
          expired_at: string | null
          id: string
          identity_status: string
          identity_verified_at: string | null
          max_uses: number | null
          notification_prefs: Json
          persona_inquiry_id: string | null
          proxy_email: string
          proxy_full_name: string
          proxy_phone: string | null
          proxy_relationship: string | null
          region: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          updated_at: string
          use_type: string
          uses_count: number
          validity_expires_at: string | null
          validity_starts_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "driver_proxy_billing_accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_push_device_prefs: {
        Args: { _device_id: string; _prefs: Json }
        Returns: boolean
      }
      vehicle_is_catalogue_eligible: {
        Args: { _is_public: boolean; _photos: string[]; _status: string }
        Returns: boolean
      }
      vehicle_publish_fields_unchanged: {
        Args: {
          _id: string
          _is_public: boolean
          _review_status: string
          _status: string
        }
        Returns: boolean
      }
      verify_cron_secret: { Args: { _secret: string }; Returns: boolean }
      verify_cron_token: { Args: { _token: string }; Returns: boolean }
      verify_payment_settlement: {
        Args: { _payment_id: string }
        Returns: Json
      }
    }
    Enums: {
      access_level_enum: "view_only" | "full"
      app_role:
        | "admin"
        | "owner"
        | "driver"
        | "legal_support"
        | "iot_support"
        | "vehicle_support"
        | "admin_assistant"
        | "insurance_support"
      application_status:
        | "pending"
        | "under_review"
        | "approved"
        | "rejected"
        | "needs_info"
      application_type: "driver" | "owner"
      booking_request_status:
        | "pending"
        | "offer_sent"
        | "accepted"
        | "declined"
        | "withdrawn"
        | "cancelled"
      call_in_status:
        | "active"
        | "expired"
        | "cancelled"
        | "breached"
        | "resolved"
      call_in_type: "fault" | "maintenance" | "sick"
      device_status: "inactive" | "active" | "offline" | "maintenance"
      entity_type: "operating_company" | "payment_entity" | "individual"
      feature_scope: "country" | "region" | "city"
      incident_severity: "low" | "medium" | "high" | "critical"
      incident_status:
        | "reported"
        | "acknowledged"
        | "in_progress"
        | "resolved"
        | "closed"
      incident_type:
        | "accident"
        | "maintenance"
        | "breakdown"
        | "theft"
        | "other"
      insurance_task_status:
        | "open"
        | "reviewing"
        | "awaiting_documents"
        | "quote_sent"
        | "escalated"
        | "resolved"
        | "closed"
      iot_task_status:
        | "assigned"
        | "scheduled"
        | "in_transit"
        | "on_site"
        | "installation_complete"
        | "testing"
        | "completed"
        | "failed"
      legal_task_status:
        | "open"
        | "document_review"
        | "pending_signature"
        | "escalated"
        | "resolved"
        | "closed"
      negotiation_status:
        | "pending"
        | "counter_offer"
        | "approved"
        | "rejected"
        | "locked"
      registration_stage_enum:
        | "auth"
        | "account_opened"
        | "documents_submitted"
        | "verification_pending"
        | "approved"
      support_task_type:
        | "legal"
        | "iot_installation"
        | "iot_maintenance"
        | "vehicle_recall"
        | "vehicle_maintenance"
        | "insurance"
        | "payment_accounts"
      tax_jurisdiction_level: "country" | "state" | "city"
      tax_type:
        | "income_tax"
        | "vat"
        | "sales_tax"
        | "withholding_tax"
        | "service_tax"
      vehicle_task_status:
        | "reported"
        | "dispatched"
        | "inspection"
        | "repair_in_progress"
        | "pending_parts"
        | "quality_check"
        | "completed"
        | "escalated"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      access_level_enum: ["view_only", "full"],
      app_role: [
        "admin",
        "owner",
        "driver",
        "legal_support",
        "iot_support",
        "vehicle_support",
        "admin_assistant",
        "insurance_support",
      ],
      application_status: [
        "pending",
        "under_review",
        "approved",
        "rejected",
        "needs_info",
      ],
      application_type: ["driver", "owner"],
      booking_request_status: [
        "pending",
        "offer_sent",
        "accepted",
        "declined",
        "withdrawn",
        "cancelled",
      ],
      call_in_status: [
        "active",
        "expired",
        "cancelled",
        "breached",
        "resolved",
      ],
      call_in_type: ["fault", "maintenance", "sick"],
      device_status: ["inactive", "active", "offline", "maintenance"],
      entity_type: ["operating_company", "payment_entity", "individual"],
      feature_scope: ["country", "region", "city"],
      incident_severity: ["low", "medium", "high", "critical"],
      incident_status: [
        "reported",
        "acknowledged",
        "in_progress",
        "resolved",
        "closed",
      ],
      incident_type: ["accident", "maintenance", "breakdown", "theft", "other"],
      insurance_task_status: [
        "open",
        "reviewing",
        "awaiting_documents",
        "quote_sent",
        "escalated",
        "resolved",
        "closed",
      ],
      iot_task_status: [
        "assigned",
        "scheduled",
        "in_transit",
        "on_site",
        "installation_complete",
        "testing",
        "completed",
        "failed",
      ],
      legal_task_status: [
        "open",
        "document_review",
        "pending_signature",
        "escalated",
        "resolved",
        "closed",
      ],
      negotiation_status: [
        "pending",
        "counter_offer",
        "approved",
        "rejected",
        "locked",
      ],
      registration_stage_enum: [
        "auth",
        "account_opened",
        "documents_submitted",
        "verification_pending",
        "approved",
      ],
      support_task_type: [
        "legal",
        "iot_installation",
        "iot_maintenance",
        "vehicle_recall",
        "vehicle_maintenance",
        "insurance",
        "payment_accounts",
      ],
      tax_jurisdiction_level: ["country", "state", "city"],
      tax_type: [
        "income_tax",
        "vat",
        "sales_tax",
        "withholding_tax",
        "service_tax",
      ],
      vehicle_task_status: [
        "reported",
        "dispatched",
        "inspection",
        "repair_in_progress",
        "pending_parts",
        "quality_check",
        "completed",
        "escalated",
      ],
    },
  },
} as const
