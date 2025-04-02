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
        Args: {
          p_form_id: string
        }
        Returns: undefined
      }
      rls_form: {
        Args: {
          p_form_id: string
        }
        Returns: boolean
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
  grida_west: {
    Tables: {
      campaign: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          is_participant_name_exposed_to_public_dangerously: boolean
          max_supply_init_for_new_mint_token: number | null
          name: string
          project_id: number
          public: Json | null
          scheduling_close_at: string | null
          scheduling_open_at: string | null
          scheduling_tz: string | null
          type: Database["grida_west"]["Enums"]["campaign_type"]
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          is_participant_name_exposed_to_public_dangerously?: boolean
          max_supply_init_for_new_mint_token?: number | null
          name: string
          project_id: number
          public?: Json | null
          scheduling_close_at?: string | null
          scheduling_open_at?: string | null
          scheduling_tz?: string | null
          type: Database["grida_west"]["Enums"]["campaign_type"]
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          is_participant_name_exposed_to_public_dangerously?: boolean
          max_supply_init_for_new_mint_token?: number | null
          name?: string
          project_id?: number
          public?: Json | null
          scheduling_close_at?: string | null
          scheduling_open_at?: string | null
          scheduling_tz?: string | null
          type?: Database["grida_west"]["Enums"]["campaign_type"]
        }
        Relationships: []
      }
      participant: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          metadata: Json | null
          project_id: number
          role: Database["grida_west"]["Enums"]["participant_role"]
          series_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          metadata?: Json | null
          project_id: number
          role: Database["grida_west"]["Enums"]["participant_role"]
          series_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          metadata?: Json | null
          project_id?: number
          role?: Database["grida_west"]["Enums"]["participant_role"]
          series_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_participant_series_project"
            columns: ["series_id", "project_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "participant_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "campaign_public"
            referencedColumns: ["id"]
          },
        ]
      }
      token: {
        Row: {
          code: string
          count: number
          created_at: string
          id: string
          is_burned: boolean
          is_claimed: boolean
          max_supply: number | null
          owner_id: string | null
          parent_id: string | null
          public: Json | null
          secret: string | null
          series_id: string
          token_type: Database["grida_west"]["Enums"]["token_type"]
        }
        Insert: {
          code: string
          count?: number
          created_at?: string
          id?: string
          is_burned?: boolean
          is_claimed?: boolean
          max_supply?: number | null
          owner_id?: string | null
          parent_id?: string | null
          public?: Json | null
          secret?: string | null
          series_id: string
          token_type: Database["grida_west"]["Enums"]["token_type"]
        }
        Update: {
          code?: string
          count?: number
          created_at?: string
          id?: string
          is_burned?: boolean
          is_claimed?: boolean
          max_supply?: number | null
          owner_id?: string | null
          parent_id?: string | null
          public?: Json | null
          secret?: string | null
          series_id?: string
          token_type?: Database["grida_west"]["Enums"]["token_type"]
        }
        Relationships: [
          {
            foreignKeyName: "token_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "participant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "participant_customer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "participant_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "token"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "campaign_public"
            referencedColumns: ["id"]
          },
        ]
      }
      token_event: {
        Row: {
          data: Json | null
          name: string
          series_id: string
          time: string
          token_id: string
        }
        Insert: {
          data?: Json | null
          name: string
          series_id: string
          time?: string
          token_id: string
        }
        Update: {
          data?: Json | null
          name?: string
          series_id?: string
          time?: string
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_event_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_event_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "campaign_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_event_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "token"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      campaign_public: {
        Row: {
          enabled: boolean | null
          id: string | null
          name: string | null
          public: Json | null
          scheduling_close_at: string | null
          scheduling_open_at: string | null
          scheduling_tz: string | null
          type: Database["grida_west"]["Enums"]["campaign_type"] | null
        }
        Insert: {
          enabled?: boolean | null
          id?: string | null
          name?: string | null
          public?: Json | null
          scheduling_close_at?: string | null
          scheduling_open_at?: string | null
          scheduling_tz?: string | null
          type?: Database["grida_west"]["Enums"]["campaign_type"] | null
        }
        Update: {
          enabled?: boolean | null
          id?: string | null
          name?: string | null
          public?: Json | null
          scheduling_close_at?: string | null
          scheduling_open_at?: string | null
          scheduling_tz?: string | null
          type?: Database["grida_west"]["Enums"]["campaign_type"] | null
        }
        Relationships: []
      }
      participant_customer: {
        Row: {
          created_at: string | null
          customer_id: string | null
          email: string | null
          id: string | null
          metadata: Json | null
          name: string | null
          phone: string | null
          project_id: number | null
          role: Database["grida_west"]["Enums"]["participant_role"] | null
          series_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_participant_series_project"
            columns: ["series_id", "project_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "participant_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "campaign_public"
            referencedColumns: ["id"]
          },
        ]
      }
      participant_public: {
        Row: {
          id: string | null
          name: string | null
          role: Database["grida_west"]["Enums"]["participant_role"] | null
          series_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "participant_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_series_id_fkey"
            columns: ["series_id"]
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
          p_series_id: string
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
      claim_token: {
        Args: {
          p_series_id: string
          p_code: string
          p_owner_id: string
          p_secret?: string
        }
        Returns: {
          code: string
          count: number
          created_at: string
          id: string
          is_burned: boolean
          is_claimed: boolean
          max_supply: number | null
          owner_id: string | null
          parent_id: string | null
          public: Json | null
          secret: string | null
          series_id: string
          token_type: Database["grida_west"]["Enums"]["token_type"]
        }
      }
      mint_token: {
        Args: {
          p_series_id: string
          p_code: string
          p_secret?: string
          p_next_code?: string
          p_next_public?: Json
        }
        Returns: {
          code: string
          count: number
          created_at: string
          id: string
          is_burned: boolean
          is_claimed: boolean
          max_supply: number | null
          owner_id: string | null
          parent_id: string | null
          public: Json | null
          secret: string | null
          series_id: string
          token_type: Database["grida_west"]["Enums"]["token_type"]
        }
      }
      redeem_token: {
        Args: {
          p_token_id: string
        }
        Returns: undefined
      }
      rls_campaign: {
        Args: {
          p_campaign_id: string
        }
        Returns: boolean
      }
      track: {
        Args: {
          p_series_id: string
          p_code: string
          p_name: string
          p_data?: Json
        }
        Returns: undefined
      }
    }
    Enums: {
      campaign_type: "referral"
      participant_role: "host" | "guest"
      token_type: "mintable" | "redeemable"
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
      add_compression_policy: {
        Args: {
          hypertable: unknown
          compress_after: unknown
          if_not_exists?: boolean
          schedule_interval?: unknown
          initial_start?: string
          timezone?: string
        }
        Returns: number
      }
      add_continuous_aggregate_policy: {
        Args: {
          continuous_aggregate: unknown
          start_offset: unknown
          end_offset: unknown
          schedule_interval: unknown
          if_not_exists?: boolean
          initial_start?: string
          timezone?: string
        }
        Returns: number
      }
      add_data_node: {
        Args: {
          node_name: unknown
          host: string
          database?: unknown
          port?: number
          if_not_exists?: boolean
          bootstrap?: boolean
          password?: string
        }
        Returns: {
          node_name: unknown
          host: string
          port: number
          database: unknown
          node_created: boolean
          database_created: boolean
          extension_created: boolean
        }[]
      }
      add_dimension: {
        Args: {
          hypertable: unknown
          column_name: unknown
          number_partitions?: number
          chunk_time_interval?: unknown
          partitioning_func?: unknown
          if_not_exists?: boolean
        }
        Returns: {
          dimension_id: number
          schema_name: unknown
          table_name: unknown
          column_name: unknown
          created: boolean
        }[]
      }
      add_job: {
        Args: {
          proc: unknown
          schedule_interval: unknown
          config?: Json
          initial_start?: string
          scheduled?: boolean
          check_config?: unknown
          fixed_schedule?: boolean
          timezone?: string
        }
        Returns: number
      }
      add_reorder_policy: {
        Args: {
          hypertable: unknown
          index_name: unknown
          if_not_exists?: boolean
          initial_start?: string
          timezone?: string
        }
        Returns: number
      }
      add_retention_policy: {
        Args: {
          relation: unknown
          drop_after: unknown
          if_not_exists?: boolean
          schedule_interval?: unknown
          initial_start?: string
          timezone?: string
        }
        Returns: number
      }
      alter_data_node: {
        Args: {
          node_name: unknown
          host?: string
          database?: unknown
          port?: number
          available?: boolean
        }
        Returns: {
          node_name: unknown
          host: string
          port: number
          database: unknown
          available: boolean
        }[]
      }
      alter_job: {
        Args: {
          job_id: number
          schedule_interval?: unknown
          max_runtime?: unknown
          max_retries?: number
          retry_period?: unknown
          scheduled?: boolean
          config?: Json
          next_start?: string
          if_exists?: boolean
          check_config?: unknown
        }
        Returns: {
          job_id: number
          schedule_interval: unknown
          max_runtime: unknown
          max_retries: number
          retry_period: unknown
          scheduled: boolean
          config: Json
          next_start: string
          check_config: string
        }[]
      }
      approximate_row_count: {
        Args: {
          relation: unknown
        }
        Returns: number
      }
      attach_data_node: {
        Args: {
          node_name: unknown
          hypertable: unknown
          if_not_attached?: boolean
          repartition?: boolean
        }
        Returns: {
          hypertable_id: number
          node_hypertable_id: number
          node_name: unknown
        }[]
      }
      attach_tablespace: {
        Args: {
          tablespace: unknown
          hypertable: unknown
          if_not_attached?: boolean
        }
        Returns: undefined
      }
      chunk_compression_stats: {
        Args: {
          hypertable: unknown
        }
        Returns: {
          chunk_schema: unknown
          chunk_name: unknown
          compression_status: string
          before_compression_table_bytes: number
          before_compression_index_bytes: number
          before_compression_toast_bytes: number
          before_compression_total_bytes: number
          after_compression_table_bytes: number
          after_compression_index_bytes: number
          after_compression_toast_bytes: number
          after_compression_total_bytes: number
          node_name: unknown
        }[]
      }
      chunks_detailed_size: {
        Args: {
          hypertable: unknown
        }
        Returns: {
          chunk_schema: unknown
          chunk_name: unknown
          table_bytes: number
          index_bytes: number
          toast_bytes: number
          total_bytes: number
          node_name: unknown
        }[]
      }
      citext:
        | {
            Args: {
              "": boolean
            }
            Returns: string
          }
        | {
            Args: {
              "": string
            }
            Returns: string
          }
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
      citext_hash: {
        Args: {
          "": string
        }
        Returns: number
      }
      citextin: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      citextout: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      citextrecv: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      citextsend: {
        Args: {
          "": string
        }
        Returns: string
      }
      compress_chunk: {
        Args: {
          uncompressed_chunk: unknown
          if_not_compressed?: boolean
        }
        Returns: unknown
      }
      create_distributed_hypertable: {
        Args: {
          relation: unknown
          time_column_name: unknown
          partitioning_column?: unknown
          number_partitions?: number
          associated_schema_name?: unknown
          associated_table_prefix?: unknown
          chunk_time_interval?: unknown
          create_default_indexes?: boolean
          if_not_exists?: boolean
          partitioning_func?: unknown
          migrate_data?: boolean
          chunk_target_size?: string
          chunk_sizing_func?: unknown
          time_partitioning_func?: unknown
          replication_factor?: number
          data_nodes?: unknown[]
        }
        Returns: {
          hypertable_id: number
          schema_name: unknown
          table_name: unknown
          created: boolean
        }[]
      }
      create_distributed_restore_point: {
        Args: {
          name: string
        }
        Returns: {
          node_name: unknown
          node_type: string
          restore_point: unknown
        }[]
      }
      create_hypertable: {
        Args: {
          relation: unknown
          time_column_name: unknown
          partitioning_column?: unknown
          number_partitions?: number
          associated_schema_name?: unknown
          associated_table_prefix?: unknown
          chunk_time_interval?: unknown
          create_default_indexes?: boolean
          if_not_exists?: boolean
          partitioning_func?: unknown
          migrate_data?: boolean
          chunk_target_size?: string
          chunk_sizing_func?: unknown
          time_partitioning_func?: unknown
          replication_factor?: number
          data_nodes?: unknown[]
          distributed?: boolean
        }
        Returns: {
          hypertable_id: number
          schema_name: unknown
          table_name: unknown
          created: boolean
        }[]
      }
      decompress_chunk: {
        Args: {
          uncompressed_chunk: unknown
          if_compressed?: boolean
        }
        Returns: unknown
      }
      delete_data_node: {
        Args: {
          node_name: unknown
          if_exists?: boolean
          force?: boolean
          repartition?: boolean
          drop_database?: boolean
        }
        Returns: boolean
      }
      delete_job: {
        Args: {
          job_id: number
        }
        Returns: undefined
      }
      detach_data_node: {
        Args: {
          node_name: unknown
          hypertable?: unknown
          if_attached?: boolean
          force?: boolean
          repartition?: boolean
          drop_remote_data?: boolean
        }
        Returns: number
      }
      detach_tablespace: {
        Args: {
          tablespace: unknown
          hypertable?: unknown
          if_attached?: boolean
        }
        Returns: number
      }
      detach_tablespaces: {
        Args: {
          hypertable: unknown
        }
        Returns: number
      }
      drop_chunks: {
        Args: {
          relation: unknown
          older_than?: unknown
          newer_than?: unknown
          verbose?: boolean
        }
        Returns: string[]
      }
      flatten_jsonb_object_values: {
        Args: {
          obj: Json
        }
        Returns: string
      }
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
      get_telemetry_report: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      gtrgm_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gtrgm_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gtrgm_options: {
        Args: {
          "": unknown
        }
        Returns: undefined
      }
      gtrgm_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      hypertable_compression_stats: {
        Args: {
          hypertable: unknown
        }
        Returns: {
          total_chunks: number
          number_compressed_chunks: number
          before_compression_table_bytes: number
          before_compression_index_bytes: number
          before_compression_toast_bytes: number
          before_compression_total_bytes: number
          after_compression_table_bytes: number
          after_compression_index_bytes: number
          after_compression_toast_bytes: number
          after_compression_total_bytes: number
          node_name: unknown
        }[]
      }
      hypertable_detailed_size: {
        Args: {
          hypertable: unknown
        }
        Returns: {
          table_bytes: number
          index_bytes: number
          toast_bytes: number
          total_bytes: number
          node_name: unknown
        }[]
      }
      hypertable_index_size: {
        Args: {
          index_name: unknown
        }
        Returns: number
      }
      hypertable_size: {
        Args: {
          hypertable: unknown
        }
        Returns: number
      }
      interpolate:
        | {
            Args: {
              value: number
              prev?: Record<string, unknown>
              next?: Record<string, unknown>
            }
            Returns: number
          }
        | {
            Args: {
              value: number
              prev?: Record<string, unknown>
              next?: Record<string, unknown>
            }
            Returns: number
          }
        | {
            Args: {
              value: number
              prev?: Record<string, unknown>
              next?: Record<string, unknown>
            }
            Returns: number
          }
        | {
            Args: {
              value: number
              prev?: Record<string, unknown>
              next?: Record<string, unknown>
            }
            Returns: number
          }
        | {
            Args: {
              value: number
              prev?: Record<string, unknown>
              next?: Record<string, unknown>
            }
            Returns: number
          }
      jsonb_array_objects_only: {
        Args: {
          arr: Json[]
        }
        Returns: boolean
      }
      locf: {
        Args: {
          value: unknown
          prev?: unknown
          treat_null_as_missing?: boolean
        }
        Returns: unknown
      }
      move_chunk: {
        Args: {
          chunk: unknown
          destination_tablespace: unknown
          index_destination_tablespace?: unknown
          reorder_index?: unknown
          verbose?: boolean
        }
        Returns: undefined
      }
      remove_compression_policy: {
        Args: {
          hypertable: unknown
          if_exists?: boolean
        }
        Returns: boolean
      }
      remove_continuous_aggregate_policy: {
        Args: {
          continuous_aggregate: unknown
          if_not_exists?: boolean
          if_exists?: boolean
        }
        Returns: undefined
      }
      remove_reorder_policy: {
        Args: {
          hypertable: unknown
          if_exists?: boolean
        }
        Returns: undefined
      }
      remove_retention_policy: {
        Args: {
          relation: unknown
          if_exists?: boolean
        }
        Returns: undefined
      }
      reorder_chunk: {
        Args: {
          chunk: unknown
          index?: unknown
          verbose?: boolean
        }
        Returns: undefined
      }
      rls_asset: {
        Args: {
          p_asset_id: string
        }
        Returns: boolean
      }
      rls_document: {
        Args: {
          p_document_id: string
        }
        Returns: boolean
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
      rls_organization_owner: {
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
      rls_via_customer: {
        Args: {
          p_customer_id: string
        }
        Returns: boolean
      }
      set_adaptive_chunking: {
        Args: {
          hypertable: unknown
          chunk_target_size: string
        }
        Returns: Record<string, unknown>
      }
      set_chunk_time_interval: {
        Args: {
          hypertable: unknown
          chunk_time_interval: unknown
          dimension_name?: unknown
        }
        Returns: undefined
      }
      set_integer_now_func: {
        Args: {
          hypertable: unknown
          integer_now_func: unknown
          replace_if_exists?: boolean
        }
        Returns: undefined
      }
      set_limit: {
        Args: {
          "": number
        }
        Returns: number
      }
      set_number_partitions: {
        Args: {
          hypertable: unknown
          number_partitions: number
          dimension_name?: unknown
        }
        Returns: undefined
      }
      set_replication_factor: {
        Args: {
          hypertable: unknown
          replication_factor: number
        }
        Returns: undefined
      }
      show_chunks: {
        Args: {
          relation: unknown
          older_than?: unknown
          newer_than?: unknown
        }
        Returns: unknown[]
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_tablespaces: {
        Args: {
          hypertable: unknown
        }
        Returns: unknown[]
      }
      show_trgm: {
        Args: {
          "": string
        }
        Returns: string[]
      }
      time_bucket:
        | {
            Args: {
              bucket_width: number
              ts: number
            }
            Returns: number
          }
        | {
            Args: {
              bucket_width: number
              ts: number
            }
            Returns: number
          }
        | {
            Args: {
              bucket_width: number
              ts: number
            }
            Returns: number
          }
        | {
            Args: {
              bucket_width: number
              ts: number
              offset: number
            }
            Returns: number
          }
        | {
            Args: {
              bucket_width: number
              ts: number
              offset: number
            }
            Returns: number
          }
        | {
            Args: {
              bucket_width: number
              ts: number
              offset: number
            }
            Returns: number
          }
        | {
            Args: {
              bucket_width: unknown
              ts: string
            }
            Returns: string
          }
        | {
            Args: {
              bucket_width: unknown
              ts: string
            }
            Returns: string
          }
        | {
            Args: {
              bucket_width: unknown
              ts: string
            }
            Returns: string
          }
        | {
            Args: {
              bucket_width: unknown
              ts: string
              offset: unknown
            }
            Returns: string
          }
        | {
            Args: {
              bucket_width: unknown
              ts: string
              offset: unknown
            }
            Returns: string
          }
        | {
            Args: {
              bucket_width: unknown
              ts: string
              offset: unknown
            }
            Returns: string
          }
        | {
            Args: {
              bucket_width: unknown
              ts: string
              origin: string
            }
            Returns: string
          }
        | {
            Args: {
              bucket_width: unknown
              ts: string
              origin: string
            }
            Returns: string
          }
        | {
            Args: {
              bucket_width: unknown
              ts: string
              origin: string
            }
            Returns: string
          }
        | {
            Args: {
              bucket_width: unknown
              ts: string
              timezone: string
              origin?: string
              offset?: unknown
            }
            Returns: string
          }
      time_bucket_gapfill:
        | {
            Args: {
              bucket_width: number
              ts: number
              start?: number
              finish?: number
            }
            Returns: number
          }
        | {
            Args: {
              bucket_width: number
              ts: number
              start?: number
              finish?: number
            }
            Returns: number
          }
        | {
            Args: {
              bucket_width: number
              ts: number
              start?: number
              finish?: number
            }
            Returns: number
          }
        | {
            Args: {
              bucket_width: unknown
              ts: string
              start?: string
              finish?: string
            }
            Returns: string
          }
        | {
            Args: {
              bucket_width: unknown
              ts: string
              start?: string
              finish?: string
            }
            Returns: string
          }
        | {
            Args: {
              bucket_width: unknown
              ts: string
              start?: string
              finish?: string
            }
            Returns: string
          }
        | {
            Args: {
              bucket_width: unknown
              ts: string
              timezone: string
              start?: string
              finish?: string
            }
            Returns: string
          }
      timescaledb_fdw_handler: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      timescaledb_post_restore: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      timescaledb_pre_restore: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      update_customer_tags: {
        Args: {
          p_customer_uid: string
          p_project_id: number
          p_tags: string[]
        }
        Returns: undefined
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
          is_public: boolean
        }[]
      }
    }
    Enums: {
      doctype: "v0_form" | "v0_site" | "v0_schema" | "v0_canvas" | "v0_bucket"
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
  grida_sites: {
    Enums: {},
  },
  grida_storage: {
    Enums: {},
  },
  grida_west: {
    Enums: {
      campaign_type: ["referral"],
      participant_role: ["host", "guest"],
      token_type: ["mintable", "redeemable"],
    },
  },
  grida_x_supabase: {
    Enums: {
      sb_postgrest_method: ["get", "post", "delete", "patch"],
    },
  },
  public: {
    Enums: {
      doctype: ["v0_form", "v0_site", "v0_schema", "v0_canvas", "v0_bucket"],
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

