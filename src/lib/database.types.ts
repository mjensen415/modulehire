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
      generated_resumes: {
        Row: {
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
          status: Database["public"]["Enums"]["resume_status"]
          title: string
          user_id: string
        }
        Insert: {
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
          status?: Database["public"]["Enums"]["resume_status"]
          title: string
          user_id: string
        }
        Update: {
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
            foreignKeyName: "generated_resumes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      job_descriptions: {
        Row: {
          created_at: string
          deleted_at: string | null
          extracted_company: string | null
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
      users: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string
          id: string
          is_admin: boolean
          name: string | null
          plan: string
          plan_period_end: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email: string
          id: string
          is_admin?: boolean
          name?: string | null
          plan?: string
          plan_period_end?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string
          id?: string
          is_admin?: boolean
          name?: string | null
          plan?: string
          plan_period_end?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
