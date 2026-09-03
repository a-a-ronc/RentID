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
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
          organization_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          organization_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          subject: string | null
          tenancy_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          subject?: string | null
          tenancy_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          subject?: string | null
          tenancy_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_tenancy_id_fkey"
            columns: ["tenancy_id"]
            isOneToOne: false
            referencedRelation: "tenancies"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["document_kind"]
          lease_id: string | null
          mime_type: string | null
          organization_id: string
          property_id: string | null
          size_bytes: number | null
          storage_path: string
          tenancy_id: string | null
          title: string
          unit_id: string | null
          updated_at: string
          uploaded_by: string | null
          visible_to_tenant: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["document_kind"]
          lease_id?: string | null
          mime_type?: string | null
          organization_id: string
          property_id?: string | null
          size_bytes?: number | null
          storage_path: string
          tenancy_id?: string | null
          title: string
          unit_id?: string | null
          updated_at?: string
          uploaded_by?: string | null
          visible_to_tenant?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["document_kind"]
          lease_id?: string | null
          mime_type?: string | null
          organization_id?: string
          property_id?: string | null
          size_bytes?: number | null
          storage_path?: string
          tenancy_id?: string | null
          title?: string
          unit_id?: string | null
          updated_at?: string
          uploaded_by?: string | null
          visible_to_tenant?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "documents_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_tenancy_id_fkey"
            columns: ["tenancy_id"]
            isOneToOne: false
            referencedRelation: "tenancies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      leases: {
        Row: {
          created_at: string
          document_path: string | null
          end_date: string | null
          id: string
          late_fee_terms: string | null
          monthly_rent: number | null
          organization_id: string
          rent_due_day: number | null
          security_deposit: number | null
          start_date: string | null
          tenancy_id: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_path?: string | null
          end_date?: string | null
          id?: string
          late_fee_terms?: string | null
          monthly_rent?: number | null
          organization_id: string
          rent_due_day?: number | null
          security_deposit?: number | null
          start_date?: string | null
          tenancy_id: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_path?: string | null
          end_date?: string | null
          id?: string
          late_fee_terms?: string | null
          monthly_rent?: number | null
          organization_id?: string
          rent_due_day?: number | null
          security_deposit?: number | null
          start_date?: string | null
          tenancy_id?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_tenancy_id_fkey"
            columns: ["tenancy_id"]
            isOneToOne: false
            referencedRelation: "tenancies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_requests: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          first_response_at: string | null
          id: string
          organization_id: string
          priority: Database["public"]["Enums"]["maintenance_priority"]
          property_id: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["maintenance_status"]
          tenancy_id: string | null
          title: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          first_response_at?: string | null
          id?: string
          organization_id: string
          priority?: Database["public"]["Enums"]["maintenance_priority"]
          property_id?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["maintenance_status"]
          tenancy_id?: string | null
          title: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          first_response_at?: string | null
          id?: string
          organization_id?: string
          priority?: Database["public"]["Enums"]["maintenance_priority"]
          property_id?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["maintenance_status"]
          tenancy_id?: string | null
          title?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_tenancy_id_fkey"
            columns: ["tenancy_id"]
            isOneToOne: false
            referencedRelation: "tenancies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          read_at: string | null
          sender_id: string | null
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string | null
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          organization_id: string | null
          read_at: string | null
          severity: string
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          organization_id?: string | null
          read_at?: string | null
          severity?: string
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          organization_id?: string | null
          read_at?: string | null
          severity?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          is_demo: boolean
          legal_entity_name: string | null
          name: string
          owner_id: string | null
          stripe_connect_account_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_demo?: boolean
          legal_entity_name?: string | null
          name: string
          owner_id?: string | null
          stripe_connect_account_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_demo?: boolean
          legal_entity_name?: string | null
          name?: string
          owner_id?: string | null
          stripe_connect_account_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payment_schedules: {
        Row: {
          active: boolean
          amount: number
          autopay_enabled: boolean
          created_at: string
          due_day: number
          id: string
          organization_id: string
          tenancy_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount: number
          autopay_enabled?: boolean
          created_at?: string
          due_day?: number
          id?: string
          organization_id: string
          tenancy_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          autopay_enabled?: boolean
          created_at?: string
          due_day?: number
          id?: string
          organization_id?: string
          tenancy_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_schedules_tenancy_id_fkey"
            columns: ["tenancy_id"]
            isOneToOne: false
            referencedRelation: "tenancies"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          days_late: number | null
          due_date: string | null
          external_reference: string | null
          id: string
          metadata: Json
          method: string | null
          organization_id: string
          paid_at: string | null
          platform_fee_amount: number | null
          status: Database["public"]["Enums"]["payment_status"]
          tenancy_id: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          days_late?: number | null
          due_date?: string | null
          external_reference?: string | null
          id?: string
          metadata?: Json
          method?: string | null
          organization_id: string
          paid_at?: string | null
          platform_fee_amount?: number | null
          status?: Database["public"]["Enums"]["payment_status"]
          tenancy_id: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          days_late?: number | null
          due_date?: string | null
          external_reference?: string | null
          id?: string
          metadata?: Json
          method?: string | null
          organization_id?: string
          paid_at?: string | null
          platform_fee_amount?: number | null
          status?: Database["public"]["Enums"]["payment_status"]
          tenancy_id?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenancy_id_fkey"
            columns: ["tenancy_id"]
            isOneToOne: false
            referencedRelation: "tenancies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          fee_allocation: string
          id: boolean
          platform_fee_cap: number | null
          platform_fee_percentage: number
          updated_at: string
        }
        Insert: {
          fee_allocation?: string
          id?: boolean
          platform_fee_cap?: number | null
          platform_fee_percentage?: number
          updated_at?: string
        }
        Update: {
          fee_allocation?: string
          id?: boolean
          platform_fee_cap?: number | null
          platform_fee_percentage?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          onboarding_completed: boolean
          phone: string | null
          portfolio_size: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          onboarding_completed?: boolean
          phone?: string | null
          portfolio_size?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean
          phone?: string | null
          portfolio_size?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          city: string
          created_at: string
          id: string
          name: string
          notes: string | null
          organization_id: string
          photo_url: string | null
          property_type: Database["public"]["Enums"]["property_type"]
          state: string
          street_address: string
          unit_count: number
          updated_at: string
          zip: string
        }
        Insert: {
          city: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          photo_url?: string | null
          property_type?: Database["public"]["Enums"]["property_type"]
          state: string
          street_address: string
          unit_count?: number
          updated_at?: string
          zip: string
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          photo_url?: string | null
          property_type?: Database["public"]["Enums"]["property_type"]
          state?: string
          street_address?: string
          unit_count?: number
          updated_at?: string
          zip?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      review_disputes: {
        Row: {
          created_at: string
          id: string
          raised_by: string
          reason: string
          review_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          raised_by: string
          reason: string
          review_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          raised_by?: string
          reason?: string
          review_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_disputes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author_id: string
          body: string | null
          created_at: string
          id: string
          published: boolean
          rating: number
          subject_type: Database["public"]["Enums"]["review_subject"]
          subject_user_id: string | null
          tenancy_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body?: string | null
          created_at?: string
          id?: string
          published?: boolean
          rating: number
          subject_type: Database["public"]["Enums"]["review_subject"]
          subject_user_id?: string | null
          tenancy_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string | null
          created_at?: string
          id?: string
          published?: boolean
          rating?: number
          subject_type?: Database["public"]["Enums"]["review_subject"]
          subject_user_id?: string | null
          tenancy_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_tenancy_id_fkey"
            columns: ["tenancy_id"]
            isOneToOne: false
            referencedRelation: "tenancies"
            referencedColumns: ["id"]
          },
        ]
      }
      tenancies: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          monthly_rent: number | null
          organization_id: string
          property_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["tenancy_status"]
          tenant_email: string | null
          tenant_name: string | null
          tenant_phone: string | null
          tenant_user_id: string | null
          unit_id: string
          updated_at: string
          verified: boolean
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          monthly_rent?: number | null
          organization_id: string
          property_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["tenancy_status"]
          tenant_email?: string | null
          tenant_name?: string | null
          tenant_phone?: string | null
          tenant_user_id?: string | null
          unit_id: string
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          monthly_rent?: number | null
          organization_id?: string
          property_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["tenancy_status"]
          tenant_email?: string | null
          tenant_name?: string | null
          tenant_phone?: string | null
          tenant_user_id?: string | null
          unit_id?: string
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenancies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenancies_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenancies_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string | null
          expires_at: string
          full_name: string | null
          id: string
          invited_by: string | null
          lease_end: string | null
          lease_start: string | null
          monthly_rent: number | null
          organization_id: string
          phone: string | null
          property_id: string | null
          status: Database["public"]["Enums"]["invitation_status"]
          tenancy_id: string | null
          token: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          lease_end?: string | null
          lease_start?: string | null
          monthly_rent?: number | null
          organization_id: string
          phone?: string | null
          property_id?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          tenancy_id?: string | null
          token?: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          lease_end?: string | null
          lease_start?: string | null
          monthly_rent?: number | null
          organization_id?: string
          phone?: string | null
          property_id?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          tenancy_id?: string | null
          token?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_invitations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_invitations_tenancy_id_fkey"
            columns: ["tenancy_id"]
            isOneToOne: false
            referencedRelation: "tenancies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_invitations_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          bathrooms: number | null
          bedrooms: number | null
          created_at: string
          id: string
          monthly_rent: number | null
          name: string
          occupancy_status: Database["public"]["Enums"]["occupancy_status"]
          property_id: string
          rent_due_day: number | null
          security_deposit: number | null
          square_feet: number | null
          updated_at: string
        }
        Insert: {
          bathrooms?: number | null
          bedrooms?: number | null
          created_at?: string
          id?: string
          monthly_rent?: number | null
          name: string
          occupancy_status?: Database["public"]["Enums"]["occupancy_status"]
          property_id: string
          rent_due_day?: number | null
          security_deposit?: number | null
          square_feet?: number | null
          updated_at?: string
        }
        Update: {
          bathrooms?: number | null
          bedrooms?: number | null
          created_at?: string
          id?: string
          monthly_rent?: number | null
          name?: string
          occupancy_status?: Database["public"]["Enums"]["occupancy_status"]
          property_id?: string
          rent_due_day?: number | null
          security_deposit?: number | null
          square_feet?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      verification_records: {
        Row: {
          created_at: string
          id: string
          label: string
          metadata: Json
          occurred_at: string
          record_type: string
          subject_user_id: string | null
          tenancy_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          metadata?: Json
          occurred_at?: string
          record_type: string
          subject_user_id?: string | null
          tenancy_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          metadata?: Json
          occurred_at?: string
          record_type?: string
          subject_user_id?: string | null
          tenancy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_records_tenancy_id_fkey"
            columns: ["tenancy_id"]
            isOneToOne: false
            referencedRelation: "tenancies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_conversation: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      can_manage_property: { Args: { _property_id: string }; Returns: boolean }
      can_manage_unit: { Args: { _unit_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_demo_org: { Args: { _org_id: string }; Returns: boolean }
      is_org_member: { Args: { _org_id: string }; Returns: boolean }
      is_tenancy_party: { Args: { _tenancy_id: string }; Returns: boolean }
      is_tenant_of_unit: { Args: { _unit_id: string }; Returns: boolean }
      is_verified_tenancy: { Args: { _tenancy_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "landlord" | "tenant" | "property_manager" | "admin"
      document_kind:
        | "lease"
        | "move_in_inspection"
        | "move_out_inspection"
        | "notice"
        | "receipt"
        | "photo"
        | "maintenance"
        | "other"
      invitation_status: "pending" | "accepted" | "expired" | "revoked"
      maintenance_priority: "low" | "normal" | "high" | "urgent"
      maintenance_status: "open" | "in_progress" | "resolved" | "closed"
      occupancy_status: "occupied" | "vacant" | "upcoming_vacancy"
      payment_status:
        | "scheduled"
        | "pending"
        | "paid"
        | "late"
        | "failed"
        | "refunded"
        | "returned"
      property_type:
        | "single_family"
        | "multi_family"
        | "condo"
        | "townhouse"
        | "apartment"
        | "other"
      review_subject: "tenant" | "landlord"
      tenancy_status: "pending" | "active" | "ended" | "cancelled"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["landlord", "tenant", "property_manager", "admin"],
      document_kind: [
        "lease",
        "move_in_inspection",
        "move_out_inspection",
        "notice",
        "receipt",
        "photo",
        "maintenance",
        "other",
      ],
      invitation_status: ["pending", "accepted", "expired", "revoked"],
      maintenance_priority: ["low", "normal", "high", "urgent"],
      maintenance_status: ["open", "in_progress", "resolved", "closed"],
      occupancy_status: ["occupied", "vacant", "upcoming_vacancy"],
      payment_status: [
        "scheduled",
        "pending",
        "paid",
        "late",
        "failed",
        "refunded",
        "returned",
      ],
      property_type: [
        "single_family",
        "multi_family",
        "condo",
        "townhouse",
        "apartment",
        "other",
      ],
      review_subject: ["tenant", "landlord"],
      tenancy_status: ["pending", "active", "ended", "cancelled"],
    },
  },
} as const
