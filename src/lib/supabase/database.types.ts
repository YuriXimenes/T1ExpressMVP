export type Json =
  string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      admins: {
        Row: {
          created_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admins_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      brazil_states: {
        Row: {
          name: string;
          uf: string;
        };
        Insert: {
          name: string;
          uf: string;
        };
        Update: {
          name?: string;
          uf?: string;
        };
        Relationships: [];
      };
      carrier_flat_rates: {
        Row: {
          carrier: Database["public"]["Enums"]["carrier_code"];
          flat_rate_brl: number;
        };
        Insert: {
          carrier: Database["public"]["Enums"]["carrier_code"];
          flat_rate_brl: number;
        };
        Update: {
          carrier?: Database["public"]["Enums"]["carrier_code"];
          flat_rate_brl?: number;
        };
        Relationships: [];
      };
      comparison_carriers: {
        Row: {
          id: string;
          is_highlighted: boolean;
          name: string;
          sort_order: number;
        };
        Insert: {
          id: string;
          is_highlighted?: boolean;
          name: string;
          sort_order: number;
        };
        Update: {
          id?: string;
          is_highlighted?: boolean;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      comparison_rows: {
        Row: {
          id: string;
          label: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          label: string;
          sort_order: number;
        };
        Update: {
          id?: string;
          label?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      comparison_values: {
        Row: {
          carrier_id: string;
          detail: string | null;
          row_id: string;
          status: Database["public"]["Enums"]["comparison_status"] | null;
          text: string;
        };
        Insert: {
          carrier_id: string;
          detail?: string | null;
          row_id: string;
          status?: Database["public"]["Enums"]["comparison_status"] | null;
          text: string;
        };
        Update: {
          carrier_id?: string;
          detail?: string | null;
          row_id?: string;
          status?: Database["public"]["Enums"]["comparison_status"] | null;
          text?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comparison_values_carrier_id_fkey";
            columns: ["carrier_id"];
            isOneToOne: false;
            referencedRelation: "comparison_carriers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comparison_values_row_id_fkey";
            columns: ["row_id"];
            isOneToOne: false;
            referencedRelation: "comparison_rows";
            referencedColumns: ["id"];
          },
        ];
      };
      coupons: {
        Row: {
          active: boolean;
          code: string;
          created_at: string;
          label: string;
          type: Database["public"]["Enums"]["coupon_type"];
          value: number;
        };
        Insert: {
          active?: boolean;
          code: string;
          created_at?: string;
          label: string;
          type: Database["public"]["Enums"]["coupon_type"];
          value: number;
        };
        Update: {
          active?: boolean;
          code?: string;
          created_at?: string;
          label?: string;
          type?: Database["public"]["Enums"]["coupon_type"];
          value?: number;
        };
        Relationships: [];
      };
      custom_preferred_stores: {
        Row: {
          address: string;
          created_at: string;
          id: string;
          name: string;
          profile_id: string;
        };
        Insert: {
          address: string;
          created_at?: string;
          id?: string;
          name: string;
          profile_id: string;
        };
        Update: {
          address?: string;
          created_at?: string;
          id?: string;
          name?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "custom_preferred_stores_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      freight_routes: {
        Row: {
          created_at: string;
          destination_store_id: string;
          id: string;
          loggi_brl: number;
          origin_store_id: string;
          uber_brl: number | null;
        };
        Insert: {
          created_at?: string;
          destination_store_id: string;
          id?: string;
          loggi_brl: number;
          origin_store_id: string;
          uber_brl?: number | null;
        };
        Update: {
          created_at?: string;
          destination_store_id?: string;
          id?: string;
          loggi_brl?: number;
          origin_store_id?: string;
          uber_brl?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "freight_routes_destination_store_id_fkey";
            columns: ["destination_store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "freight_routes_origin_store_id_fkey";
            columns: ["origin_store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      order_origin_stores: {
        Row: {
          order_id: string;
          store_id: string;
        };
        Insert: {
          order_id: string;
          store_id: string;
        };
        Update: {
          order_id?: string;
          store_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_origin_stores_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_origin_stores_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      order_quote_competitors: {
        Row: {
          carrier: Database["public"]["Enums"]["carrier_code"];
          eta_label: string;
          id: string;
          label: string;
          order_id: string;
          total_brl: number;
        };
        Insert: {
          carrier: Database["public"]["Enums"]["carrier_code"];
          eta_label: string;
          id?: string;
          label: string;
          order_id: string;
          total_brl: number;
        };
        Update: {
          carrier?: Database["public"]["Enums"]["carrier_code"];
          eta_label?: string;
          id?: string;
          label?: string;
          order_id?: string;
          total_brl?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_quote_competitors_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          amount_due_brl: number;
          cancel_reason: string | null;
          completed_at: string | null;
          coupon_code: string | null;
          coupon_discount_brl: number | null;
          coupon_type: Database["public"]["Enums"]["coupon_type"] | null;
          coupon_value: number | null;
          created_at: string;
          delivery_note: string;
          delivery_stage: Database["public"]["Enums"]["delivery_stage"] | null;
          destination_store_id: string;
          estimated_pickup_date: string | null;
          freight_after_discount_brl: number;
          id: string;
          insurance_coverage_brl: number;
          insurance_extra_cost_brl: number;
          insurance_opted_in: boolean;
          items_total_brl: number;
          paid_at: string | null;
          payment_method: Database["public"]["Enums"]["payment_method"] | null;
          quote_cheapest_savings_brl: number | null;
          quote_distance_label: string | null;
          quote_estimated_days_max: number;
          quote_estimated_days_min: number;
          quote_price_brl: number;
          status: Database["public"]["Enums"]["order_status"];
          user_id: string;
        };
        Insert: {
          amount_due_brl: number;
          cancel_reason?: string | null;
          completed_at?: string | null;
          coupon_code?: string | null;
          coupon_discount_brl?: number | null;
          coupon_type?: Database["public"]["Enums"]["coupon_type"] | null;
          coupon_value?: number | null;
          created_at?: string;
          delivery_note?: string;
          delivery_stage?: Database["public"]["Enums"]["delivery_stage"] | null;
          destination_store_id: string;
          estimated_pickup_date?: string | null;
          freight_after_discount_brl: number;
          id?: string;
          insurance_coverage_brl?: number;
          insurance_extra_cost_brl?: number;
          insurance_opted_in?: boolean;
          items_total_brl?: number;
          paid_at?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method"] | null;
          quote_cheapest_savings_brl?: number | null;
          quote_distance_label?: string | null;
          quote_estimated_days_max: number;
          quote_estimated_days_min: number;
          quote_price_brl: number;
          status?: Database["public"]["Enums"]["order_status"];
          user_id: string;
        };
        Update: {
          amount_due_brl?: number;
          cancel_reason?: string | null;
          completed_at?: string | null;
          coupon_code?: string | null;
          coupon_discount_brl?: number | null;
          coupon_type?: Database["public"]["Enums"]["coupon_type"] | null;
          coupon_value?: number | null;
          created_at?: string;
          delivery_note?: string;
          delivery_stage?: Database["public"]["Enums"]["delivery_stage"] | null;
          destination_store_id?: string;
          estimated_pickup_date?: string | null;
          freight_after_discount_brl?: number;
          id?: string;
          insurance_coverage_brl?: number;
          insurance_extra_cost_brl?: number;
          insurance_opted_in?: boolean;
          items_total_brl?: number;
          paid_at?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method"] | null;
          quote_cheapest_savings_brl?: number | null;
          quote_distance_label?: string | null;
          quote_estimated_days_max?: number;
          quote_estimated_days_min?: number;
          quote_price_brl?: number;
          status?: Database["public"]["Enums"]["order_status"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_coupon_code_fkey";
            columns: ["coupon_code"];
            isOneToOne: false;
            referencedRelation: "coupons";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "orders_destination_store_id_fkey";
            columns: ["destination_store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      partner_leads: {
        Row: {
          city: string;
          complement: string | null;
          contact_email: string;
          contact_name: string;
          contact_phone: string;
          contacted: boolean;
          created_at: string;
          games: Database["public"]["Enums"]["game_tag"][];
          id: string;
          message: string | null;
          number: string;
          other_games: string[];
          state: string;
          store_name: string;
          street: string;
          wants_dropoff: boolean;
          wants_pickup: boolean;
          website: string | null;
        };
        Insert: {
          city: string;
          complement?: string | null;
          contact_email: string;
          contact_name: string;
          contact_phone: string;
          contacted?: boolean;
          created_at?: string;
          games?: Database["public"]["Enums"]["game_tag"][];
          id?: string;
          message?: string | null;
          number: string;
          other_games?: string[];
          state: string;
          store_name: string;
          street: string;
          wants_dropoff?: boolean;
          wants_pickup?: boolean;
          website?: string | null;
        };
        Update: {
          city?: string;
          complement?: string | null;
          contact_email?: string;
          contact_name?: string;
          contact_phone?: string;
          contacted?: boolean;
          created_at?: string;
          games?: Database["public"]["Enums"]["game_tag"][];
          id?: string;
          message?: string | null;
          number?: string;
          other_games?: string[];
          state?: string;
          store_name?: string;
          street?: string;
          wants_dropoff?: boolean;
          wants_pickup?: boolean;
          website?: string | null;
        };
        Relationships: [];
      };
      pedido_accessory_items: {
        Row: {
          accessory: Database["public"]["Enums"]["accessory_kind"];
          group_id: string;
          id: string;
          other_accessory: string | null;
          price: number;
          price_mode: Database["public"]["Enums"]["price_mode"];
          quantity: number;
          sort_order: number;
        };
        Insert: {
          accessory: Database["public"]["Enums"]["accessory_kind"];
          group_id: string;
          id?: string;
          other_accessory?: string | null;
          price: number;
          price_mode: Database["public"]["Enums"]["price_mode"];
          quantity: number;
          sort_order?: number;
        };
        Update: {
          accessory?: Database["public"]["Enums"]["accessory_kind"];
          group_id?: string;
          id?: string;
          other_accessory?: string | null;
          price?: number;
          price_mode?: Database["public"]["Enums"]["price_mode"];
          quantity?: number;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "pedido_accessory_items_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "pedido_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      pedido_card_items: {
        Row: {
          card_name: string;
          game: Database["public"]["Enums"]["game_tag"];
          group_id: string;
          id: string;
          other_game: string | null;
          price: number;
          price_mode: Database["public"]["Enums"]["price_mode"];
          quantity: number;
          sort_order: number;
        };
        Insert: {
          card_name: string;
          game: Database["public"]["Enums"]["game_tag"];
          group_id: string;
          id?: string;
          other_game?: string | null;
          price: number;
          price_mode: Database["public"]["Enums"]["price_mode"];
          quantity: number;
          sort_order?: number;
        };
        Update: {
          card_name?: string;
          game?: Database["public"]["Enums"]["game_tag"];
          group_id?: string;
          id?: string;
          other_game?: string | null;
          price?: number;
          price_mode?: Database["public"]["Enums"]["price_mode"];
          quantity?: number;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "pedido_card_items_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "pedido_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      pedido_groups: {
        Row: {
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["pedido_kind"];
          order_id: string | null;
          order_number: string;
          sort_order: number;
          store_charge_id: string | null;
          store_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["pedido_kind"];
          order_id?: string | null;
          order_number?: string;
          sort_order?: number;
          store_charge_id?: string | null;
          store_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["pedido_kind"];
          order_id?: string | null;
          order_number?: string;
          sort_order?: number;
          store_charge_id?: string | null;
          store_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pedido_groups_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pedido_groups_store_charge_id_fkey";
            columns: ["store_charge_id"];
            isOneToOne: false;
            referencedRelation: "store_charges";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pedido_groups_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_preferred_stores: {
        Row: {
          profile_id: string;
          store_id: string;
        };
        Insert: {
          profile_id: string;
          store_id: string;
        };
        Update: {
          profile_id?: string;
          store_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_preferred_stores_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_preferred_stores_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          city: string | null;
          complement: string | null;
          created_at: string;
          email: string;
          games: Database["public"]["Enums"]["game_tag"][];
          id: string;
          name: string;
          neighborhood: string | null;
          other_games: string[];
          phone: string | null;
          state: string | null;
          street: string | null;
          street_number: string | null;
          updated_at: string;
          zip: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          city?: string | null;
          complement?: string | null;
          created_at?: string;
          email: string;
          games?: Database["public"]["Enums"]["game_tag"][];
          id: string;
          name: string;
          neighborhood?: string | null;
          other_games?: string[];
          phone?: string | null;
          state?: string | null;
          street?: string | null;
          street_number?: string | null;
          updated_at?: string;
          zip?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          city?: string | null;
          complement?: string | null;
          created_at?: string;
          email?: string;
          games?: Database["public"]["Enums"]["game_tag"][];
          id?: string;
          name?: string;
          neighborhood?: string | null;
          other_games?: string[];
          phone?: string | null;
          state?: string | null;
          street?: string | null;
          street_number?: string | null;
          updated_at?: string;
          zip?: string | null;
        };
        Relationships: [];
      };
      store_charge_stores: {
        Row: {
          charge_id: string;
          store_id: string;
        };
        Insert: {
          charge_id: string;
          store_id: string;
        };
        Update: {
          charge_id?: string;
          store_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "store_charge_stores_charge_id_fkey";
            columns: ["charge_id"];
            isOneToOne: false;
            referencedRelation: "store_charges";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "store_charge_stores_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      store_charges: {
        Row: {
          amount_brl: number;
          created_at: string;
          id: string;
          insurance_upgrade_coverage_brl: number | null;
          insurance_upgrade_extra_cost_brl: number | null;
          items_total_added_brl: number;
          order_id: string;
          paid_at: string | null;
          payment_method: Database["public"]["Enums"]["payment_method"] | null;
          status: Database["public"]["Enums"]["store_charge_status"];
        };
        Insert: {
          amount_brl: number;
          created_at?: string;
          id?: string;
          insurance_upgrade_coverage_brl?: number | null;
          insurance_upgrade_extra_cost_brl?: number | null;
          items_total_added_brl?: number;
          order_id: string;
          paid_at?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method"] | null;
          status?: Database["public"]["Enums"]["store_charge_status"];
        };
        Update: {
          amount_brl?: number;
          created_at?: string;
          id?: string;
          insurance_upgrade_coverage_brl?: number | null;
          insurance_upgrade_extra_cost_brl?: number | null;
          items_total_added_brl?: number;
          order_id?: string;
          paid_at?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method"] | null;
          status?: Database["public"]["Enums"]["store_charge_status"];
        };
        Relationships: [
          {
            foreignKeyName: "store_charges_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      store_suggestions: {
        Row: {
          comment: string | null;
          contacted: boolean;
          created_at: string;
          id: string;
          store_address: string;
          store_name: string;
        };
        Insert: {
          comment?: string | null;
          contacted?: boolean;
          created_at?: string;
          id?: string;
          store_address: string;
          store_name: string;
        };
        Update: {
          comment?: string | null;
          contacted?: boolean;
          created_at?: string;
          id?: string;
          store_address?: string;
          store_name?: string;
        };
        Relationships: [];
      };
      stores: {
        Row: {
          address: string;
          city: string;
          code: string;
          created_at: string;
          id: string;
          is_pickup_point: boolean;
          lat: number | null;
          lng: number | null;
          logo_on_dark: boolean;
          logo_path: string | null;
          name: string;
          neighborhood: string | null;
          pickup_sort_order: number | null;
          state: string;
        };
        Insert: {
          address: string;
          city: string;
          code: string;
          created_at?: string;
          id?: string;
          is_pickup_point?: boolean;
          lat?: number | null;
          lng?: number | null;
          logo_on_dark?: boolean;
          logo_path?: string | null;
          name: string;
          neighborhood?: string | null;
          pickup_sort_order?: number | null;
          state: string;
        };
        Update: {
          address?: string;
          city?: string;
          code?: string;
          created_at?: string;
          id?: string;
          is_pickup_point?: boolean;
          lat?: number | null;
          lng?: number | null;
          logo_on_dark?: boolean;
          logo_path?: string | null;
          name?: string;
          neighborhood?: string | null;
          pickup_sort_order?: number | null;
          state?: string;
        };
        Relationships: [];
      };
      support_tickets: {
        Row: {
          created_at: string;
          id: string;
          message: string;
          order_id: string;
          resolved: boolean;
          subject: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message: string;
          order_id: string;
          resolved?: boolean;
          subject: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message?: string;
          order_id?: string;
          resolved?: boolean;
          subject?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_tickets_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      _insert_pedido_groups: {
        Args: {
          p_allowed_store_ids: string[];
          p_charge_id: string;
          p_groups: Json;
          p_order_id: string;
        };
        Returns: number;
      };
      _insurance_needed: { Args: { p_items_total: number }; Returns: number };
      _json_num: {
        Args: { hi: number; j: Json; k: string; lo: number; whole?: boolean };
        Returns: number;
      };
      _require_admin: { Args: never; Returns: undefined };
      add_groups_to_order: {
        Args: { p_groups: Json; p_order: string };
        Returns: undefined;
      };
      add_store_charge: { Args: { p: Json; p_order: string }; Returns: string };
      admin_add_admin: { Args: { p_email: string }; Returns: string };
      admin_cancel_order: {
        Args: { p_order: string; p_reason?: string };
        Returns: undefined;
      };
      admin_complete_order: { Args: { p_order: string }; Returns: undefined };
      admin_delete_comparison_carrier: {
        Args: { p_carrier_id: string };
        Returns: undefined;
      };
      admin_delete_comparison_row: {
        Args: { p_row_id: string };
        Returns: undefined;
      };
      admin_delete_freight_route: {
        Args: { p_route_id: string };
        Returns: undefined;
      };
      admin_delete_store: { Args: { p_store_id: string }; Returns: undefined };
      admin_remove_admin: {
        Args: { p_target_user_id: string };
        Returns: undefined;
      };
      admin_set_lead_contacted: {
        Args: { p_contacted: boolean; p_lead_id: string };
        Returns: undefined;
      };
      admin_set_suggestion_contacted: {
        Args: { p_contacted: boolean; p_suggestion_id: string };
        Returns: undefined;
      };
      admin_set_ticket_resolved: {
        Args: { p_resolved: boolean; p_ticket_id: string };
        Returns: undefined;
      };
      admin_update_correios_rate: {
        Args: { p_flat_rate_brl: number };
        Returns: undefined;
      };
      admin_upsert_comparison_carrier: {
        Args: { p: Json; p_carrier_id: string };
        Returns: undefined;
      };
      admin_upsert_comparison_row: {
        Args: { p: Json; p_row_id: string };
        Returns: string;
      };
      admin_upsert_comparison_value: {
        Args: { p: Json; p_carrier_id: string; p_row_id: string };
        Returns: undefined;
      };
      admin_upsert_coupon: {
        Args: { p: Json; p_code: string };
        Returns: undefined;
      };
      admin_upsert_freight_route: {
        Args: { p: Json; p_route_id: string };
        Returns: string;
      };
      admin_upsert_store: {
        Args: { p: Json; p_store_id: string };
        Returns: string;
      };
      advance_delivery_stage: {
        Args: { p_order: string };
        Returns: Database["public"]["Enums"]["delivery_stage"];
      };
      complete_order: { Args: { p_order: string }; Returns: undefined };
      create_order: { Args: { p: Json }; Returns: string };
      create_support_ticket: {
        Args: { p_message: string; p_order: string; p_subject: string };
        Returns: string;
      };
      is_admin: { Args: never; Returns: boolean };
      pay_order: {
        Args: {
          p_method: Database["public"]["Enums"]["payment_method"];
          p_order: string;
        };
        Returns: undefined;
      };
      pay_store_charge: {
        Args: {
          p_charge: string;
          p_method: Database["public"]["Enums"]["payment_method"];
        };
        Returns: undefined;
      };
      submit_partner_lead: { Args: { p: Json }; Returns: undefined };
      submit_store_suggestion: { Args: { p: Json }; Returns: undefined };
    };
    Enums: {
      accessory_kind:
        "sleeve" | "perfect-fit" | "playmat" | "fichario" | "case" | "outro";
      carrier_code: "uber" | "loggi" | "correios";
      comparison_status: "positive" | "negative" | "neutral";
      coupon_type: "percent" | "flat";
      delivery_stage: "aguardando-coleta" | "em-transporte" | "disponivel-para-retirada";
      game_tag: "magic" | "pokemon" | "yugioh" | "lorcana" | "fab" | "outro";
      order_status: "pending-payment" | "active" | "completed" | "cancelled";
      payment_method: "pix" | "credit-card";
      pedido_kind: "cartas-avulsas" | "boosters" | "deck-box" | "acessorios";
      price_mode: "unit" | "total";
      store_charge_status: "pending-payment" | "paid";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      accessory_kind: ["sleeve", "perfect-fit", "playmat", "fichario", "case", "outro"],
      carrier_code: ["uber", "loggi", "correios"],
      comparison_status: ["positive", "negative", "neutral"],
      coupon_type: ["percent", "flat"],
      delivery_stage: ["aguardando-coleta", "em-transporte", "disponivel-para-retirada"],
      game_tag: ["magic", "pokemon", "yugioh", "lorcana", "fab", "outro"],
      order_status: ["pending-payment", "active", "completed", "cancelled"],
      payment_method: ["pix", "credit-card"],
      pedido_kind: ["cartas-avulsas", "boosters", "deck-box", "acessorios"],
      price_mode: ["unit", "total"],
      store_charge_status: ["pending-payment", "paid"],
    },
  },
} as const;
