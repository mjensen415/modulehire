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
      applicant_criterion_scores: {
        Row: {
          applicant_id: string
          criterion_id: string
          evidence: string | null
          id: string
          met: boolean | null
          score: number | null
        }
        Insert: {
          applicant_id: string
          criterion_id: string
          evidence?: string | null
          id?: string
          met?: boolean | null
          score?: number | null
        }
        Update: {
          applicant_id?: string
          criterion_id?: string
          evidence?: string | null
          id?: string
          met?: boolean | null
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "applicant_criterion_scores_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applicant_criterion_scores_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "scoring_criteria"
            referencedColumns: ["id"]
          },
        ]
      }
      applicant_notes: {
        Row: {
          applicant_id: string
          body: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          applicant_id: string
          body: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          applicant_id?: string
          body?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applicant_notes_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      applicant_status_history: {
        Row: {
          applicant_id: string
          changed_at: string | null
          from_status: string | null
          id: string
          to_status: string | null
          user_id: string | null
        }
        Insert: {
          applicant_id: string
          changed_at?: string | null
          from_status?: string | null
          id?: string
          to_status?: string | null
          user_id?: string | null
        }
        Update: {
          applicant_id?: string
          changed_at?: string | null
          from_status?: string | null
          id?: string
          to_status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applicant_status_history_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      applicants: {
        Row: {
          created_at: string | null
          email: string | null
          file_url: string | null
          has_dealbreaker: boolean | null
          id: string
          job_id: string
          name: string | null
          org_id: string
          overall_score: number | null
          parsed_headline: string | null
          raw_text: string | null
          scored_at: string | null
          source: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          file_url?: string | null
          has_dealbreaker?: boolean | null
          id?: string
          job_id: string
          name?: string | null
          org_id: string
          overall_score?: number | null
          parsed_headline?: string | null
          raw_text?: string | null
          scored_at?: string | null
          source?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          file_url?: string | null
          has_dealbreaker?: boolean | null
          id?: string
          job_id?: string
          name?: string | null
          org_id?: string
          overall_score?: number | null
          parsed_headline?: string | null
          raw_text?: string | null
          scored_at?: string | null
          source?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applicants_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_postings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applicants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_codes: {
        Row: {
          code: string
          created_at: string | null
          is_active: boolean | null
          notes: string | null
          sent_at: string | null
          sent_to_email: string | null
          used_at: string | null
          used_by_email: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          is_active?: boolean | null
          notes?: string | null
          sent_at?: string | null
          sent_to_email?: string | null
          used_at?: string | null
          used_by_email?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          is_active?: boolean | null
          notes?: string | null
          sent_at?: string | null
          sent_to_email?: string | null
          used_at?: string | null
          used_by_email?: string | null
        }
        Relationships: []
      }
      beta_feedback: {
        Row: {
          category: string | null
          created_at: string
          id: string
          message: string
          page_url: string | null
          rating: number | null
          status: string
          user_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          message: string
          page_url?: string | null
          rating?: number | null
          status?: string
          user_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          message?: string
          page_url?: string | null
          rating?: number | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      beta_requests: {
        Row: {
          beta_code: string | null
          context: string | null
          created_at: string | null
          email: string
          id: string
          invited_at: string | null
          marketing_opt_in: boolean | null
          status: string
        }
        Insert: {
          beta_code?: string | null
          context?: string | null
          created_at?: string | null
          email: string
          id?: string
          invited_at?: string | null
          marketing_opt_in?: boolean | null
          status?: string
        }
        Update: {
          beta_code?: string | null
          context?: string | null
          created_at?: string | null
          email?: string
          id?: string
          invited_at?: string | null
          marketing_opt_in?: boolean | null
          status?: string
        }
        Relationships: []
      }
      education: {
        Row: {
          created_at: string
          degree: string
          field: string
          id: string
          school: string
          sort_order: number
          updated_at: string
          user_id: string
          year: string
        }
        Insert: {
          created_at?: string
          degree?: string
          field?: string
          id?: string
          school?: string
          sort_order?: number
          updated_at?: string
          user_id: string
          year?: string
        }
        Update: {
          created_at?: string
          degree?: string
          field?: string
          id?: string
          school?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
          year?: string
        }
        Relationships: [
          {
            foreignKeyName: "education_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_resumes: {
        Row: {
          ats_score: number | null
          company_color_hex: string | null
          created_at: string
          deleted_at: string | null
          docx_url: string | null
          expires_at: string | null
          id: string
          is_temp: boolean
          job_description_id: string | null
          module_ids_used: string[]
          pdf_url: string | null
          positioning_variant: string | null
          profile_id: string | null
          status: Database["public"]["Enums"]["resume_status"]
          title: string
          user_id: string
        }
        Insert: {
          ats_score?: number | null
          company_color_hex?: string | null
          created_at?: string
          deleted_at?: string | null
          docx_url?: string | null
          expires_at?: string | null
          id?: string
          is_temp?: boolean
          job_description_id?: string | null
          module_ids_used?: string[]
          pdf_url?: string | null
          positioning_variant?: string | null
          profile_id?: string | null
          status?: Database["public"]["Enums"]["resume_status"]
          title: string
          user_id: string
        }
        Update: {
          ats_score?: number | null
          company_color_hex?: string | null
          created_at?: string
          deleted_at?: string | null
          docx_url?: string | null
          expires_at?: string | null
          id?: string
          is_temp?: boolean
          job_description_id?: string | null
          module_ids_used?: string[]
          pdf_url?: string | null
          positioning_variant?: string | null
          profile_id?: string | null
          status?: Database["public"]["Enums"]["resume_status"]
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_resumes_job_description_id_fkey"
            columns: ["job_description_id"]
            isOneToOne: false
            referencedRelation: "job_descriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_resumes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_resumes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_prep_cache: {
        Row: {
          generated_at: string
          id: string
          job_description_id: string
          prep_data: Json
          user_id: string
        }
        Insert: {
          generated_at?: string
          id?: string
          job_description_id: string
          prep_data: Json
          user_id: string
        }
        Update: {
          generated_at?: string
          id?: string
          job_description_id?: string
          prep_data?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_prep_cache_job_description_id_fkey"
            columns: ["job_description_id"]
            isOneToOne: false
            referencedRelation: "job_descriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      job_applications: {
        Row: {
          applied_at: string | null
          company: string
          created_at: string
          id: string
          jd_text: string | null
          job_description_id: string | null
          notes: string | null
          prep_data: Json | null
          prep_generated_at: string | null
          status: string
          title: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          company: string
          created_at?: string
          id?: string
          jd_text?: string | null
          job_description_id?: string | null
          notes?: string | null
          prep_data?: Json | null
          prep_generated_at?: string | null
          status?: string
          title: string
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          applied_at?: string | null
          company?: string
          created_at?: string
          id?: string
          jd_text?: string | null
          job_description_id?: string | null
          notes?: string | null
          prep_data?: Json | null
          prep_generated_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_job_description_id_fkey"
            columns: ["job_description_id"]
            isOneToOne: false
            referencedRelation: "job_descriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      job_descriptions: {
        Row: {
          created_at: string
          deleted_at: string | null
          extracted_company: string | null
          extracted_job_title: string | null
          extracted_phrases: string[]
          extracted_role_type: string | null
          extracted_seniority: string | null
          extracted_themes: string[]
          id: string
          raw_text: string
          source_type: string
          source_url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          extracted_company?: string | null
          extracted_job_title?: string | null
          extracted_phrases?: string[]
          extracted_role_type?: string | null
          extracted_seniority?: string | null
          extracted_themes?: string[]
          id?: string
          raw_text: string
          source_type: string
          source_url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          extracted_company?: string | null
          extracted_job_title?: string | null
          extracted_phrases?: string[]
          extracted_role_type?: string | null
          extracted_seniority?: string | null
          extracted_themes?: string[]
          id?: string
          raw_text?: string
          source_type?: string
          source_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_descriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      job_experiences: {
        Row: {
          company: string
          created_at: string | null
          employment_type: string | null
          end_date: string | null
          id: string
          location: string | null
          sort_order: number | null
          start_date: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          company: string
          created_at?: string | null
          employment_type?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          sort_order?: number | null
          start_date?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          company?: string
          created_at?: string | null
          employment_type?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          sort_order?: number | null
          start_date?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      job_postings: {
        Row: {
          applicant_count: number | null
          created_at: string | null
          created_by: string | null
          extracted_company: string | null
          extracted_job_title: string | null
          extracted_phrases: string[] | null
          extracted_role_type: string | null
          extracted_seniority: string | null
          extracted_themes: string[] | null
          id: string
          org_id: string
          raw_jd: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          applicant_count?: number | null
          created_at?: string | null
          created_by?: string | null
          extracted_company?: string | null
          extracted_job_title?: string | null
          extracted_phrases?: string[] | null
          extracted_role_type?: string | null
          extracted_seniority?: string | null
          extracted_themes?: string[] | null
          id?: string
          org_id: string
          raw_jd?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          applicant_count?: number | null
          created_at?: string | null
          created_by?: string | null
          extracted_company?: string | null
          extracted_job_title?: string | null
          extracted_phrases?: string[] | null
          extracted_role_type?: string | null
          extracted_seniority?: string | null
          extracted_themes?: string[] | null
          id?: string
          org_id?: string
          raw_jd?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_postings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_skills: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          job_id: string
          name: string
          source: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          job_id: string
          name: string
          source?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          job_id?: string
          name?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_skills_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_experiences"
            referencedColumns: ["id"]
          },
        ]
      }
      module_job_assignments: {
        Row: {
          created_at: string | null
          job_id: string
          module_id: string
        }
        Insert: {
          created_at?: string | null
          job_id: string
          module_id: string
        }
        Update: {
          created_at?: string | null
          job_id?: string
          module_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_job_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_experiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_job_assignments_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          company_stage: string[]
          content: string
          created_at: string
          date_end: string | null
          date_start: string | null
          deleted_at: string | null
          employment_type: string | null
          id: string
          profile_id: string | null
          role_types: string[]
          source_company: string | null
          source_resume_id: string | null
          source_role_title: string | null
          status: string
          themes: string[]
          title: string
          type: string
          updated_at: string
          user_id: string
          weight: string
        }
        Insert: {
          company_stage?: string[]
          content: string
          created_at?: string
          date_end?: string | null
          date_start?: string | null
          deleted_at?: string | null
          employment_type?: string | null
          id?: string
          profile_id?: string | null
          role_types?: string[]
          source_company?: string | null
          source_resume_id?: string | null
          source_role_title?: string | null
          status?: string
          themes?: string[]
          title: string
          type: string
          updated_at?: string
          user_id: string
          weight?: string
        }
        Update: {
          company_stage?: string[]
          content?: string
          created_at?: string
          date_end?: string | null
          date_start?: string | null
          deleted_at?: string | null
          employment_type?: string | null
          id?: string
          profile_id?: string | null
          role_types?: string[]
          source_company?: string | null
          source_resume_id?: string | null
          source_role_title?: string | null
          status?: string
          themes?: string[]
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
          weight?: string
        }
        Relationships: [
          {
            foreignKeyName: "modules_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modules_source_resume_id_fkey"
            columns: ["source_resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          id: string
          invited_at: string | null
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          id?: string
          invited_at?: string | null
          org_id: string
          role: string
          user_id: string
        }
        Update: {
          id?: string
          invited_at?: string | null
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          id: string
          name: string
          owner_id: string
          slug: string | null
          stripe_customer_id: string | null
          tier: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          owner_id: string
          slug?: string | null
          stripe_customer_id?: string | null
          tier?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          owner_id?: string
          slug?: string | null
          stripe_customer_id?: string | null
          tier?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          action: string
          created_at: string
          id: string
          key: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          key: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          key?: string
        }
        Relationships: []
      }
      resume_generation_counts: {
        Row: {
          count: number
          id: string
          month: string
          overage_credits: number
          user_id: string
        }
        Insert: {
          count?: number
          id?: string
          month: string
          overage_credits?: number
          user_id: string
        }
        Update: {
          count?: number
          id?: string
          month?: string
          overage_credits?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_generation_counts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      resumes: {
        Row: {
          created_at: string
          deleted_at: string | null
          file_url: string | null
          filename: string
          id: string
          parsed_at: string | null
          raw_text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          file_url?: string | null
          filename: string
          id?: string
          parsed_at?: string | null
          raw_text: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          file_url?: string | null
          filename?: string
          id?: string
          parsed_at?: string | null
          raw_text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resumes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_criteria: {
        Row: {
          criterion_type: string
          description: string | null
          id: string
          job_id: string
          label: string
          min_years: number | null
          sort_order: number | null
          weight: string
        }
        Insert: {
          criterion_type?: string
          description?: string | null
          id?: string
          job_id: string
          label: string
          min_years?: number | null
          sort_order?: number | null
          weight: string
        }
        Update: {
          criterion_type?: string
          description?: string | null
          id?: string
          job_id?: string
          label?: string
          min_years?: number | null
          sort_order?: number | null
          weight?: string
        }
        Relationships: [
          {
            foreignKeyName: "scoring_criteria_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_postings"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_module_assignments: {
        Row: {
          created_at: string | null
          module_id: string
          skill_id: string
        }
        Insert: {
          created_at?: string | null
          module_id: string
          skill_id: string
        }
        Update: {
          created_at?: string | null
          module_id?: string
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_module_assignments_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_module_assignments_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "job_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          action: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          active_profile_id: string | null
          created_at: string
          deleted_at: string | null
          email: string
          generations_remaining: number
          id: string
          is_admin: boolean
          linkedin_url: string | null
          location: string | null
          name: string | null
          onboarding_complete: boolean
          phone: string | null
          plan: string
          plan_current_period_end: string | null
          plan_interval: string | null
          plan_period_end: string | null
          resume_credits: number
          skills_onboarded_at: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          summary: string | null
          tier: string
          tier_expires_at: string | null
          updated_at: string
        }
        Insert: {
          active_profile_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email: string
          generations_remaining?: number
          id: string
          is_admin?: boolean
          linkedin_url?: string | null
          location?: string | null
          name?: string | null
          onboarding_complete?: boolean
          phone?: string | null
          plan?: string
          plan_current_period_end?: string | null
          plan_interval?: string | null
          plan_period_end?: string | null
          resume_credits?: number
          skills_onboarded_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          summary?: string | null
          tier?: string
          tier_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          active_profile_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string
          generations_remaining?: number
          id?: string
          is_admin?: boolean
          linkedin_url?: string | null
          location?: string | null
          name?: string | null
          onboarding_complete?: boolean
          phone?: string | null
          plan?: string
          plan_current_period_end?: string | null
          plan_interval?: string | null
          plan_period_end?: string | null
          resume_credits?: number
          skills_onboarded_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          summary?: string | null
          tier?: string
          tier_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_active_profile_id_fkey"
            columns: ["active_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      biz_applicant_org_id: {
        Args: { p_applicant_id: string }
        Returns: string
      }
      biz_criteria_org_id: { Args: { p_job_id: string }; Returns: string }
      biz_user_is_org_member: { Args: { p_org_id: string }; Returns: boolean }
      biz_user_owns_org: { Args: { p_org_id: string }; Returns: boolean }
      increment_overage_credits: {
        Args: { p_month: string; p_user_id: string }
        Returns: undefined
      }
      increment_resume_count: {
        Args: { p_month: string; p_user_id: string }
        Returns: undefined
      }
      increment_resume_credits: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      purge_expired_temp_files: {
        Args: never
        Returns: {
          docx_path: string
          pdf_path: string
        }[]
      }
    }
    Enums: {
      resume_status: "draft" | "sent" | "viewed" | "interview"
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
      resume_status: ["draft", "sent", "viewed", "interview"],
    },
  },
} as const
