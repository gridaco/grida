export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  grida_forms: {
    Tables: {
      form: {
        Row: {
          cover_image: string | null
          created_at: string
          description: string | null
          id: string
          is_edit_after_submission_allowed: boolean
          is_multiple_response_allowed: boolean
          is_unknown_field_allowed: boolean
          posted_at: string | null
          project_id: number
          thumbnail_image: string | null
          title: string
        }
        Insert: {
          cover_image?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_edit_after_submission_allowed?: boolean
          is_multiple_response_allowed?: boolean
          is_unknown_field_allowed?: boolean
          posted_at?: string | null
          project_id: number
          thumbnail_image?: string | null
          title?: string
        }
        Update: {
          cover_image?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_edit_after_submission_allowed?: boolean
          is_multiple_response_allowed?: boolean
          is_unknown_field_allowed?: boolean
          posted_at?: string | null
          project_id?: number
          thumbnail_image?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "grida_forms_form_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          }
        ]
      }
      form_field: {
        Row: {
          alt: string | null
          autocomplete: boolean | null
          created_at: string
          description: string | null
          form_id: string
          help_text: string | null
          id: string
          label: string | null
          max: Json | null
          maxlength: number | null
          min: Json | null
          minlength: number | null
          name: string
          pattern: Json | null
          placeholder: string | null
          required: boolean
          type: Database["grida_forms"]["Enums"]["form_field_type"]
          updated_at: string
        }
        Insert: {
          alt?: string | null
          autocomplete?: boolean | null
          created_at?: string
          description?: string | null
          form_id: string
          help_text?: string | null
          id?: string
          label?: string | null
          max?: Json | null
          maxlength?: number | null
          min?: Json | null
          minlength?: number | null
          name: string
          pattern?: Json | null
          placeholder?: string | null
          required?: boolean
          type?: Database["grida_forms"]["Enums"]["form_field_type"]
          updated_at?: string
        }
        Update: {
          alt?: string | null
          autocomplete?: boolean | null
          created_at?: string
          description?: string | null
          form_id?: string
          help_text?: string | null
          id?: string
          label?: string | null
          max?: Json | null
          maxlength?: number | null
          min?: Json | null
          minlength?: number | null
          name?: string
          pattern?: Json | null
          placeholder?: string | null
          required?: boolean
          type?: Database["grida_forms"]["Enums"]["form_field_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grida_forms_form_field_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "form"
            referencedColumns: ["id"]
          }
        ]
      }
      response: {
        Row: {
          browser: string | null
          created_at: string
          customer_uuid: string | null
          form_id: string | null
          id: string
          ip: string | null
          platform_powered_by:
            | Database["grida_forms"]["Enums"]["response_platform_powered_by"]
            | null
          raw: Json
          x_referer: string | null
          x_useragent: string | null
        }
        Insert: {
          browser?: string | null
          created_at?: string
          customer_uuid?: string | null
          form_id?: string | null
          id?: string
          ip?: string | null
          platform_powered_by?:
            | Database["grida_forms"]["Enums"]["response_platform_powered_by"]
            | null
          raw: Json
          x_referer?: string | null
          x_useragent?: string | null
        }
        Update: {
          browser?: string | null
          created_at?: string
          customer_uuid?: string | null
          form_id?: string | null
          id?: string
          ip?: string | null
          platform_powered_by?:
            | Database["grida_forms"]["Enums"]["response_platform_powered_by"]
            | null
          raw?: Json
          x_referer?: string | null
          x_useragent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grida_forms_response_customer_uuid_fkey"
            columns: ["customer_uuid"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["uuid"]
          },
          {
            foreignKeyName: "grida_forms_response_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "form"
            referencedColumns: ["id"]
          }
        ]
      }
      response_field: {
        Row: {
          created_at: string
          form_field_id: string
          id: string
          response_id: string
          type: Database["grida_forms"]["Enums"]["form_field_type"]
          updated_at: string
          value: Json | null
        }
        Insert: {
          created_at?: string
          form_field_id: string
          id?: string
          response_id: string
          type?: Database["grida_forms"]["Enums"]["form_field_type"]
          updated_at?: string
          value?: Json | null
        }
        Update: {
          created_at?: string
          form_field_id?: string
          id?: string
          response_id?: string
          type?: Database["grida_forms"]["Enums"]["form_field_type"]
          updated_at?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "grida_forms_response_field_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "response"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      form_field_type:
        | "text"
        | "textarea"
        | "tel"
        | "url"
        | "checkbox"
        | "number"
        | "date"
        | "month"
        | "week"
        | "email"
        | "file"
        | "image"
        | "select"
        | "latlng"
        | "password"
        | "color"
        | "radio"
      response_platform_powered_by: "api" | "grida_forms" | "web_client"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      customer: {
        Row: {
          created_at: string
          email: string | null
          id: number
          project_id: number
          uuid: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: number
          project_id: number
          uuid?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: number
          project_id?: number
          uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_customer_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          }
        ]
      }
      organization: {
        Row: {
          created_at: string
          id: number
          name: string
          owner_id: string
          uuid: string
        }
        Insert: {
          created_at?: string
          id?: number
          name: string
          owner_id?: string
          uuid?: string
        }
        Update: {
          created_at?: string
          id?: number
          name?: string
          owner_id?: string
          uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_organization_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      organization_member: {
        Row: {
          created_at: string
          id: number
          organization_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          organization_id: number
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: number
          organization_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_organization_member_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_organization_member_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      project: {
        Row: {
          created_at: string
          id: number
          name: string
          organization_id: number
        }
        Insert: {
          created_at?: string
          id?: number
          name: string
          organization_id: number
        }
        Update: {
          created_at?: string
          id?: number
          name?: string
          organization_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "public_project_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_organizations_for_user: {
        Args: {
          user_id: string
        }
        Returns: number[]
      }
      get_projects_for_user: {
        Args: {
          user_id: string
        }
        Returns: number[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"] & Database["public"]["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] &
      Database["public"]["Views"])
  ? (Database["public"]["Tables"] &
      Database["public"]["Views"])[PublicTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
  ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
  ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof Database["public"]["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof Database["public"]["Enums"]
  ? Database["public"]["Enums"][PublicEnumNameOrOptions]
  : never
