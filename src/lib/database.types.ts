// Hand-authored to match supabase/migrations/*.sql until a real Supabase
// project exists. Once it does, regenerate with:
//   npx supabase gen types typescript --project-id <id> --schema public > src/lib/database.types.ts
// and delete this comment.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          units: 'metric' | 'imperial';
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          units?: 'metric' | 'imperial';
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      bikes: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          make: string | null;
          model: string | null;
          year: number | null;
          current_odometer_km: number | null;
          vin: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          make?: string | null;
          model?: string | null;
          year?: number | null;
          current_odometer_km?: number | null;
          vin?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['bikes']['Insert']>;
        Relationships: [];
      };
      rides: {
        Row: {
          id: string;
          rider_id: string;
          bike_id: string | null;
          title: string | null;
          started_at: string;
          ended_at: string | null;
          distance_meters: number | null;
          duration_seconds: number | null;
          avg_speed_kmh: number | null;
          max_speed_kmh: number | null;
          elevation_gain_m: number | null;
          elevation_loss_m: number | null;
          lean_max_deg: number | null;
          lean_avg_deg: number | null;
          route_polyline: string | null;
          privacy_level: 'private' | 'friends' | 'public';
          created_at: string;
        };
        Insert: {
          id?: string;
          rider_id: string;
          bike_id?: string | null;
          title?: string | null;
          started_at: string;
          ended_at?: string | null;
          distance_meters?: number | null;
          duration_seconds?: number | null;
          avg_speed_kmh?: number | null;
          max_speed_kmh?: number | null;
          elevation_gain_m?: number | null;
          elevation_loss_m?: number | null;
          lean_max_deg?: number | null;
          lean_avg_deg?: number | null;
          route_polyline?: string | null;
          privacy_level?: 'private' | 'friends' | 'public';
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['rides']['Insert']>;
        Relationships: [];
      };
      ride_points: {
        Row: {
          id: number;
          ride_id: string;
          seq: number;
          recorded_at: string;
          lat: number;
          lng: number;
          altitude_m: number | null;
          speed_mps: number | null;
          accuracy_m: number | null;
        };
        Insert: {
          id?: number;
          ride_id: string;
          seq: number;
          recorded_at: string;
          lat: number;
          lng: number;
          altitude_m?: number | null;
          speed_mps?: number | null;
          accuracy_m?: number | null;
        };
        Update: Partial<Database['public']['Tables']['ride_points']['Insert']>;
        Relationships: [];
      };
      maintenance_records: {
        Row: {
          id: string;
          bike_id: string;
          type: 'oil_change' | 'chain' | 'tires' | 'brake_pads' | 'service' | 'other';
          performed_at: string;
          odometer_km: number | null;
          cost: number | null;
          notes: string | null;
          next_due_odometer_km: number | null;
          next_due_date: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          bike_id: string;
          type: 'oil_change' | 'chain' | 'tires' | 'brake_pads' | 'service' | 'other';
          performed_at: string;
          odometer_km?: number | null;
          cost?: number | null;
          notes?: string | null;
          next_due_odometer_km?: number | null;
          next_due_date?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['maintenance_records']['Insert']>;
        Relationships: [];
      };
      fuel_logs: {
        Row: {
          id: string;
          bike_id: string;
          filled_at: string;
          odometer_km: number | null;
          liters: number | null;
          cost: number | null;
          full_tank: boolean;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          bike_id: string;
          filled_at: string;
          odometer_km?: number | null;
          liters?: number | null;
          cost?: number | null;
          full_tank?: boolean;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['fuel_logs']['Insert']>;
        Relationships: [];
      };
      groups: {
        Row: {
          id: string;
          name: string;
          owner_id: string;
          description: string | null;
          avatar_url: string | null;
          invite_code: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          owner_id: string;
          description?: string | null;
          avatar_url?: string | null;
          invite_code?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['groups']['Insert']>;
        Relationships: [];
      };
      group_members: {
        Row: {
          group_id: string;
          profile_id: string;
          role: 'owner' | 'admin' | 'member';
          joined_at: string;
        };
        Insert: {
          group_id: string;
          profile_id: string;
          role?: 'owner' | 'admin' | 'member';
          joined_at?: string;
        };
        Update: Partial<Database['public']['Tables']['group_members']['Insert']>;
        Relationships: [];
      };
      group_messages: {
        Row: {
          id: string;
          group_id: string;
          sender_id: string;
          kind: 'text' | 'image';
          content: string | null;
          media_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          sender_id: string;
          kind?: 'text' | 'image';
          content?: string | null;
          media_url?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['group_messages']['Insert']>;
        Relationships: [];
      };
      live_locations: {
        Row: {
          id: string;
          group_id: string;
          profile_id: string;
          ride_id: string | null;
          lat: number;
          lng: number;
          heading: number | null;
          speed_mps: number | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          profile_id: string;
          ride_id?: string | null;
          lat: number;
          lng: number;
          heading?: number | null;
          speed_mps?: number | null;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['live_locations']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_group_by_invite_code: {
        Args: { code: string };
        Returns: Database['public']['Tables']['groups']['Row'];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
