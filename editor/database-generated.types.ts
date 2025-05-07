export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  grida_canvas: {
    Tables: {
      canvas_document: {
        Row: {
          __schema_version: string
          created_at: string
          data: Json
          id: string
        }
        Insert: {
          __schema_version?: string
          created_at?: string
          data: Json
          id: string
        }
        Update: {
          __schema_version?: string
          created_at?: string
          data?: Json
          id?: string
        }
        Relationships: []
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
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_combinations: {
        Args: { options: Json; index: number; current: Json }
        Returns: Json
      }
      get_inventory_items_with_committed: {
        Args: { p_store_id: number }
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
        Args: { p_store_id: number; p_sku: string }
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
      attribute: {
        Row: {
          accept: string | null
          autocomplete:
            | Database["grida_forms"]["Enums"]["input_autocomplete_type"][]
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
          autocomplete?:
            | Database["grida_forms"]["Enums"]["input_autocomplete_type"][]
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
          autocomplete?:
            | Database["grida_forms"]["Enums"]["input_autocomplete_type"][]
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
            foreignKeyName: "form_connection_store_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: true
            referencedRelation: "form"
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
            referencedRelation: "attribute"
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
          start_page: Json | null
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
          start_page?: Json | null
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
          start_page?: Json | null
          stylesheet?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "grida_forms_form_page_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: true
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
        Relationships: []
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
            referencedRelation: "attribute"
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
      option: {
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
            referencedRelation: "attribute"
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
      relation_view: {
        Row: {
          created_at: string
          id: number
          relation_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          relation_id: string
        }
        Update: {
          created_at?: string
          id?: number
          relation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schema_table_view_schema_table_id_fkey"
            columns: ["relation_id"]
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
            referencedRelation: "attribute"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grida_forms_response_field_form_field_option_id_fkey"
            columns: ["form_field_option_id"]
            isOneToOne: false
            referencedRelation: "option"
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
            foreignKeyName: "response_session_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "form"
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
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      core_check_max_responses: {
        Args: { p_form_id: string }
        Returns: undefined
      }
      rls_form: {
        Args: { p_form_id: string }
        Returns: boolean
      }
      rpc_check_max_responses: {
        Args: { form_id: string }
        Returns: undefined
      }
      set_response_session_field_value: {
        Args: { session_id: string; key: string; value: Json }
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
        | "canvas"
      form_method: "post" | "get" | "dialog"
      form_response_unknown_field_handling_strategy_type:
        | "ignore"
        | "accept"
        | "reject"
      input_autocomplete_type:
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
        Args: { p_supabase_project_id: number; p_secret: string }
        Returns: string
      }
      reveal_secret_connection_supabase_service_key: {
        Args: { p_supabase_project_id: number }
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
  grida_library: {
    Tables: {
      author: {
        Row: {
          avatar_url: string | null
          blog: string | null
          created_at: string
          id: string
          name: string
          provider: string | null
          updated_at: string
          user_id: string | null
          username: string
        }
        Insert: {
          avatar_url?: string | null
          blog?: string | null
          created_at?: string
          id?: string
          name: string
          provider?: string | null
          updated_at?: string
          user_id?: string | null
          username: string
        }
        Update: {
          avatar_url?: string | null
          blog?: string | null
          created_at?: string
          id?: string
          name?: string
          provider?: string | null
          updated_at?: string
          user_id?: string | null
          username?: string
        }
        Relationships: []
      }
      category: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      collection: {
        Row: {
          author_id: string | null
          cover_object_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          cover_object_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          cover_object_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "author"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_cover_object_id_fkey"
            columns: ["cover_object_id"]
            isOneToOne: false
            referencedRelation: "object"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_object: {
        Row: {
          collection_id: string
          object_id: string
        }
        Insert: {
          collection_id: string
          object_id: string
        }
        Update: {
          collection_id?: string
          object_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_object_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_object_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "object"
            referencedColumns: ["id"]
          },
        ]
      }
      object: {
        Row: {
          alt: string | null
          author_id: string | null
          background: string | null
          bytes: number
          categories: unknown[]
          category: string
          color: string | null
          colors: unknown[]
          created_at: string
          description: string | null
          entropy: number | null
          fill: string | null
          generator: string | null
          gravity_x: number | null
          gravity_y: number | null
          height: number
          id: string
          keywords: string[]
          lang: string | null
          license: string
          mimetype: string
          objects: string[]
          orientation: Database["grida_library"]["Enums"]["orientation"] | null
          path: string
          path_tokens: string[] | null
          priority: number | null
          prompt: string | null
          public_domain: boolean
          score: number | null
          search_tsv: unknown | null
          sys_annotations: string[]
          title: string | null
          transparency: boolean
          updated_at: string
          version: number
          width: number
          year: number | null
        }
        Insert: {
          alt?: string | null
          author_id?: string | null
          background?: string | null
          bytes: number
          categories?: unknown[]
          category: string
          color?: string | null
          colors?: unknown[]
          created_at?: string
          description?: string | null
          entropy?: number | null
          fill?: string | null
          generator?: string | null
          gravity_x?: number | null
          gravity_y?: number | null
          height: number
          id: string
          keywords?: string[]
          lang?: string | null
          license?: string
          mimetype: string
          objects?: string[]
          orientation?: Database["grida_library"]["Enums"]["orientation"] | null
          path: string
          path_tokens?: string[] | null
          priority?: number | null
          prompt?: string | null
          public_domain?: boolean
          score?: number | null
          search_tsv?: unknown | null
          sys_annotations?: string[]
          title?: string | null
          transparency: boolean
          updated_at?: string
          version?: number
          width: number
          year?: number | null
        }
        Update: {
          alt?: string | null
          author_id?: string | null
          background?: string | null
          bytes?: number
          categories?: unknown[]
          category?: string
          color?: string | null
          colors?: unknown[]
          created_at?: string
          description?: string | null
          entropy?: number | null
          fill?: string | null
          generator?: string | null
          gravity_x?: number | null
          gravity_y?: number | null
          height?: number
          id?: string
          keywords?: string[]
          lang?: string | null
          license?: string
          mimetype?: string
          objects?: string[]
          orientation?: Database["grida_library"]["Enums"]["orientation"] | null
          path?: string
          path_tokens?: string[] | null
          priority?: number | null
          prompt?: string | null
          public_domain?: boolean
          score?: number | null
          search_tsv?: unknown | null
          sys_annotations?: string[]
          title?: string | null
          transparency?: boolean
          updated_at?: string
          version?: number
          width?: number
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_object_category"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "category"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "author"
            referencedColumns: ["id"]
          },
        ]
      }
      object_embedding: {
        Row: {
          created_at: string | null
          embedding: string | null
          object_id: string
        }
        Insert: {
          created_at?: string | null
          embedding?: string | null
          object_id: string
        }
        Update: {
          created_at?: string | null
          embedding?: string | null
          object_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "object_embedding_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: true
            referencedRelation: "object"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      random: {
        Args: { p_limit?: number }
        Returns: {
          alt: string | null
          author_id: string | null
          background: string | null
          bytes: number
          categories: unknown[]
          category: string
          color: string | null
          colors: unknown[]
          created_at: string
          description: string | null
          entropy: number | null
          fill: string | null
          generator: string | null
          gravity_x: number | null
          gravity_y: number | null
          height: number
          id: string
          keywords: string[]
          lang: string | null
          license: string
          mimetype: string
          objects: string[]
          orientation: Database["grida_library"]["Enums"]["orientation"] | null
          path: string
          path_tokens: string[] | null
          priority: number | null
          prompt: string | null
          public_domain: boolean
          score: number | null
          search_tsv: unknown | null
          sys_annotations: string[]
          title: string | null
          transparency: boolean
          updated_at: string
          version: number
          width: number
          year: number | null
        }[]
      }
      similar: {
        Args: { ref_id: string }
        Returns: {
          alt: string | null
          author_id: string | null
          background: string | null
          bytes: number
          categories: unknown[]
          category: string
          color: string | null
          colors: unknown[]
          created_at: string
          description: string | null
          entropy: number | null
          fill: string | null
          generator: string | null
          gravity_x: number | null
          gravity_y: number | null
          height: number
          id: string
          keywords: string[]
          lang: string | null
          license: string
          mimetype: string
          objects: string[]
          orientation: Database["grida_library"]["Enums"]["orientation"] | null
          path: string
          path_tokens: string[] | null
          priority: number | null
          prompt: string | null
          public_domain: boolean
          score: number | null
          search_tsv: unknown | null
          sys_annotations: string[]
          title: string | null
          transparency: boolean
          updated_at: string
          version: number
          width: number
          year: number | null
        }[]
      }
    }
    Enums: {
      orientation: "portrait" | "landscape" | "square"
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
        Relationships: []
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
  grida_storage: {
    Tables: {
      bucket_document: {
        Row: {
          created_at: string
          id: string
          name: string
          project_id: number
          public: boolean
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          project_id: number
          public?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          project_id?: number
          public?: boolean
        }
        Relationships: []
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
  grida_west_referral: {
    Tables: {
      campaign: {
        Row: {
          conversion_currency: string
          conversion_value: number | null
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          is_invitee_profile_exposed_to_public_dangerously: boolean
          is_referrer_profile_exposed_to_public_dangerously: boolean
          layout_id: string | null
          max_invitations_per_referrer: number | null
          metadata: Json | null
          project_id: number
          public: Json | null
          reward_currency: string
          scheduling_close_at: string | null
          scheduling_open_at: string | null
          scheduling_tz: string | null
          title: string
        }
        Insert: {
          conversion_currency?: string
          conversion_value?: number | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          id: string
          is_invitee_profile_exposed_to_public_dangerously?: boolean
          is_referrer_profile_exposed_to_public_dangerously?: boolean
          layout_id?: string | null
          max_invitations_per_referrer?: number | null
          metadata?: Json | null
          project_id: number
          public?: Json | null
          reward_currency?: string
          scheduling_close_at?: string | null
          scheduling_open_at?: string | null
          scheduling_tz?: string | null
          title: string
        }
        Update: {
          conversion_currency?: string
          conversion_value?: number | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          is_invitee_profile_exposed_to_public_dangerously?: boolean
          is_referrer_profile_exposed_to_public_dangerously?: boolean
          layout_id?: string | null
          max_invitations_per_referrer?: number | null
          metadata?: Json | null
          project_id?: number
          public?: Json | null
          reward_currency?: string
          scheduling_close_at?: string | null
          scheduling_open_at?: string | null
          scheduling_tz?: string | null
          title?: string
        }
        Relationships: []
      }
      campaign_challenge: {
        Row: {
          campaign_id: string
          depends_on: string | null
          description: string | null
          event_id: string
          id: string
          index: number
        }
        Insert: {
          campaign_id: string
          depends_on?: string | null
          description?: string | null
          event_id: string
          id?: string
          index: number
        }
        Update: {
          campaign_id?: string
          depends_on?: string | null
          description?: string | null
          event_id?: string
          id?: string
          index?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_challenge_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_challenge_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_challenge_depends_on_fkey"
            columns: ["depends_on"]
            isOneToOne: false
            referencedRelation: "campaign_challenge"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_challenge_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "campaign_wellknown_event"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_invitee_onboarding_reward: {
        Row: {
          campaign_id: string
          created_at: string | null
          id: string
          metadata: Json | null
          reward_description: string
          reward_value: number | null
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          reward_description: string
          reward_value?: number | null
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          reward_description?: string
          reward_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_invitee_onboarding_reward_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_invitee_onboarding_reward_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaign_public"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_referrer_milestone_reward: {
        Row: {
          campaign_id: string
          created_at: string | null
          id: string
          metadata: Json | null
          reward_description: string
          reward_value: number | null
          threshold_count: number
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          reward_description: string
          reward_value?: number | null
          threshold_count: number
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          reward_description?: string
          reward_value?: number | null
          threshold_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_referrer_milestone_reward_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_referrer_milestone_reward_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_public"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_wellknown_event: {
        Row: {
          campaign_id: string
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_wellknown_event_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_wellknown_event_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_public"
            referencedColumns: ["id"]
          },
        ]
      }
      code: {
        Row: {
          campaign_id: string
          code: string
          created_at: string
          id: number
        }
        Insert: {
          campaign_id: string
          code?: string
          created_at?: string
          id?: number
        }
        Update: {
          campaign_id?: string
          code?: string
          created_at?: string
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "code_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_public"
            referencedColumns: ["id"]
          },
        ]
      }
      event_log: {
        Row: {
          campaign_id: string
          customer_id: string | null
          data: Json | null
          name: string
          onboarding_id: string | null
          referrer_id: string | null
          time: string
        }
        Insert: {
          campaign_id: string
          customer_id?: string | null
          data?: Json | null
          name: string
          onboarding_id?: string | null
          referrer_id?: string | null
          time?: string
        }
        Update: {
          campaign_id?: string
          customer_id?: string | null
          data?: Json | null
          name?: string
          onboarding_id?: string | null
          referrer_id?: string | null
          time?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_log_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["uid"]
          },
          {
            foreignKeyName: "event_log_onboarding_id_fkey"
            columns: ["onboarding_id"]
            isOneToOne: false
            referencedRelation: "onboarding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_log_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_log_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrer_public_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      invitation: {
        Row: {
          campaign_id: string
          code: string
          created_at: string
          customer_id: string | null
          id: string
          is_claimed: boolean
          metadata: Json | null
          referrer_id: string
        }
        Insert: {
          campaign_id: string
          code?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          is_claimed?: boolean
          metadata?: Json | null
          referrer_id: string
        }
        Update: {
          campaign_id?: string
          code?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          is_claimed?: boolean
          metadata?: Json | null
          referrer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitation_campaign_id_code_fkey"
            columns: ["campaign_id", "code"]
            isOneToOne: true
            referencedRelation: "code"
            referencedColumns: ["campaign_id", "code"]
          },
          {
            foreignKeyName: "invitation_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitation_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitation_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["uid"]
          },
          {
            foreignKeyName: "invitation_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitation_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrer_public_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding: {
        Row: {
          campaign_id: string
          completed_at: string | null
          id: string
          invitation_id: string
          is_completed: boolean
        }
        Insert: {
          campaign_id: string
          completed_at?: string | null
          id?: string
          invitation_id: string
          is_completed?: boolean
        }
        Update: {
          campaign_id?: string
          completed_at?: string | null
          id?: string
          invitation_id?: string
          is_completed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: true
            referencedRelation: "invitation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: true
            referencedRelation: "invitation_public_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_challenge_flag: {
        Row: {
          campaign_id: string
          id: string
          invitation_id: string
          ts: string
        }
        Insert: {
          campaign_id: string
          id?: string
          invitation_id: string
          ts?: string
        }
        Update: {
          campaign_id?: string
          id?: string
          invitation_id?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_challenge_flag_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_challenge_flag_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_challenge_flag_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_challenge_flag_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitation_public_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_invitee_reward: {
        Row: {
          campaign_id: string
          created_at: string | null
          id: string
          invitation_id: string
          metadata: Json | null
          onboarding_id: string
          reward_description: string
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          id?: string
          invitation_id: string
          metadata?: Json | null
          onboarding_id: string
          reward_description: string
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          id?: string
          invitation_id?: string
          metadata?: Json | null
          onboarding_id?: string
          reward_description?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_invitee_reward_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_invitee_reward_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_invitee_reward_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: true
            referencedRelation: "invitation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_invitee_reward_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: true
            referencedRelation: "invitation_public_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_invitee_reward_onboarding_id_fkey"
            columns: ["onboarding_id"]
            isOneToOne: false
            referencedRelation: "onboarding"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_referrer_reward: {
        Row: {
          campaign_id: string
          created_at: string | null
          id: string
          metadata: Json | null
          onboarding_id: string
          referrer_id: string
          reward_description: string
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          onboarding_id: string
          referrer_id: string
          reward_description: string
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          onboarding_id?: string
          referrer_id?: string
          reward_description?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_referrer_reward_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_referrer_reward_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_referrer_reward_onboarding_id_fkey"
            columns: ["onboarding_id"]
            isOneToOne: false
            referencedRelation: "onboarding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_referrer_reward_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_referrer_reward_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrer_public_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      referrer: {
        Row: {
          campaign_id: string
          code: string
          created_at: string
          customer_id: string
          id: string
          invitation_count: number
          metadata: Json | null
          project_id: number
        }
        Insert: {
          campaign_id: string
          code?: string
          created_at?: string
          customer_id: string
          id?: string
          invitation_count?: number
          metadata?: Json | null
          project_id: number
        }
        Update: {
          campaign_id?: string
          code?: string
          created_at?: string
          customer_id?: string
          id?: string
          invitation_count?: number
          metadata?: Json | null
          project_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_referrer_campaign_project"
            columns: ["campaign_id", "project_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "referrer_campaign_id_code_fkey"
            columns: ["campaign_id", "code"]
            isOneToOne: false
            referencedRelation: "code"
            referencedColumns: ["campaign_id", "code"]
          },
          {
            foreignKeyName: "referrer_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrer_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrer_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["uid"]
          },
        ]
      }
    }
    Views: {
      campaign_public: {
        Row: {
          description: string | null
          enabled: boolean | null
          id: string | null
          layout_id: string | null
          max_invitations_per_referrer: number | null
          public: Json | null
          reward_currency: string | null
          scheduling_close_at: string | null
          scheduling_open_at: string | null
          scheduling_tz: string | null
          title: string | null
          www_name: string | null
          www_route_path: string | null
        }
        Relationships: []
      }
      customer: {
        Row: {
          email: string | null
          name: string | null
          phone: string | null
          uid: string | null
        }
        Insert: {
          email?: string | null
          name?: string | null
          phone?: string | null
          uid?: string | null
        }
        Update: {
          email?: string | null
          name?: string | null
          phone?: string | null
          uid?: string | null
        }
        Relationships: []
      }
      invitation_public_secure: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          id: string | null
          invitee_name: string | null
          is_claimed: boolean | null
          referrer_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitation_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitation_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitation_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitation_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrer_public_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      referrer_public_secure: {
        Row: {
          campaign_id: string | null
          code: string | null
          created_at: string | null
          id: string | null
          invitation_count: number | null
          referrer_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrer_campaign_id_code_fkey"
            columns: ["campaign_id", "code"]
            isOneToOne: false
            referencedRelation: "code"
            referencedColumns: ["campaign_id", "code"]
          },
          {
            foreignKeyName: "referrer_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrer_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      analyze: {
        Args: {
          p_campaign_id: string
          p_names?: string[]
          p_time_from?: string
          p_time_to?: string
          p_interval?: unknown
        }
        Returns: {
          bucket: string
          name: string
          count: number
        }[]
      }
      claim: {
        Args: { p_campaign_id: string; p_code: string; p_customer_id: string }
        Returns: {
          campaign_id: string
          code: string
          created_at: string
          customer_id: string | null
          id: string
          is_claimed: boolean
          metadata: Json | null
          referrer_id: string
        }
      }
      flag: {
        Args: {
          p_campaign_id: string
          p_invitation_id: string
          p_event_name: string
          p_event_data?: Json
        }
        Returns: undefined
      }
      gen_random_short_code: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      invite: {
        Args: {
          p_campaign_id: string
          p_code: string
          p_new_invitation_code?: string
        }
        Returns: {
          campaign_id: string
          code: string
          created_at: string
          customer_id: string | null
          id: string
          is_claimed: boolean
          metadata: Json | null
          referrer_id: string
        }
      }
      lookup: {
        Args: { p_campaign_id: string; p_code: string }
        Returns: {
          campaign_id: string
          code: string
          type: Database["grida_west_referral"]["Enums"]["token_role"]
        }[]
      }
      refresh: {
        Args: {
          p_campaign_id: string
          p_invitation_id: string
          p_new_invitation_code?: string
        }
        Returns: {
          campaign_id: string
          code: string
          created_at: string
          customer_id: string | null
          id: string
          is_claimed: boolean
          metadata: Json | null
          referrer_id: string
        }
      }
      rls_campaign: {
        Args: { p_campaign_id: string }
        Returns: boolean
      }
      track: {
        Args: {
          p_campaign_id: string
          p_code: string
          p_name: string
          p_data?: Json
        }
        Returns: undefined
      }
    }
    Enums: {
      token_role: "referrer" | "invitation"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  grida_www: {
    Tables: {
      layout: {
        Row: {
          base_path: string | null
          created_at: string
          document_id: string
          document_type: Database["public"]["Enums"]["doctype"]
          id: string
          metadata: Json | null
          name: string
          parent_layout_id: string | null
          path_tokens: string[] | null
          template_id: string
          updated_at: string
          www_id: string
        }
        Insert: {
          base_path?: string | null
          created_at?: string
          document_id: string
          document_type: Database["public"]["Enums"]["doctype"]
          id?: string
          metadata?: Json | null
          name: string
          parent_layout_id?: string | null
          path_tokens?: string[] | null
          template_id: string
          updated_at?: string
          www_id: string
        }
        Update: {
          base_path?: string | null
          created_at?: string
          document_id?: string
          document_type?: Database["public"]["Enums"]["doctype"]
          id?: string
          metadata?: Json | null
          name?: string
          parent_layout_id?: string | null
          path_tokens?: string[] | null
          template_id?: string
          updated_at?: string
          www_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "layout_parent_layout_id_fkey"
            columns: ["parent_layout_id"]
            isOneToOne: false
            referencedRelation: "layout"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_parent_layout_id_fkey"
            columns: ["parent_layout_id"]
            isOneToOne: false
            referencedRelation: "public_route"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "template"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_www_id_fkey"
            columns: ["www_id"]
            isOneToOne: false
            referencedRelation: "www"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_www_id_fkey"
            columns: ["www_id"]
            isOneToOne: false
            referencedRelation: "www_public"
            referencedColumns: ["id"]
          },
        ]
      }
      template: {
        Row: {
          created_at: string | null
          data: Json
          id: string
          is_draft: boolean
          is_public: boolean
          version: string
          www_id: string
        }
        Insert: {
          created_at?: string | null
          data: Json
          id?: string
          is_draft?: boolean
          is_public?: boolean
          version: string
          www_id: string
        }
        Update: {
          created_at?: string | null
          data?: Json
          id?: string
          is_draft?: boolean
          is_public?: boolean
          version?: string
          www_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_www_id_fkey"
            columns: ["www_id"]
            isOneToOne: false
            referencedRelation: "www"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_www_id_fkey"
            columns: ["www_id"]
            isOneToOne: false
            referencedRelation: "www_public"
            referencedColumns: ["id"]
          },
        ]
      }
      www: {
        Row: {
          description: string | null
          favicon: Json | null
          id: string
          keywords: string[] | null
          lang: string
          name: string
          og_image: string | null
          project_id: number
          publisher: string | null
          theme: Json | null
          title: string | null
        }
        Insert: {
          description?: string | null
          favicon?: Json | null
          id?: string
          keywords?: string[] | null
          lang?: string
          name: string
          og_image?: string | null
          project_id: number
          publisher?: string | null
          theme?: Json | null
          title?: string | null
        }
        Update: {
          description?: string | null
          favicon?: Json | null
          id?: string
          keywords?: string[] | null
          lang?: string
          name?: string
          og_image?: string | null
          project_id?: number
          publisher?: string | null
          theme?: Json | null
          title?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      public_route: {
        Row: {
          document_id: string | null
          document_type: Database["public"]["Enums"]["doctype"] | null
          id: string | null
          metadata: Json | null
          parent_layout_id: string | null
          route_path: string | null
          template_id: string | null
          type: string | null
          www_id: string | null
          www_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "layout_parent_layout_id_fkey"
            columns: ["parent_layout_id"]
            isOneToOne: false
            referencedRelation: "layout"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_parent_layout_id_fkey"
            columns: ["parent_layout_id"]
            isOneToOne: false
            referencedRelation: "public_route"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "template"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_www_id_fkey"
            columns: ["www_id"]
            isOneToOne: false
            referencedRelation: "www"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_www_id_fkey"
            columns: ["www_id"]
            isOneToOne: false
            referencedRelation: "www_public"
            referencedColumns: ["id"]
          },
        ]
      }
      www_public: {
        Row: {
          description: string | null
          favicon: Json | null
          id: string | null
          keywords: string[] | null
          lang: string | null
          name: string | null
          og_image: string | null
          title: string | null
        }
        Insert: {
          description?: string | null
          favicon?: Json | null
          id?: string | null
          keywords?: string[] | null
          lang?: string | null
          name?: string | null
          og_image?: string | null
          title?: string | null
        }
        Update: {
          description?: string | null
          favicon?: Json | null
          id?: string | null
          keywords?: string[] | null
          lang?: string | null
          name?: string | null
          og_image?: string | null
          title?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      change_www_name: {
        Args: { p_www_id: string; p_name: string }
        Returns: undefined
      }
      check_www_name_available: {
        Args: { p_name: string }
        Returns: boolean
      }
      gen_random_www_name: {
        Args: { p_project_id: number }
        Returns: string
      }
      rls_www: {
        Args: { p_www_id: string }
        Returns: boolean
      }
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
        Relationships: []
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
      asset: {
        Row: {
          created_at: string | null
          document_id: string
          id: string
          is_public: boolean
          name: string
          object_id: string | null
          size: number
          type: string
        }
        Insert: {
          created_at?: string | null
          document_id: string
          id?: string
          is_public: boolean
          name: string
          object_id?: string | null
          size: number
          type: string
        }
        Update: {
          created_at?: string | null
          document_id?: string
          id?: string
          is_public?: boolean
          name?: string
          object_id?: string | null
          size?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
        ]
      }
      customer: {
        Row: {
          _fp_fingerprintjs_visitorid: string | null
          created_at: string
          description: string | null
          email: string | null
          email_provisional: string[]
          is_email_verified: boolean
          is_marketing_email_subscribed: boolean
          is_marketing_sms_subscribed: boolean
          is_phone_verified: boolean
          last_seen_at: string
          metadata: Json | null
          name: string | null
          name_provisional: string[]
          phone: string | null
          phone_provisional: string[]
          project_id: number
          search_text: string | null
          search_tsv: unknown | null
          uid: string
          user_id: string | null
          uuid: string | null
          visitor_id: string | null
        }
        Insert: {
          _fp_fingerprintjs_visitorid?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          email_provisional?: string[]
          is_email_verified?: boolean
          is_marketing_email_subscribed?: boolean
          is_marketing_sms_subscribed?: boolean
          is_phone_verified?: boolean
          last_seen_at?: string
          metadata?: Json | null
          name?: string | null
          name_provisional?: string[]
          phone?: string | null
          phone_provisional?: string[]
          project_id: number
          search_text?: string | null
          search_tsv?: unknown | null
          uid?: string
          user_id?: string | null
          uuid?: string | null
          visitor_id?: string | null
        }
        Update: {
          _fp_fingerprintjs_visitorid?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          email_provisional?: string[]
          is_email_verified?: boolean
          is_marketing_email_subscribed?: boolean
          is_marketing_sms_subscribed?: boolean
          is_phone_verified?: boolean
          last_seen_at?: string
          metadata?: Json | null
          name?: string | null
          name_provisional?: string[]
          phone?: string | null
          phone_provisional?: string[]
          project_id?: number
          search_text?: string | null
          search_tsv?: unknown | null
          uid?: string
          user_id?: string | null
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
      customer_auth_policy: {
        Row: {
          challenges: Json[]
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          name: string
          project_id: number
          scopes: string[]
        }
        Insert: {
          challenges: Json[]
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          name: string
          project_id: number
          scopes: string[]
        }
        Update: {
          challenges?: Json[]
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          name?: string
          project_id?: number
          scopes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "customer_auth_policy_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_tag: {
        Row: {
          created_at: string
          customer_uid: string
          project_id: number
          tag_name: string
        }
        Insert: {
          created_at?: string
          customer_uid: string
          project_id: number
          tag_name: string
        }
        Update: {
          created_at?: string
          customer_uid?: string
          project_id?: number
          tag_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_tag_customer_uid_fkey"
            columns: ["customer_uid"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["uid"]
          },
          {
            foreignKeyName: "customer_tag_customer_uid_fkey"
            columns: ["customer_uid"]
            isOneToOne: false
            referencedRelation: "customer_with_tags"
            referencedColumns: ["uid"]
          },
          {
            foreignKeyName: "customer_tag_project_id_tag_name_fkey"
            columns: ["project_id", "tag_name"]
            isOneToOne: false
            referencedRelation: "tag"
            referencedColumns: ["project_id", "name"]
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
        Relationships: []
      }
      organization: {
        Row: {
          avatar_path: string | null
          blog: string | null
          created_at: string
          description: string | null
          display_name: string
          display_plan: Database["public"]["Enums"]["pricing_tier"]
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
          display_plan?: Database["public"]["Enums"]["pricing_tier"]
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
          display_plan?: Database["public"]["Enums"]["pricing_tier"]
          email?: string | null
          id?: number
          name?: string
          owner_id?: string
        }
        Relationships: []
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
            foreignKeyName: "organization_member_user_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile"
            referencedColumns: ["uid"]
          },
          {
            foreignKeyName: "public_organization_member_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
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
      tag: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: number
          name: string
          project_id: number
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: number
          name: string
          project_id: number
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: number
          name?: string
          project_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tag_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profile: {
        Row: {
          avatar_path: string | null
          created_at: string
          display_name: string
          uid: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          display_name: string
          uid?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string
          uid?: string
        }
        Relationships: []
      }
      user_project_access_state: {
        Row: {
          document_id: string | null
          project_id: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          document_id?: string | null
          project_id?: number | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          document_id?: string | null
          project_id?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_project_access_state_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_project_access_state_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
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
      customer_with_tags: {
        Row: {
          _fp_fingerprintjs_visitorid: string | null
          created_at: string | null
          description: string | null
          email: string | null
          email_provisional: string[] | null
          is_email_verified: boolean | null
          is_marketing_email_subscribed: boolean | null
          is_marketing_sms_subscribed: boolean | null
          is_phone_verified: boolean | null
          last_seen_at: string | null
          metadata: Json | null
          name: string | null
          name_provisional: string[] | null
          phone: string | null
          phone_provisional: string[] | null
          project_id: number | null
          search_text: string | null
          search_tsv: unknown | null
          tags: string[] | null
          uid: string | null
          user_id: string | null
          uuid: string | null
          visitor_id: string | null
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
    }
    Functions: {
      citext: {
        Args: { "": string } | { "": boolean } | { "": unknown }
        Returns: string
      }
      citext_hash: {
        Args: { "": string }
        Returns: number
      }
      citextin: {
        Args: { "": unknown }
        Returns: string
      }
      citextout: {
        Args: { "": string }
        Returns: unknown
      }
      citextrecv: {
        Args: { "": unknown }
        Returns: string
      }
      citextsend: {
        Args: { "": string }
        Returns: string
      }
      find_project: {
        Args: { p_org_ref: string; p_proj_ref: string }
        Returns: {
          created_at: string
          id: number
          name: string
          organization_id: number
          ref_id: string | null
        }[]
      }
      flatten_jsonb_object_values: {
        Args: { obj: Json }
        Returns: string
      }
      gen_random_slug: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      generate_combinations: {
        Args:
          | { product_id: number; option_value_combinations: number[] }
          | { option_ids: number[]; product_id: number; store_id: number }
        Returns: undefined
      }
      get_organizations_for_user: {
        Args: { user_id: string }
        Returns: number[]
      }
      get_projects_for_user: {
        Args: { user_id: string }
        Returns: number[]
      }
      jsonb_array_objects_only: {
        Args: { arr: Json[] }
        Returns: boolean
      }
      rls_asset: {
        Args: { p_asset_id: string }
        Returns: boolean
      }
      rls_document: {
        Args: { p_document_id: string }
        Returns: boolean
      }
      rls_manifest: {
        Args: { p_manifest_id: number }
        Returns: boolean
      }
      rls_organization: {
        Args: { p_organization_id: number }
        Returns: boolean
      }
      rls_organization_owner: {
        Args: { p_organization_id: number }
        Returns: boolean
      }
      rls_project: {
        Args: { project_id: number }
        Returns: boolean
      }
      rls_via_customer: {
        Args: { p_customer_id: string }
        Returns: boolean
      }
      update_customer_tags: {
        Args: { p_customer_uid: string; p_project_id: number; p_tags: string[] }
        Returns: undefined
      }
      workspace_documents: {
        Args: { p_organization_id: number }
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
          is_public: boolean
        }[]
      }
      workspace_mark_access: {
        Args: {
          p_organization_name: string
          p_project_name: string
          p_document_id?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      doctype:
        | "v0_form"
        | "v0_site"
        | "v0_schema"
        | "v0_canvas"
        | "v0_bucket"
        | "v0_campaign_referral"
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
      pricing_tier: "free" | "v0_pro" | "v0_team" | "v0_enterprise"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  grida_canvas: {
    Enums: {},
  },
  grida_commerce: {
    Enums: {
      currency: [
        "AED",
        "AFN",
        "ALL",
        "AMD",
        "ANG",
        "AOA",
        "ARS",
        "AUD",
        "AWG",
        "AZN",
        "BAM",
        "BBD",
        "BDT",
        "BGN",
        "BHD",
        "BIF",
        "BMD",
        "BND",
        "BOB",
        "BRL",
        "BSD",
        "BTC",
        "BTN",
        "BWP",
        "BYN",
        "BZD",
        "CAD",
        "CDF",
        "CHF",
        "CLF",
        "CLP",
        "CNH",
        "CNY",
        "COP",
        "CRC",
        "CUC",
        "CUP",
        "CVE",
        "CZK",
        "DJF",
        "DKK",
        "DOP",
        "DZD",
        "EGP",
        "ERN",
        "ETB",
        "EUR",
        "FJD",
        "FKP",
        "GBP",
        "GEL",
        "GGP",
        "GHS",
        "GIP",
        "GMD",
        "GNF",
        "GTQ",
        "GYD",
        "HKD",
        "HNL",
        "HRK",
        "HTG",
        "HUF",
        "IDR",
        "ILS",
        "IMP",
        "INR",
        "IQD",
        "IRR",
        "ISK",
        "JEP",
        "JMD",
        "JOD",
        "JPY",
        "KES",
        "KGS",
        "KHR",
        "KMF",
        "KPW",
        "KRW",
        "KWD",
        "KYD",
        "KZT",
        "LAK",
        "LBP",
        "LKR",
        "LRD",
        "LSL",
        "LYD",
        "MAD",
        "MDL",
        "MGA",
        "MKD",
        "MMK",
        "MNT",
        "MOP",
        "MRU",
        "MUR",
        "MVR",
        "MWK",
        "MXN",
        "MYR",
        "MZN",
        "NAD",
        "NGN",
        "NIO",
        "NOK",
        "NPR",
        "NZD",
        "OMR",
        "PAB",
        "PEN",
        "PGK",
        "PHP",
        "PKR",
        "PLN",
        "PYG",
        "QAR",
        "RON",
        "RSD",
        "RUB",
        "RWF",
        "SAR",
        "SBD",
        "SCR",
        "SDG",
        "SEK",
        "SGD",
        "SHP",
        "SLL",
        "SOS",
        "SRD",
        "SSP",
        "STN",
        "SVC",
        "SYP",
        "SZL",
        "THB",
        "TJS",
        "TMT",
        "TND",
        "TOP",
        "TRY",
        "TTD",
        "TWD",
        "TZS",
        "UAH",
        "UGX",
        "USD",
        "UYU",
        "UZS",
        "VES",
        "VND",
        "VUV",
        "WST",
        "XAF",
        "XCD",
        "XDR",
        "XOF",
        "XPF",
        "YER",
        "ZAR",
        "ZMW",
        "ZWL",
      ],
      inventory_level_commit_reason: [
        "admin",
        "initialize",
        "other",
        "order",
        "initialize_by_system",
      ],
      inventory_management: ["none", "system"],
      inventory_policy: ["continue", "deny"],
    },
  },
  grida_forms: {
    Enums: {
      form_block_type: [
        "section",
        "group",
        "field",
        "html",
        "image",
        "video",
        "divider",
        "header",
        "pdf",
      ],
      form_field_type: [
        "text",
        "textarea",
        "richtext",
        "tel",
        "url",
        "checkbox",
        "checkboxes",
        "switch",
        "toggle",
        "toggle-group",
        "date",
        "month",
        "week",
        "email",
        "file",
        "image",
        "select",
        "latlng",
        "password",
        "color",
        "radio",
        "country",
        "payment",
        "hidden",
        "signature",
        "number",
        "time",
        "datetime-local",
        "range",
        "search",
        "audio",
        "video",
        "json",
        "canvas",
      ],
      form_method: ["post", "get", "dialog"],
      form_response_unknown_field_handling_strategy_type: [
        "ignore",
        "accept",
        "reject",
      ],
      input_autocomplete_type: [
        "off",
        "on",
        "name",
        "honorific-prefix",
        "given-name",
        "additional-name",
        "family-name",
        "honorific-suffix",
        "nickname",
        "email",
        "username",
        "new-password",
        "current-password",
        "one-time-code",
        "organization-title",
        "organization",
        "street-address",
        "shipping",
        "billing",
        "address-line1",
        "address-line2",
        "address-line3",
        "address-level4",
        "address-level3",
        "address-level2",
        "address-level1",
        "country",
        "country-name",
        "postal-code",
        "cc-name",
        "cc-given-name",
        "cc-additional-name",
        "cc-family-name",
        "cc-number",
        "cc-exp",
        "cc-exp-month",
        "cc-exp-year",
        "cc-csc",
        "cc-type",
        "transaction-currency",
        "transaction-amount",
        "language",
        "bday",
        "bday-day",
        "bday-month",
        "bday-year",
        "sex",
        "tel",
        "tel-country-code",
        "tel-national",
        "tel-area-code",
        "tel-local",
        "tel-extension",
        "impp",
        "url",
        "photo",
        "webauthn",
      ],
      response_platform_powered_by: [
        "api",
        "grida_forms",
        "web_client",
        "simulator",
      ],
    },
  },
  grida_forms_secure: {
    Enums: {},
  },
  grida_g11n: {
    Enums: {},
  },
  grida_library: {
    Enums: {
      orientation: ["portrait", "landscape", "square"],
    },
  },
  grida_sites: {
    Enums: {},
  },
  grida_storage: {
    Enums: {},
  },
  grida_west_referral: {
    Enums: {
      token_role: ["referrer", "invitation"],
    },
  },
  grida_www: {
    Enums: {},
  },
  grida_x_supabase: {
    Enums: {
      sb_postgrest_method: ["get", "post", "delete", "patch"],
    },
  },
  public: {
    Enums: {
      doctype: [
        "v0_form",
        "v0_site",
        "v0_schema",
        "v0_canvas",
        "v0_bucket",
        "v0_campaign_referral",
      ],
      language_code: [
        "en",
        "ko",
        "es",
        "de",
        "ja",
        "fr",
        "pt",
        "it",
        "ru",
        "zh",
        "ar",
        "hi",
        "nl",
      ],
      pricing_tier: ["free", "v0_pro", "v0_team", "v0_enterprise"],
    },
  },
} as const

