export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  grida_commerce: {
    Tables: {
      inventory_item: {
        Row: {
          available: number
          cost: number | null
          created_at: string
          id: number
          is_negative_level_allowed: boolean
          product_id: number | null
          sku: string
          store_id: number
          variant_id: number | null
        }
        Insert: {
          available?: number
          cost?: number | null
          created_at?: string
          id?: number
          is_negative_level_allowed?: boolean
          product_id?: number | null
          sku: string
          store_id: number
          variant_id?: number | null
        }
        Update: {
          available?: number
          cost?: number | null
          created_at?: string
          id?: number
          is_negative_level_allowed?: boolean
          product_id?: number | null
          sku?: string
          store_id?: number
          variant_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_item_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variant"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_level: {
        Row: {
          available: number
          created_at: string
          id: number
          inventory_item_id: number
        }
        Insert: {
          available?: number
          created_at?: string
          id?: number
          inventory_item_id: number
        }
        Update: {
          available?: number
          created_at?: string
          id?: number
          inventory_item_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_level_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_item"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_level_commit: {
        Row: {
          created_at: string
          diff: number | null
          id: number
          inventory_level_id: number
          reason: Database["grida_commerce"]["Enums"]["inventory_level_commit_reason"]
        }
        Insert: {
          created_at?: string
          diff?: number | null
          id?: number
          inventory_level_id: number
          reason?: Database["grida_commerce"]["Enums"]["inventory_level_commit_reason"]
        }
        Update: {
          created_at?: string
          diff?: number | null
          id?: number
          inventory_level_id?: number
          reason?: Database["grida_commerce"]["Enums"]["inventory_level_commit_reason"]
        }
        Relationships: [
          {
            foreignKeyName: "inventory_level_commit_inventory_level_id_fkey"
            columns: ["inventory_level_id"]
            isOneToOne: false
            referencedRelation: "inventory_level"
            referencedColumns: ["id"]
          },
        ]
      }
      product: {
        Row: {
          body_html: string | null
          created_at: string
          id: number
          name: string
          sku: string | null
          store_id: number
        }
        Insert: {
          body_html?: string | null
          created_at?: string
          id?: number
          name: string
          sku?: string | null
          store_id: number
        }
        Update: {
          body_html?: string | null
          created_at?: string
          id?: number
          name?: string
          sku?: string | null
          store_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option: {
        Row: {
          created_at: string
          id: number
          name: string
          product_id: number
          store_id: number
        }
        Insert: {
          created_at?: string
          id?: number
          name: string
          product_id: number
          store_id: number
        }
        Update: {
          created_at?: string
          id?: number
          name?: string
          product_id?: number
          store_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "option_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "option_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_combination: {
        Row: {
          created_at: string
          id: number
          name: string | null
          option_value_ids: number[]
          product_id: number
          store_id: number
        }
        Insert: {
          created_at?: string
          id?: number
          name?: string | null
          option_value_ids?: number[]
          product_id: number
          store_id: number
        }
        Update: {
          created_at?: string
          id?: number
          name?: string | null
          option_value_ids?: number[]
          product_id?: number
          store_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_option_map_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_option_map_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_combination_value_item: {
        Row: {
          created_at: string
          id: number
          option_combination_id: number
          option_id: number
          option_value_id: number
          product_id: number
          store_id: number
        }
        Insert: {
          created_at?: string
          id?: number
          option_combination_id: number
          option_id: number
          option_value_id: number
          product_id: number
          store_id: number
        }
        Update: {
          created_at?: string
          id?: number
          option_combination_id?: number
          option_id?: number
          option_value_id?: number
          product_id?: number
          store_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_option_map_item_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "product_option"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_option_map_item_option_map_id_fkey"
            columns: ["option_combination_id"]
            isOneToOne: false
            referencedRelation: "product_option_combination"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_option_map_item_option_value_id_fkey"
            columns: ["option_value_id"]
            isOneToOne: false
            referencedRelation: "product_option_value"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_option_map_item_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_option_map_item_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_value: {
        Row: {
          created_at: string
          id: number
          label: string | null
          option_id: number
          product_id: number
          store_id: number
          value: string
        }
        Insert: {
          created_at?: string
          id?: number
          label?: string | null
          option_id: number
          product_id: number
          store_id: number
          value: string
        }
        Update: {
          created_at?: string
          id?: number
          label?: string | null
          option_id?: number
          product_id?: number
          store_id?: number
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "option_value_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "product_option"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "option_value_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "option_value_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variant: {
        Row: {
          compare_at_price: number | null
          created_at: string
          id: number
          inventory_management:
            | Database["grida_commerce"]["Enums"]["inventory_management"]
            | null
          inventory_policy:
            | Database["grida_commerce"]["Enums"]["inventory_policy"]
            | null
          price: number | null
          product_id: number
          product_option_combination_id: number | null
          sku: string
          store_id: number
        }
        Insert: {
          compare_at_price?: number | null
          created_at?: string
          id?: number
          inventory_management?:
            | Database["grida_commerce"]["Enums"]["inventory_management"]
            | null
          inventory_policy?:
            | Database["grida_commerce"]["Enums"]["inventory_policy"]
            | null
          price?: number | null
          product_id: number
          product_option_combination_id?: number | null
          sku: string
          store_id: number
        }
        Update: {
          compare_at_price?: number | null
          created_at?: string
          id?: number
          inventory_management?:
            | Database["grida_commerce"]["Enums"]["inventory_management"]
            | null
          inventory_policy?:
            | Database["grida_commerce"]["Enums"]["inventory_policy"]
            | null
          price?: number | null
          product_id?: number
          product_option_combination_id?: number | null
          sku?: string
          store_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variant_product_option_combination_id_fkey"
            columns: ["product_option_combination_id"]
            isOneToOne: true
            referencedRelation: "product_option_combination"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variant_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store"
            referencedColumns: ["id"]
          },
        ]
      }
      store: {
        Row: {
          created_at: string
          currency: Database["grida_commerce"]["Enums"]["currency"]
          id: number
          name: string
          project_id: number
        }
        Insert: {
          created_at?: string
          currency?: Database["grida_commerce"]["Enums"]["currency"]
          id?: number
          name: string
          project_id: number
        }
        Update: {
          created_at?: string
          currency?: Database["grida_commerce"]["Enums"]["currency"]
          id?: number
          name?: string
          project_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_combinations: {
        Args: {
          options: Json
          index: number
          current: Json
        }
        Returns: Json
      }
      get_inventory_items_with_committed: {
        Args: {
          p_store_id: number
        }
        Returns: {
          id: number
          created_at: string
          sku: string
          store_id: number
          product_id: number
          variant_id: number
          cost: number
          available: number
          committed: number
        }[]
      }
      get_inventory_with_committed: {
        Args: {
          p_store_id: number
          p_sku: string
        }
        Returns: {
          id: number
          created_at: string
          sku: string
          store_id: number
          product_id: number
          variant_id: number
          cost: number
          available: number
          committed: number
        }[]
      }
    }
    Enums: {
      currency:
        | "AED"
        | "AFN"
        | "ALL"
        | "AMD"
        | "ANG"
        | "AOA"
        | "ARS"
        | "AUD"
        | "AWG"
        | "AZN"
        | "BAM"
        | "BBD"
        | "BDT"
        | "BGN"
        | "BHD"
        | "BIF"
        | "BMD"
        | "BND"
        | "BOB"
        | "BRL"
        | "BSD"
        | "BTC"
        | "BTN"
        | "BWP"
        | "BYN"
        | "BZD"
        | "CAD"
        | "CDF"
        | "CHF"
        | "CLF"
        | "CLP"
        | "CNH"
        | "CNY"
        | "COP"
        | "CRC"
        | "CUC"
        | "CUP"
        | "CVE"
        | "CZK"
        | "DJF"
        | "DKK"
        | "DOP"
        | "DZD"
        | "EGP"
        | "ERN"
        | "ETB"
        | "EUR"
        | "FJD"
        | "FKP"
        | "GBP"
        | "GEL"
        | "GGP"
        | "GHS"
        | "GIP"
        | "GMD"
        | "GNF"
        | "GTQ"
        | "GYD"
        | "HKD"
        | "HNL"
        | "HRK"
        | "HTG"
        | "HUF"
        | "IDR"
        | "ILS"
        | "IMP"
        | "INR"
        | "IQD"
        | "IRR"
        | "ISK"
        | "JEP"
        | "JMD"
        | "JOD"
        | "JPY"
        | "KES"
        | "KGS"
        | "KHR"
        | "KMF"
        | "KPW"
        | "KRW"
        | "KWD"
        | "KYD"
        | "KZT"
        | "LAK"
        | "LBP"
        | "LKR"
        | "LRD"
        | "LSL"
        | "LYD"
        | "MAD"
        | "MDL"
        | "MGA"
        | "MKD"
        | "MMK"
        | "MNT"
        | "MOP"
        | "MRU"
        | "MUR"
        | "MVR"
        | "MWK"
        | "MXN"
        | "MYR"
        | "MZN"
        | "NAD"
        | "NGN"
        | "NIO"
        | "NOK"
        | "NPR"
        | "NZD"
        | "OMR"
        | "PAB"
        | "PEN"
        | "PGK"
        | "PHP"
        | "PKR"
        | "PLN"
        | "PYG"
        | "QAR"
        | "RON"
        | "RSD"
        | "RUB"
        | "RWF"
        | "SAR"
        | "SBD"
        | "SCR"
        | "SDG"
        | "SEK"
        | "SGD"
        | "SHP"
        | "SLL"
        | "SOS"
        | "SRD"
        | "SSP"
        | "STN"
        | "SVC"
        | "SYP"
        | "SZL"
        | "THB"
        | "TJS"
        | "TMT"
        | "TND"
        | "TOP"
        | "TRY"
        | "TTD"
        | "TWD"
        | "TZS"
        | "UAH"
        | "UGX"
        | "USD"
        | "UYU"
        | "UZS"
        | "VES"
        | "VND"
        | "VUV"
        | "WST"
        | "XAF"
        | "XCD"
        | "XDR"
        | "XOF"
        | "XPF"
        | "YER"
        | "ZAR"
        | "ZMW"
        | "ZWL"
      inventory_level_commit_reason:
        | "admin"
        | "initialize"
        | "other"
        | "order"
        | "initialize_by_system"
      inventory_management: "none" | "system"
      inventory_policy: "continue" | "deny"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  grida_forms: {
    Tables: {
      connection_commerce_store: {
        Row: {
          created_at: string
          form_id: string
          id: number
          project_id: number
          store_id: number
        }
        Insert: {
          created_at?: string
          form_id: string
          id?: number
          project_id: number
          store_id: number
        }
        Update: {
          created_at?: string
          form_id?: string
          id?: number
          project_id?: number
          store_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "connection_commerce_store_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_connection_store_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: true
            referencedRelation: "form"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_connection_store_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_supabase: {
        Row: {
          created_at: string
          form_id: string
          id: number
          main_supabase_table_id: number | null
          supabase_project_id: number
        }
        Insert: {
          created_at?: string
          form_id: string
          id?: number
          main_supabase_table_id?: number | null
          supabase_project_id: number
        }
        Update: {
          created_at?: string
          form_id?: string
          id?: number
          main_supabase_table_id?: number | null
          supabase_project_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "connection_supabase_project_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: true
            referencedRelation: "form"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_supabase_project_main_supabase_table_id_fkey"
            columns: ["main_supabase_table_id"]
            isOneToOne: false
            referencedRelation: "supabase_table"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_supabase_supabase_project_id_fkey"
            columns: ["supabase_project_id"]
            isOneToOne: false
            referencedRelation: "supabase_project"
            referencedColumns: ["id"]
          },
        ]
      }
      form: {
        Row: {
          created_at: string
          default_form_page_id: string | null
          description: string | null
          id: string
          is_force_closed: boolean
          is_max_form_responses_by_customer_enabled: boolean
          is_max_form_responses_in_total_enabled: boolean
          is_scheduling_enabled: boolean
          max_form_responses_by_customer: number | null
          max_form_responses_in_total: number | null
          name: string
          project_id: number
          scheduling_close_at: string | null
          scheduling_open_at: string | null
          scheduling_tz: string | null
          schema_id: string | null
          title: string
          unknown_field_handling_strategy: Database["grida_forms"]["Enums"]["form_response_unknown_field_handling_strategy_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_form_page_id?: string | null
          description?: string | null
          id?: string
          is_force_closed?: boolean
          is_max_form_responses_by_customer_enabled?: boolean
          is_max_form_responses_in_total_enabled?: boolean
          is_scheduling_enabled?: boolean
          max_form_responses_by_customer?: number | null
          max_form_responses_in_total?: number | null
          name?: string
          project_id: number
          scheduling_close_at?: string | null
          scheduling_open_at?: string | null
          scheduling_tz?: string | null
          schema_id?: string | null
          title?: string
          unknown_field_handling_strategy?: Database["grida_forms"]["Enums"]["form_response_unknown_field_handling_strategy_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_form_page_id?: string | null
          description?: string | null
          id?: string
          is_force_closed?: boolean
          is_max_form_responses_by_customer_enabled?: boolean
          is_max_form_responses_in_total_enabled?: boolean
          is_scheduling_enabled?: boolean
          max_form_responses_by_customer?: number | null
          max_form_responses_in_total?: number | null
          name?: string
          project_id?: number
          scheduling_close_at?: string | null
          scheduling_open_at?: string | null
          scheduling_tz?: string | null
          schema_id?: string | null
          title?: string
          unknown_field_handling_strategy?: Database["grida_forms"]["Enums"]["form_response_unknown_field_handling_strategy_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_schema_id_fkey"
            columns: ["schema_id"]
            isOneToOne: false
            referencedRelation: "schema_document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grida_forms_form_default_form_page_id_fkey"
            columns: ["default_form_page_id"]
            isOneToOne: false
            referencedRelation: "form_document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grida_forms_form_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
        ]
      }
      form_block: {
        Row: {
          body_html: string | null
          created_at: string
          data: Json
          description_html: string | null
          form_field_id: string | null
          form_id: string
          form_page_id: string
          id: string
          local_index: number
          parent_id: string | null
          src: string | null
          title_html: string | null
          type: Database["grida_forms"]["Enums"]["form_block_type"]
          updated_at: string
          v_hidden: Json | null
        }
        Insert: {
          body_html?: string | null
          created_at?: string
          data?: Json
          description_html?: string | null
          form_field_id?: string | null
          form_id: string
          form_page_id: string
          id?: string
          local_index?: number
          parent_id?: string | null
          src?: string | null
          title_html?: string | null
          type: Database["grida_forms"]["Enums"]["form_block_type"]
          updated_at?: string
          v_hidden?: Json | null
        }
        Update: {
          body_html?: string | null
          created_at?: string
          data?: Json
          description_html?: string | null
          form_field_id?: string | null
          form_id?: string
          form_page_id?: string
          id?: string
          local_index?: number
          parent_id?: string | null
          src?: string | null
          title_html?: string | null
          type?: Database["grida_forms"]["Enums"]["form_block_type"]
          updated_at?: string
          v_hidden?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "form_block_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "form"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grida_forms_form_block_form_field_id_fkey"
            columns: ["form_field_id"]
            isOneToOne: false
            referencedRelation: "form_field"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grida_forms_form_block_form_page_id_fkey"
            columns: ["form_page_id"]
            isOneToOne: false
            referencedRelation: "form_document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grida_forms_form_block_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "form_block"
            referencedColumns: ["id"]
          },
        ]
      }
      form_document: {
        Row: {
          __name: string
          background: Json | null
          created_at: string
          ending_page_i18n_overrides: Json | null
          ending_page_template_id: string | null
          form_id: string
          g11n_manifest_id: number | null
          id: string
          is_ending_page_enabled: boolean
          is_powered_by_branding_enabled: boolean
          is_redirect_after_response_uri_enabled: boolean
          lang: Database["public"]["Enums"]["language_code"]
          method: Database["grida_forms"]["Enums"]["form_method"]
          project_id: number
          redirect_after_response_uri: string | null
          stylesheet: Json | null
        }
        Insert: {
          __name?: string
          background?: Json | null
          created_at?: string
          ending_page_i18n_overrides?: Json | null
          ending_page_template_id?: string | null
          form_id: string
          g11n_manifest_id?: number | null
          id: string
          is_ending_page_enabled?: boolean
          is_powered_by_branding_enabled?: boolean
          is_redirect_after_response_uri_enabled?: boolean
          lang?: Database["public"]["Enums"]["language_code"]
          method?: Database["grida_forms"]["Enums"]["form_method"]
          project_id: number
          redirect_after_response_uri?: string | null
          stylesheet?: Json | null
        }
        Update: {
          __name?: string
          background?: Json | null
          created_at?: string
          ending_page_i18n_overrides?: Json | null
          ending_page_template_id?: string | null
          form_id?: string
          g11n_manifest_id?: number | null
          id?: string
          is_ending_page_enabled?: boolean
          is_powered_by_branding_enabled?: boolean
          is_redirect_after_response_uri_enabled?: boolean
          lang?: Database["public"]["Enums"]["language_code"]
          method?: Database["grida_forms"]["Enums"]["form_method"]
          project_id?: number
          redirect_after_response_uri?: string | null
          stylesheet?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "form_document_g11n_manifest_id_fkey"
            columns: ["g11n_manifest_id"]
            isOneToOne: false
            referencedRelation: "manifest"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_document_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_document_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grida_forms_form_page_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: true
            referencedRelation: "form"
            referencedColumns: ["id"]
          },
        ]
      }
      form_editor_metadata: {
        Row: {
          form_id: string | null
          id: number
          project_id: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          form_id?: string | null
          id?: number
          project_id?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          form_id?: string | null
          id?: number
          project_id?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grida_forms_editor_metadata_last_active_form_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "form"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grida_forms_editor_metadata_last_active_form_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grida_forms_editor_metadata_last_active_form_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      form_field: {
        Row: {
          accept: string | null
          alt: string | null
          autocomplete:
            | Database["grida_forms"]["Enums"]["form_field_autocomplete_type"][]
            | null
          created_at: string
          data: Json | null
          description: string | null
          form_id: string
          help_text: string | null
          id: string
          is_array: boolean
          label: string | null
          local_index: number
          max: number | null
          maxlength: number | null
          min: number | null
          minlength: number | null
          multiple: boolean | null
          name: string
          pattern: Json | null
          placeholder: string | null
          readonly: boolean
          reference: Json | null
          required: boolean
          step: number | null
          storage: Json | null
          type: Database["grida_forms"]["Enums"]["form_field_type"]
          updated_at: string
          v_value: Json | null
        }
        Insert: {
          accept?: string | null
          alt?: string | null
          autocomplete?:
            | Database["grida_forms"]["Enums"]["form_field_autocomplete_type"][]
            | null
          created_at?: string
          data?: Json | null
          description?: string | null
          form_id: string
          help_text?: string | null
          id?: string
          is_array?: boolean
          label?: string | null
          local_index?: number
          max?: number | null
          maxlength?: number | null
          min?: number | null
          minlength?: number | null
          multiple?: boolean | null
          name: string
          pattern?: Json | null
          placeholder?: string | null
          readonly?: boolean
          reference?: Json | null
          required?: boolean
          step?: number | null
          storage?: Json | null
          type?: Database["grida_forms"]["Enums"]["form_field_type"]
          updated_at?: string
          v_value?: Json | null
        }
        Update: {
          accept?: string | null
          alt?: string | null
          autocomplete?:
            | Database["grida_forms"]["Enums"]["form_field_autocomplete_type"][]
            | null
          created_at?: string
          data?: Json | null
          description?: string | null
          form_id?: string
          help_text?: string | null
          id?: string
          is_array?: boolean
          label?: string | null
          local_index?: number
          max?: number | null
          maxlength?: number | null
          min?: number | null
          minlength?: number | null
          multiple?: boolean | null
          name?: string
          pattern?: Json | null
          placeholder?: string | null
          readonly?: boolean
          reference?: Json | null
          required?: boolean
          step?: number | null
          storage?: Json | null
          type?: Database["grida_forms"]["Enums"]["form_field_type"]
          updated_at?: string
          v_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "grida_forms_form_field_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "form"
            referencedColumns: ["id"]
          },
        ]
      }
      form_field_option: {
        Row: {
          created_at: string
          disabled: boolean | null
          form_field_id: string
          form_id: string
          id: string
          index: number
          label: string
          optgroup_id: string | null
          src: string | null
          value: string
        }
        Insert: {
          created_at?: string
          disabled?: boolean | null
          form_field_id: string
          form_id: string
          id?: string
          index?: number
          label?: string
          optgroup_id?: string | null
          src?: string | null
          value: string
        }
        Update: {
          created_at?: string
          disabled?: boolean | null
          form_field_id?: string
          form_id?: string
          id?: string
          index?: number
          label?: string
          optgroup_id?: string | null
          src?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_field_option_optgroup_id_fkey"
            columns: ["optgroup_id"]
            isOneToOne: false
            referencedRelation: "optgroup"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grida_forms_form_field_option_form_field_id_fkey"
            columns: ["form_field_id"]
            isOneToOne: false
            referencedRelation: "form_field"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grida_forms_form_field_option_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "form"
            referencedColumns: ["id"]
          },
        ]
      }
      form_template: {
        Row: {
          created_at: string
          description: string
          form_id: string
          id: number
          is_public: boolean
          preview_path: string
          title: string
        }
        Insert: {
          created_at?: string
          description: string
          form_id: string
          id?: number
          is_public?: boolean
          preview_path: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          form_id?: string
          id?: number
          is_public?: boolean
          preview_path?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_template_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "form"
            referencedColumns: ["id"]
          },
        ]
      }
      gist: {
        Row: {
          created_at: string
          data: Json | null
          id: number
          is_public: boolean
          prompt: string | null
          slug: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: number
          is_public?: boolean
          prompt?: string | null
          slug?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: number
          is_public?: boolean
          prompt?: string | null
          slug?: string | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "playground_gist_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      optgroup: {
        Row: {
          created_at: string
          disabled: boolean
          form_field_id: string
          form_id: string
          id: string
          index: number
          label: string
        }
        Insert: {
          created_at?: string
          disabled?: boolean
          form_field_id: string
          form_id: string
          id?: string
          index?: number
          label: string
        }
        Update: {
          created_at?: string
          disabled?: boolean
          form_field_id?: string
          form_id?: string
          id?: string
          index?: number
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "optgroup_form_field_id_fkey"
            columns: ["form_field_id"]
            isOneToOne: false
            referencedRelation: "form_field"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "optgroup_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "form"
            referencedColumns: ["id"]
          },
        ]
      }
      response: {
        Row: {
          browser: string | null
          created_at: string
          customer_id: string | null
          form_id: string
          geo: Json | null
          id: string
          ip: string | null
          local_id: string | null
          local_index: number
          platform_powered_by:
            | Database["grida_forms"]["Enums"]["response_platform_powered_by"]
            | null
          raw: Json
          session_id: string | null
          updated_at: string
          x_ipinfo: Json | null
          x_referer: string | null
          x_useragent: string | null
        }
        Insert: {
          browser?: string | null
          created_at?: string
          customer_id?: string | null
          form_id: string
          geo?: Json | null
          id?: string
          ip?: string | null
          local_id?: string | null
          local_index?: number
          platform_powered_by?:
            | Database["grida_forms"]["Enums"]["response_platform_powered_by"]
            | null
          raw: Json
          session_id?: string | null
          updated_at?: string
          x_ipinfo?: Json | null
          x_referer?: string | null
          x_useragent?: string | null
        }
        Update: {
          browser?: string | null
          created_at?: string
          customer_id?: string | null
          form_id?: string
          geo?: Json | null
          id?: string
          ip?: string | null
          local_id?: string | null
          local_index?: number
          platform_powered_by?:
            | Database["grida_forms"]["Enums"]["response_platform_powered_by"]
            | null
          raw?: Json
          session_id?: string | null
          updated_at?: string
          x_ipinfo?: Json | null
          x_referer?: string | null
          x_useragent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grida_forms_response_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["uid"]
          },
          {
            foreignKeyName: "grida_forms_response_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "form"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "response_session"
            referencedColumns: ["id"]
          },
        ]
      }
      response_field: {
        Row: {
          created_at: string
          form_field_id: string
          form_field_option_id: string | null
          form_field_option_ids: string[] | null
          form_id: string | null
          id: string
          response_id: string
          storage_object_paths: string[] | null
          type: Database["grida_forms"]["Enums"]["form_field_type"]
          updated_at: string
          value: Json | null
        }
        Insert: {
          created_at?: string
          form_field_id: string
          form_field_option_id?: string | null
          form_field_option_ids?: string[] | null
          form_id?: string | null
          id?: string
          response_id: string
          storage_object_paths?: string[] | null
          type?: Database["grida_forms"]["Enums"]["form_field_type"]
          updated_at?: string
          value?: Json | null
        }
        Update: {
          created_at?: string
          form_field_id?: string
          form_field_option_id?: string | null
          form_field_option_ids?: string[] | null
          form_id?: string | null
          id?: string
          response_id?: string
          storage_object_paths?: string[] | null
          type?: Database["grida_forms"]["Enums"]["form_field_type"]
          updated_at?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "grida_forms_response_field_form_field_id_fkey"
            columns: ["form_field_id"]
            isOneToOne: false
            referencedRelation: "form_field"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grida_forms_response_field_form_field_option_id_fkey"
            columns: ["form_field_option_id"]
            isOneToOne: false
            referencedRelation: "form_field_option"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grida_forms_response_field_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "form"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grida_forms_response_field_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "response"
            referencedColumns: ["id"]
          },
        ]
      }
      response_session: {
        Row: {
          browser: string | null
          created_at: string
          customer_id: string | null
          form_id: string
          geo: Json | null
          id: string
          ip: string | null
          platform_powered_by:
            | Database["grida_forms"]["Enums"]["response_platform_powered_by"]
            | null
          raw: Json | null
          updated_at: string
          visitor_id: string | null
          x_ipinfo: Json | null
          x_referer: string | null
          x_useragent: string | null
        }
        Insert: {
          browser?: string | null
          created_at?: string
          customer_id?: string | null
          form_id: string
          geo?: Json | null
          id?: string
          ip?: string | null
          platform_powered_by?:
            | Database["grida_forms"]["Enums"]["response_platform_powered_by"]
            | null
          raw?: Json | null
          updated_at?: string
          visitor_id?: string | null
          x_ipinfo?: Json | null
          x_referer?: string | null
          x_useragent?: string | null
        }
        Update: {
          browser?: string | null
          created_at?: string
          customer_id?: string | null
          form_id?: string
          geo?: Json | null
          id?: string
          ip?: string | null
          platform_powered_by?:
            | Database["grida_forms"]["Enums"]["response_platform_powered_by"]
            | null
          raw?: Json | null
          updated_at?: string
          visitor_id?: string | null
          x_ipinfo?: Json | null
          x_referer?: string | null
          x_useragent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "response_session_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["uid"]
          },
          {
            foreignKeyName: "response_session_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "form"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_session_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: true
            referencedRelation: "visitor"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_document: {
        Row: {
          id: string
          name: string
          project_id: number
        }
        Insert: {
          id: string
          name: string
          project_id: number
        }
        Update: {
          id?: string
          name?: string
          project_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "schema_document_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schema_document_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      core_check_max_responses: {
        Args: {
          p_form_id: string
        }
        Returns: undefined
      }
      rpc_check_max_responses: {
        Args: {
          form_id: string
        }
        Returns: undefined
      }
      set_response_session_field_value: {
        Args: {
          session_id: string
          key: string
          value: Json
        }
        Returns: undefined
      }
    }
    Enums: {
      form_block_type:
        | "section"
        | "group"
        | "field"
        | "html"
        | "image"
        | "video"
        | "divider"
        | "header"
        | "pdf"
      form_field_autocomplete_type:
        | "off"
        | "on"
        | "name"
        | "honorific-prefix"
        | "given-name"
        | "additional-name"
        | "family-name"
        | "honorific-suffix"
        | "nickname"
        | "email"
        | "username"
        | "new-password"
        | "current-password"
        | "one-time-code"
        | "organization-title"
        | "organization"
        | "street-address"
        | "shipping"
        | "billing"
        | "address-line1"
        | "address-line2"
        | "address-line3"
        | "address-level4"
        | "address-level3"
        | "address-level2"
        | "address-level1"
        | "country"
        | "country-name"
        | "postal-code"
        | "cc-name"
        | "cc-given-name"
        | "cc-additional-name"
        | "cc-family-name"
        | "cc-number"
        | "cc-exp"
        | "cc-exp-month"
        | "cc-exp-year"
        | "cc-csc"
        | "cc-type"
        | "transaction-currency"
        | "transaction-amount"
        | "language"
        | "bday"
        | "bday-day"
        | "bday-month"
        | "bday-year"
        | "sex"
        | "tel"
        | "tel-country-code"
        | "tel-national"
        | "tel-area-code"
        | "tel-local"
        | "tel-extension"
        | "impp"
        | "url"
        | "photo"
        | "webauthn"
      form_field_type:
        | "text"
        | "textarea"
        | "richtext"
        | "tel"
        | "url"
        | "checkbox"
        | "checkboxes"
        | "switch"
        | "toggle"
        | "toggle-group"
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
        | "country"
        | "payment"
        | "hidden"
        | "signature"
        | "number"
        | "time"
        | "datetime-local"
        | "range"
        | "search"
        | "audio"
        | "video"
        | "json"
      form_method: "post" | "get" | "dialog"
      form_response_unknown_field_handling_strategy_type:
        | "ignore"
        | "accept"
        | "reject"
      response_platform_powered_by:
        | "api"
        | "grida_forms"
        | "web_client"
        | "simulator"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  grida_forms_secure: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_secret_connection_supabase_service_key: {
        Args: {
          p_supabase_project_id: number
          p_secret: string
        }
        Returns: string
      }
      reveal_secret_connection_supabase_service_key: {
        Args: {
          p_supabase_project_id: number
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  grida_g11n: {
    Tables: {
      key: {
        Row: {
          created_at: string
          description: string | null
          id: number
          keypath: string[]
          manifest_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: number
          keypath: string[]
          manifest_id: number
          updated_at: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: number
          keypath?: string[]
          manifest_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "key_manifest_id_fkey"
            columns: ["manifest_id"]
            isOneToOne: false
            referencedRelation: "manifest"
            referencedColumns: ["id"]
          },
        ]
      }
      locale: {
        Row: {
          code: string
          created_at: string
          id: number
          manifest_id: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: number
          manifest_id: number
          updated_at: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: number
          manifest_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locale_manifest_id_fkey"
            columns: ["manifest_id"]
            isOneToOne: false
            referencedRelation: "manifest"
            referencedColumns: ["id"]
          },
        ]
      }
      manifest: {
        Row: {
          created_at: string
          default_locale_id: number | null
          id: number
          project_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_locale_id?: number | null
          id?: number
          project_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_locale_id?: number | null
          id?: number
          project_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manifest_default_locale_id_fkey"
            columns: ["default_locale_id"]
            isOneToOne: true
            referencedRelation: "locale"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manifest_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
        ]
      }
      resource: {
        Row: {
          created_at: string
          id: number
          key_id: number
          locale_id: number
          manifest_id: number
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: number
          key_id: number
          locale_id: number
          manifest_id: number
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          id?: number
          key_id?: number
          locale_id?: number
          manifest_id?: number
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "value_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "key"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "value_locale_id_fkey"
            columns: ["locale_id"]
            isOneToOne: false
            referencedRelation: "locale"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "value_manifest_id_fkey"
            columns: ["manifest_id"]
            isOneToOne: false
            referencedRelation: "manifest"
            referencedColumns: ["id"]
          },
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
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  grida_sites: {
    Tables: {
      site_document: {
        Row: {
          created_at: string
          data: Json
          id: string
        }
        Insert: {
          created_at?: string
          data: Json
          id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_document_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
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
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  grida_x_supabase: {
    Tables: {
      supabase_project: {
        Row: {
          created_at: string
          id: number
          project_id: number
          sb_anon_key: string
          sb_project_reference_id: string
          sb_project_url: string
          sb_public_schema: Json
          sb_schema_definitions: Json
          sb_schema_names: string[]
          sb_schema_openapi_docs: Json
          sb_service_key_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          project_id: number
          sb_anon_key: string
          sb_project_reference_id: string
          sb_project_url: string
          sb_public_schema: Json
          sb_schema_definitions: Json
          sb_schema_names?: string[]
          sb_schema_openapi_docs: Json
          sb_service_key_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          project_id?: number
          sb_anon_key?: string
          sb_project_reference_id?: string
          sb_project_url?: string
          sb_public_schema?: Json
          sb_schema_definitions?: Json
          sb_schema_names?: string[]
          sb_schema_openapi_docs?: Json
          sb_service_key_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_supabase_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supabase_project_sb_service_key_id_fkey"
            columns: ["sb_service_key_id"]
            isOneToOne: false
            referencedRelation: "decrypted_secrets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supabase_project_sb_service_key_id_fkey"
            columns: ["sb_service_key_id"]
            isOneToOne: false
            referencedRelation: "secrets"
            referencedColumns: ["id"]
          },
        ]
      }
      supabase_table: {
        Row: {
          created_at: string
          id: number
          sb_postgrest_methods: Database["grida_x_supabase"]["Enums"]["sb_postgrest_method"][]
          sb_schema_name: string
          sb_table_name: string
          sb_table_schema: Json
          supabase_project_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          sb_postgrest_methods: Database["grida_x_supabase"]["Enums"]["sb_postgrest_method"][]
          sb_schema_name: string
          sb_table_name: string
          sb_table_schema: Json
          supabase_project_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          sb_postgrest_methods?: Database["grida_x_supabase"]["Enums"]["sb_postgrest_method"][]
          sb_schema_name?: string
          sb_table_name?: string
          sb_table_schema?: Json
          supabase_project_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supabase_table_supabase_project_id_fkey"
            columns: ["supabase_project_id"]
            isOneToOne: false
            referencedRelation: "supabase_project"
            referencedColumns: ["id"]
          },
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
      sb_postgrest_method: "get" | "post" | "delete" | "patch"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      customer: {
        Row: {
          _fp_fingerprintjs_visitorid: string | null
          created_at: string
          email: string | null
          email_provisional: string[]
          is_email_verified: boolean
          is_phone_verified: boolean
          last_seen_at: string
          name_provisional: string[]
          phone: string | null
          phone_provisional: string[]
          project_id: number
          uid: string
          uuid: string | null
          visitor_id: string | null
        }
        Insert: {
          _fp_fingerprintjs_visitorid?: string | null
          created_at?: string
          email?: string | null
          email_provisional?: string[]
          is_email_verified?: boolean
          is_phone_verified?: boolean
          last_seen_at?: string
          name_provisional?: string[]
          phone?: string | null
          phone_provisional?: string[]
          project_id: number
          uid?: string
          uuid?: string | null
          visitor_id?: string | null
        }
        Update: {
          _fp_fingerprintjs_visitorid?: string | null
          created_at?: string
          email?: string | null
          email_provisional?: string[]
          is_email_verified?: boolean
          is_phone_verified?: boolean
          last_seen_at?: string
          name_provisional?: string[]
          phone?: string | null
          phone_provisional?: string[]
          project_id?: number
          uid?: string
          uuid?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: true
            referencedRelation: "visitor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_customer_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
        ]
      }
      document: {
        Row: {
          created_at: string
          doctype: Database["public"]["Enums"]["doctype"]
          id: string
          project_id: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          doctype: Database["public"]["Enums"]["doctype"]
          id?: string
          project_id: number
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          doctype?: Database["public"]["Enums"]["doctype"]
          id?: string
          project_id?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
        ]
      }
      dummy: {
        Row: {
          created_at: string
          data: Json | null
          enum: Database["grida_commerce"]["Enums"]["currency"] | null
          float4: number | null
          float8: number | null
          id: number
          int2: number | null
          int4: number | null
          jsonb: Json | null
          numeric: number | null
          richtext: Json | null
          text: string | null
          text_arr: string[] | null
          timestamptz: string | null
          user_id: string | null
          varchar: string | null
        }
        Insert: {
          created_at?: string
          data?: Json | null
          enum?: Database["grida_commerce"]["Enums"]["currency"] | null
          float4?: number | null
          float8?: number | null
          id?: number
          int2?: number | null
          int4?: number | null
          jsonb?: Json | null
          numeric?: number | null
          richtext?: Json | null
          text?: string | null
          text_arr?: string[] | null
          timestamptz?: string | null
          user_id?: string | null
          varchar?: string | null
        }
        Update: {
          created_at?: string
          data?: Json | null
          enum?: Database["grida_commerce"]["Enums"]["currency"] | null
          float4?: number | null
          float8?: number | null
          id?: number
          int2?: number | null
          int4?: number | null
          jsonb?: Json | null
          numeric?: number | null
          richtext?: Json | null
          text?: string | null
          text_arr?: string[] | null
          timestamptz?: string | null
          user_id?: string | null
          varchar?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dummy_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      organization: {
        Row: {
          avatar_path: string | null
          blog: string | null
          created_at: string
          description: string | null
          display_name: string
          email: string | null
          id: number
          name: string
          owner_id: string
        }
        Insert: {
          avatar_path?: string | null
          blog?: string | null
          created_at?: string
          description?: string | null
          display_name?: string
          email?: string | null
          id?: number
          name: string
          owner_id?: string
        }
        Update: {
          avatar_path?: string | null
          blog?: string | null
          created_at?: string
          description?: string | null
          display_name?: string
          email?: string | null
          id?: number
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_organization_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
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
          },
        ]
      }
      project: {
        Row: {
          created_at: string
          id: number
          name: string
          organization_id: number
          ref_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          name: string
          organization_id: number
          ref_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          name?: string
          organization_id?: number
          ref_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_project_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      user_project_access_state: {
        Row: {
          project_id: number
          updated_at: string
          user_id: string
        }
        Insert: {
          project_id: number
          updated_at?: string
          user_id: string
        }
        Update: {
          project_id?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_project_access_state_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_project_access_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      visitor: {
        Row: {
          created_at: string
          fingerprint_visitor_id: string | null
          id: string
          ip: unknown | null
          project_id: number
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          fingerprint_visitor_id?: string | null
          id?: string
          ip?: unknown | null
          project_id: number
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          fingerprint_visitor_id?: string | null
          id?: string
          ip?: unknown | null
          project_id?: number
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visitor_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      dummy_with_user: {
        Row: {
          created_at: string | null
          data: Json | null
          email: string | null
          enum: Database["grida_commerce"]["Enums"]["currency"] | null
          float4: number | null
          float8: number | null
          id: number | null
          int2: number | null
          int4: number | null
          jsonb: Json | null
          numeric: number | null
          richtext: Json | null
          text: string | null
          timestamptz: string | null
          user_id: string | null
          varchar: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dummy_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      generate_combinations:
        | {
            Args: {
              option_ids: number[]
              product_id: number
              store_id: number
            }
            Returns: undefined
          }
        | {
            Args: {
              product_id: number
              option_value_combinations: number[]
            }
            Returns: undefined
          }
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
      rls_manifest: {
        Args: {
          p_manifest_id: number
        }
        Returns: boolean
      }
      rls_organization: {
        Args: {
          p_organization_id: number
        }
        Returns: boolean
      }
      rls_project: {
        Args: {
          project_id: number
        }
        Returns: boolean
      }
      workspace_documents: {
        Args: {
          p_organization_id: number
        }
        Returns: {
          id: string
          created_at: string
          updated_at: string
          doctype: Database["public"]["Enums"]["doctype"]
          project_id: number
          title: string
          form_id: string
          organization_id: number
          has_connection_supabase: boolean
          responses: number
          max_responses: number
        }[]
      }
    }
    Enums: {
      doctype: "v0_form" | "v0_site" | "v0_schema"
      language_code:
        | "en"
        | "ko"
        | "es"
        | "de"
        | "ja"
        | "fr"
        | "pt"
        | "it"
        | "ru"
        | "zh"
        | "ar"
        | "hi"
        | "nl"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never
