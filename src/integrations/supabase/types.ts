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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_usage_tracking: {
        Row: {
          daily_limit: number
          last_reset_at: string
          message_count: number
          user_id: string
        }
        Insert: {
          daily_limit?: number
          last_reset_at?: string
          message_count?: number
          user_id: string
        }
        Update: {
          daily_limit?: number
          last_reset_at?: string
          message_count?: number
          user_id?: string
        }
        Relationships: []
      }
      athlete_ai_insights: {
        Row: {
          action_items: string[]
          athlete_id: string
          coach_id: string
          created_at: string
          id: string
          insight_text: string
          sentiment_score: number
          week_start_date: string
        }
        Insert: {
          action_items?: string[]
          athlete_id: string
          coach_id: string
          created_at?: string
          id?: string
          insight_text: string
          sentiment_score?: number
          week_start_date: string
        }
        Update: {
          action_items?: string[]
          athlete_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          insight_text?: string
          sentiment_score?: number
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_ai_insights_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "athlete_ai_insights_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_ai_insights_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "athlete_ai_insights_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_cycle_settings: {
        Row: {
          athlete_id: string
          auto_regulation_enabled: boolean
          contraceptive_type: string | null
          created_at: string
          cycle_length_days: number
          id: string
          last_period_start_date: string | null
          updated_at: string
        }
        Insert: {
          athlete_id: string
          auto_regulation_enabled?: boolean
          contraceptive_type?: string | null
          created_at?: string
          cycle_length_days?: number
          id?: string
          last_period_start_date?: string | null
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          auto_regulation_enabled?: boolean
          contraceptive_type?: string | null
          created_at?: string
          cycle_length_days?: number
          id?: string
          last_period_start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_cycle_settings_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: true
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "athlete_cycle_settings_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_habits: {
        Row: {
          active: boolean
          athlete_id: string
          created_at: string
          frequency: string
          habit_id: string
          id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          athlete_id: string
          created_at?: string
          frequency?: string
          habit_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          athlete_id?: string
          created_at?: string
          frequency?: string
          habit_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_habits_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits_library"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_subscriptions: {
        Row: {
          athlete_id: string
          created_at: string
          current_period_end: string | null
          id: string
          plan_id: string
          status: Database["public"]["Enums"]["billing_sub_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_id: string
          status?: Database["public"]["Enums"]["billing_sub_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_id?: string
          status?: Database["public"]["Enums"]["billing_sub_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      badges: {
        Row: {
          category: string
          created_at: string
          description: string
          icon_key: string
          id: string
          name: string
          threshold_value: number | null
        }
        Insert: {
          category?: string
          created_at?: string
          description: string
          icon_key: string
          id: string
          name: string
          threshold_value?: number | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          icon_key?: string
          id?: string
          name?: string
          threshold_value?: number | null
        }
        Relationships: []
      }
      billing_plans: {
        Row: {
          active: boolean
          billing_interval: string
          coach_id: string
          created_at: string
          currency: string
          description: string | null
          id: string
          name: string
          price_amount: number
          stripe_price_id: string | null
          stripe_product_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          billing_interval?: string
          coach_id: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          name: string
          price_amount?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          billing_interval?: string
          coach_id?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          name?: string
          price_amount?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      body_measurements: {
        Row: {
          athlete_id: string
          body_fat_percentage: number | null
          created_at: string
          date: string
          id: string
          muscle_mass_kg: number | null
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          athlete_id: string
          body_fat_percentage?: number | null
          created_at?: string
          date?: string
          id?: string
          muscle_mass_kg?: number | null
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          athlete_id?: string
          body_fat_percentage?: number | null
          created_at?: string
          date?: string
          id?: string
          muscle_mass_kg?: number | null
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "body_measurements_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "body_measurements_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_participants: {
        Row: {
          id: string
          joined_at: string
          last_read_at: string | null
          room_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          last_read_at?: string | null
          room_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          last_read_at?: string | null
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "chat_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_rooms: {
        Row: {
          created_at: string
          id: string
          name: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      coach_alerts: {
        Row: {
          athlete_id: string
          coach_id: string
          created_at: string
          dismissed: boolean
          id: string
          link: string | null
          message: string
          read: boolean
          severity: string
          type: string
          workout_log_id: string | null
        }
        Insert: {
          athlete_id: string
          coach_id: string
          created_at?: string
          dismissed?: boolean
          id?: string
          link?: string | null
          message: string
          read?: boolean
          severity?: string
          type?: string
          workout_log_id?: string | null
        }
        Update: {
          athlete_id?: string
          coach_id?: string
          created_at?: string
          dismissed?: boolean
          id?: string
          link?: string | null
          message?: string
          read?: boolean
          severity?: string
          type?: string
          workout_log_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_alerts_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "coach_alerts_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_alerts_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "coach_alerts_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_alerts_workout_log_id_fkey"
            columns: ["workout_log_id"]
            isOneToOne: false
            referencedRelation: "workout_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_knowledge_base: {
        Row: {
          coach_id: string
          content: string
          created_at: string
          embedding: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          coach_id: string
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          coach_id?: string
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      coach_products: {
        Row: {
          active: boolean
          billing_period: string
          coach_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          billing_period?: string
          coach_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          billing_period?: string
          coach_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_products_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "coach_products_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_library: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          tags: string[] | null
          title: string
          type: Database["public"]["Enums"]["content_type"]
          url: string | null
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          tags?: string[] | null
          title: string
          type?: Database["public"]["Enums"]["content_type"]
          url?: string | null
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          tags?: string[] | null
          title?: string
          type?: Database["public"]["Enums"]["content_type"]
          url?: string | null
        }
        Relationships: []
      }
      custom_foods: {
        Row: {
          athlete_id: string
          biotin_b7: number | null
          carbs: number | null
          created_at: string
          energy_kcal: number | null
          energy_kj: number | null
          fat: number | null
          fiber: number | null
          folic_acid_b9: number | null
          id: string
          name: string
          niacin_b3: number | null
          pantothenic_acid_b5: number | null
          protein: number | null
          riboflavin_b2: number | null
          salt: number | null
          saturated_fat: number | null
          sugars: number | null
          thiamine_b1: number | null
          updated_at: string
          vitamin_a: number | null
          vitamin_b12: number | null
          vitamin_b6: number | null
          vitamin_c: number | null
          vitamin_d: number | null
          vitamin_e: number | null
          vitamin_k: number | null
        }
        Insert: {
          athlete_id: string
          biotin_b7?: number | null
          carbs?: number | null
          created_at?: string
          energy_kcal?: number | null
          energy_kj?: number | null
          fat?: number | null
          fiber?: number | null
          folic_acid_b9?: number | null
          id?: string
          name: string
          niacin_b3?: number | null
          pantothenic_acid_b5?: number | null
          protein?: number | null
          riboflavin_b2?: number | null
          salt?: number | null
          saturated_fat?: number | null
          sugars?: number | null
          thiamine_b1?: number | null
          updated_at?: string
          vitamin_a?: number | null
          vitamin_b12?: number | null
          vitamin_b6?: number | null
          vitamin_c?: number | null
          vitamin_d?: number | null
          vitamin_e?: number | null
          vitamin_k?: number | null
        }
        Update: {
          athlete_id?: string
          biotin_b7?: number | null
          carbs?: number | null
          created_at?: string
          energy_kcal?: number | null
          energy_kj?: number | null
          fat?: number | null
          fiber?: number | null
          folic_acid_b9?: number | null
          id?: string
          name?: string
          niacin_b3?: number | null
          pantothenic_acid_b5?: number | null
          protein?: number | null
          riboflavin_b2?: number | null
          salt?: number | null
          saturated_fat?: number | null
          sugars?: number | null
          thiamine_b1?: number | null
          updated_at?: string
          vitamin_a?: number | null
          vitamin_b12?: number | null
          vitamin_b6?: number | null
          vitamin_c?: number | null
          vitamin_d?: number | null
          vitamin_e?: number | null
          vitamin_k?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_foods_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "custom_foods_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_cycle_logs: {
        Row: {
          athlete_id: string
          created_at: string
          current_phase: Database["public"]["Enums"]["cycle_phase"]
          date: string
          id: string
          notes: string | null
          symptom_tags: string[] | null
        }
        Insert: {
          athlete_id: string
          created_at?: string
          current_phase: Database["public"]["Enums"]["cycle_phase"]
          date?: string
          id?: string
          notes?: string | null
          symptom_tags?: string[] | null
        }
        Update: {
          athlete_id?: string
          created_at?: string
          current_phase?: Database["public"]["Enums"]["cycle_phase"]
          date?: string
          id?: string
          notes?: string | null
          symptom_tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_cycle_logs_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "daily_cycle_logs_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_metrics: {
        Row: {
          body_weight_kg: number | null
          calories_consumed: number | null
          created_at: string
          date: string
          hrv_ms: number | null
          hrv_rmssd: number | null
          id: string
          notes: string | null
          readiness_score: number | null
          resting_hr: number | null
          sleep_hours: number | null
          subjective_readiness: number | null
          updated_at: string
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          body_weight_kg?: number | null
          calories_consumed?: number | null
          created_at?: string
          date?: string
          hrv_ms?: number | null
          hrv_rmssd?: number | null
          id?: string
          notes?: string | null
          readiness_score?: number | null
          resting_hr?: number | null
          sleep_hours?: number | null
          subjective_readiness?: number | null
          updated_at?: string
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          body_weight_kg?: number | null
          calories_consumed?: number | null
          created_at?: string
          date?: string
          hrv_ms?: number | null
          hrv_rmssd?: number | null
          id?: string
          notes?: string | null
          readiness_score?: number | null
          resting_hr?: number | null
          sleep_hours?: number | null
          subjective_readiness?: number | null
          updated_at?: string
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_metrics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "daily_metrics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_readiness: {
        Row: {
          athlete_id: string
          body_weight: number | null
          created_at: string
          date: string
          digestion: number | null
          energy: number | null
          fatigue_score: number | null
          has_pain: boolean | null
          id: string
          mood: number | null
          notes: string | null
          score: number | null
          sleep_hours: number | null
          sleep_quality: number | null
          soreness_map: Json | null
          stress_level: number | null
        }
        Insert: {
          athlete_id: string
          body_weight?: number | null
          created_at?: string
          date?: string
          digestion?: number | null
          energy?: number | null
          fatigue_score?: number | null
          has_pain?: boolean | null
          id?: string
          mood?: number | null
          notes?: string | null
          score?: number | null
          sleep_hours?: number | null
          sleep_quality?: number | null
          soreness_map?: Json | null
          stress_level?: number | null
        }
        Update: {
          athlete_id?: string
          body_weight?: number | null
          created_at?: string
          date?: string
          digestion?: number | null
          energy?: number | null
          fatigue_score?: number | null
          has_pain?: boolean | null
          id?: string
          mood?: number | null
          notes?: string | null
          score?: number | null
          sleep_hours?: number | null
          sleep_quality?: number | null
          soreness_map?: Json | null
          stress_level?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_readiness_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "daily_readiness_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_logs: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          is_completed: boolean
          reps: number
          session_id: string
          set_number: number
          weight: number
        }
        Insert: {
          created_at?: string
          exercise_id: string
          id?: string
          is_completed?: boolean
          reps?: number
          session_id: string
          set_number: number
          weight?: number
        }
        Update: {
          created_at?: string
          exercise_id?: string
          id?: string
          is_completed?: boolean
          reps?: number
          session_id?: string
          set_number?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "exercise_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          archived: boolean
          coach_id: string
          created_at: string
          default_rpe: number | null
          exercise_type: string
          id: string
          movement_pattern: string | null
          muscles: string[]
          name: string
          notes: string | null
          secondary_muscles: string[]
          tracking_fields: string[]
          updated_at: string
          video_url: string | null
        }
        Insert: {
          archived?: boolean
          coach_id: string
          created_at?: string
          default_rpe?: number | null
          exercise_type?: string
          id?: string
          movement_pattern?: string | null
          muscles?: string[]
          name: string
          notes?: string | null
          secondary_muscles?: string[]
          tracking_fields?: string[]
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          archived?: boolean
          coach_id?: string
          created_at?: string
          default_rpe?: number | null
          exercise_type?: string
          id?: string
          movement_pattern?: string | null
          muscles?: string[]
          name?: string
          notes?: string | null
          secondary_muscles?: string[]
          tracking_fields?: string[]
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      fms_assessments: {
        Row: {
          assessment_date: string
          athlete_id: string
          coach_id: string
          composite_total: number | null
          created_at: string
          id: string
          is_complete: boolean
          payload: Json
          updated_at: string
        }
        Insert: {
          assessment_date: string
          athlete_id: string
          coach_id: string
          composite_total?: number | null
          created_at?: string
          id: string
          is_complete?: boolean
          payload: Json
          updated_at?: string
        }
        Update: {
          assessment_date?: string
          athlete_id?: string
          coach_id?: string
          composite_total?: number | null
          created_at?: string
          id?: string
          is_complete?: boolean
          payload?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fms_assessments_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "fms_assessments_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fms_assessments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "fms_assessments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fms_tests: {
        Row: {
          active_straight_leg_l: number | null
          active_straight_leg_r: number | null
          athlete_id: string
          created_at: string
          deep_squat: number | null
          hurdle_step_l: number | null
          hurdle_step_r: number | null
          id: string
          inline_lunge_l: number | null
          inline_lunge_r: number | null
          notes: string | null
          rotary_stability_l: number | null
          rotary_stability_r: number | null
          shoulder_mobility_l: number | null
          shoulder_mobility_r: number | null
          test_date: string
          trunk_stability: number | null
        }
        Insert: {
          active_straight_leg_l?: number | null
          active_straight_leg_r?: number | null
          athlete_id: string
          created_at?: string
          deep_squat?: number | null
          hurdle_step_l?: number | null
          hurdle_step_r?: number | null
          id?: string
          inline_lunge_l?: number | null
          inline_lunge_r?: number | null
          notes?: string | null
          rotary_stability_l?: number | null
          rotary_stability_r?: number | null
          shoulder_mobility_l?: number | null
          shoulder_mobility_r?: number | null
          test_date?: string
          trunk_stability?: number | null
        }
        Update: {
          active_straight_leg_l?: number | null
          active_straight_leg_r?: number | null
          athlete_id?: string
          created_at?: string
          deep_squat?: number | null
          hurdle_step_l?: number | null
          hurdle_step_r?: number | null
          id?: string
          inline_lunge_l?: number | null
          inline_lunge_r?: number | null
          notes?: string | null
          rotary_stability_l?: number | null
          rotary_stability_r?: number | null
          shoulder_mobility_l?: number | null
          shoulder_mobility_r?: number | null
          test_date?: string
          trunk_stability?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fms_tests_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "fms_tests_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_logs: {
        Row: {
          athlete_habit_id: string
          athlete_id: string
          completed: boolean
          completed_at: string
          created_at: string
          date: string
          id: string
        }
        Insert: {
          athlete_habit_id: string
          athlete_id: string
          completed?: boolean
          completed_at?: string
          created_at?: string
          date?: string
          id?: string
        }
        Update: {
          athlete_habit_id?: string
          athlete_id?: string
          completed?: boolean
          completed_at?: string
          created_at?: string
          date?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_logs_athlete_habit_id_fkey"
            columns: ["athlete_habit_id"]
            isOneToOne: false
            referencedRelation: "athlete_habits"
            referencedColumns: ["id"]
          },
        ]
      }
      habits_library: {
        Row: {
          category: string
          coach_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          category?: string
          coach_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          category?: string
          coach_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      injuries: {
        Row: {
          athlete_id: string
          body_zone: string
          created_at: string
          description: string | null
          id: string
          injury_date: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          athlete_id: string
          body_zone: string
          created_at?: string
          description?: string | null
          id?: string
          injury_date?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          body_zone?: string
          created_at?: string
          description?: string | null
          id?: string
          injury_date?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "injuries_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "injuries_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_tokens: {
        Row: {
          coach_id: string
          created_at: string
          email: string
          expires_at: string
          full_name: string
          id: string
          token: string
          used: boolean
        }
        Insert: {
          coach_id: string
          created_at?: string
          email: string
          expires_at?: string
          full_name: string
          id?: string
          token?: string
          used?: boolean
        }
        Update: {
          coach_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          full_name?: string
          id?: string
          token?: string
          used?: boolean
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          athlete_id: string
          coach_id: string
          created_at: string
          id: string
          invoice_date: string
          notes: string | null
          paid_at: string | null
          product_id: string | null
          status: string
        }
        Insert: {
          amount: number
          athlete_id: string
          coach_id: string
          created_at?: string
          id?: string
          invoice_date?: string
          notes?: string | null
          paid_at?: string | null
          product_id?: string | null
          status?: string
        }
        Update: {
          amount?: number
          athlete_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          invoice_date?: string
          notes?: string | null
          paid_at?: string | null
          product_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "invoices_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "invoices_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "coach_products"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          coach_id: string
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
        }
        Insert: {
          chunk_index: number
          coach_id: string
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
        }
        Update: {
          chunk_index?: number
          coach_id?: string
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          chunk_count: number
          coach_id: string
          created_at: string
          error_message: string | null
          id: string
          status: Database["public"]["Enums"]["knowledge_doc_status"]
          title: string
          updated_at: string
        }
        Insert: {
          chunk_count?: number
          coach_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          status?: Database["public"]["Enums"]["knowledge_doc_status"]
          title: string
          updated_at?: string
        }
        Update: {
          chunk_count?: number
          coach_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          status?: Database["public"]["Enums"]["knowledge_doc_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      leaderboard_cache: {
        Row: {
          coach_id: string | null
          id: string
          max_load_kg: number
          streak_weeks: number
          updated_at: string
          user_id: string
          week_volume: number
          workout_count: number
        }
        Insert: {
          coach_id?: string | null
          id?: string
          max_load_kg?: number
          streak_weeks?: number
          updated_at?: string
          user_id: string
          week_volume?: number
          workout_count?: number
        }
        Update: {
          coach_id?: string | null
          id?: string
          max_load_kg?: number
          streak_weeks?: number
          updated_at?: string
          user_id?: string
          week_volume?: number
          workout_count?: number
        }
        Relationships: []
      }
      meal_logs: {
        Row: {
          calories: number
          carbs: number
          confidence_score: number | null
          created_at: string
          date: string
          fats: number
          id: string
          meal_time: Database["public"]["Enums"]["meal_time"]
          name: string
          notes: string | null
          photo_url: string | null
          protein: number
          user_id: string
        }
        Insert: {
          calories?: number
          carbs?: number
          confidence_score?: number | null
          created_at?: string
          date?: string
          fats?: number
          id?: string
          meal_time?: Database["public"]["Enums"]["meal_time"]
          name: string
          notes?: string | null
          photo_url?: string | null
          protein?: number
          user_id: string
        }
        Update: {
          calories?: number
          carbs?: number
          confidence_score?: number | null
          created_at?: string
          date?: string
          fats?: number
          id?: string
          meal_time?: Database["public"]["Enums"]["meal_time"]
          name?: string
          notes?: string | null
          photo_url?: string | null
          protein?: number
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          created_at: string
          id: string
          is_broadcast: boolean
          media_type: string
          media_url: string | null
          room_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_broadcast?: boolean
          media_type?: string
          media_url?: string | null
          room_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_broadcast?: boolean
          media_type?: string
          media_url?: string | null
          room_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link_url: string | null
          message: string
          read: boolean
          sender_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link_url?: string | null
          message: string
          read?: boolean
          sender_id?: string | null
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link_url?: string | null
          message?: string
          read?: boolean
          sender_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      nutrition_daily_summary: {
        Row: {
          adherence_score: number | null
          athlete_id: string
          created_at: string
          date: string
          id: string
          total_calories: number
          total_carbs: number
          total_fats: number
          total_protein: number
          updated_at: string
          water_ml: number
        }
        Insert: {
          adherence_score?: number | null
          athlete_id: string
          created_at?: string
          date?: string
          id?: string
          total_calories?: number
          total_carbs?: number
          total_fats?: number
          total_protein?: number
          updated_at?: string
          water_ml?: number
        }
        Update: {
          adherence_score?: number | null
          athlete_id?: string
          created_at?: string
          date?: string
          id?: string
          total_calories?: number
          total_carbs?: number
          total_fats?: number
          total_protein?: number
          updated_at?: string
          water_ml?: number
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_daily_summary_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "nutrition_daily_summary_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_logs: {
        Row: {
          athlete_id: string
          calories: number | null
          carbs: number | null
          created_at: string
          date: string
          fats: number | null
          id: string
          logged_at: string
          meal_name: string | null
          meal_tag: string | null
          notes: string | null
          protein: number | null
          water: number | null
        }
        Insert: {
          athlete_id: string
          calories?: number | null
          carbs?: number | null
          created_at?: string
          date?: string
          fats?: number | null
          id?: string
          logged_at?: string
          meal_name?: string | null
          meal_tag?: string | null
          notes?: string | null
          protein?: number | null
          water?: number | null
        }
        Update: {
          athlete_id?: string
          calories?: number | null
          carbs?: number | null
          created_at?: string
          date?: string
          fats?: number | null
          id?: string
          logged_at?: string
          meal_name?: string | null
          meal_tag?: string | null
          notes?: string | null
          protein?: number | null
          water?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_logs_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "nutrition_logs_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_plans: {
        Row: {
          active: boolean
          athlete_id: string
          carbs_g: number
          coach_id: string
          created_at: string
          cycling_targets: Json | null
          daily_calories: number
          fats_g: number
          id: string
          notes: string | null
          protein_g: number
          strategy_mode: string
          strategy_type: string
          updated_at: string
          weekly_weight_goal: number | null
        }
        Insert: {
          active?: boolean
          athlete_id: string
          carbs_g?: number
          coach_id: string
          created_at?: string
          cycling_targets?: Json | null
          daily_calories?: number
          fats_g?: number
          id?: string
          notes?: string | null
          protein_g?: number
          strategy_mode?: string
          strategy_type?: string
          updated_at?: string
          weekly_weight_goal?: number | null
        }
        Update: {
          active?: boolean
          athlete_id?: string
          carbs_g?: number
          coach_id?: string
          created_at?: string
          cycling_targets?: Json | null
          daily_calories?: number
          fats_g?: number
          id?: string
          notes?: string | null
          protein_g?: number
          strategy_mode?: string
          strategy_type?: string
          updated_at?: string
          weekly_weight_goal?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          brand_color: string | null
          calibration_requirements: string[]
          coach_id: string | null
          created_at: string
          current_period_end: string | null
          experience_level: string | null
          fms_exclusion_zones: string[]
          full_name: string | null
          id: string
          leaderboard_anonymous: boolean
          logo_url: string | null
          medical_clearance_required: boolean
          neurotype: string | null
          onboarding_completed: boolean
          onboarding_data: Json | null
          one_rm_data: Json | null
          preferences: Json | null
          red_flags: Json
          role: Database["public"]["Enums"]["user_role"]
          settings: Json
          social_links: Json | null
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          subscription_tier: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          brand_color?: string | null
          calibration_requirements?: string[]
          coach_id?: string | null
          created_at?: string
          current_period_end?: string | null
          experience_level?: string | null
          fms_exclusion_zones?: string[]
          full_name?: string | null
          id: string
          leaderboard_anonymous?: boolean
          logo_url?: string | null
          medical_clearance_required?: boolean
          neurotype?: string | null
          onboarding_completed?: boolean
          onboarding_data?: Json | null
          one_rm_data?: Json | null
          preferences?: Json | null
          red_flags?: Json
          role?: Database["public"]["Enums"]["user_role"]
          settings?: Json
          social_links?: Json | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          subscription_tier?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          brand_color?: string | null
          calibration_requirements?: string[]
          coach_id?: string | null
          created_at?: string
          current_period_end?: string | null
          experience_level?: string | null
          fms_exclusion_zones?: string[]
          full_name?: string | null
          id?: string
          leaderboard_anonymous?: boolean
          logo_url?: string | null
          medical_clearance_required?: boolean
          neurotype?: string | null
          onboarding_completed?: boolean
          onboarding_data?: Json | null
          one_rm_data?: Json | null
          preferences?: Json | null
          red_flags?: Json
          role?: Database["public"]["Enums"]["user_role"]
          settings?: Json
          social_links?: Json | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          subscription_tier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      program_blocks: {
        Row: {
          athlete_id: string | null
          coach_id: string
          created_at: string
          data: Json
          goal: string
          id: string
          name: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          athlete_id?: string | null
          coach_id: string
          created_at?: string
          data: Json
          goal: string
          id?: string
          name: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          athlete_id?: string | null
          coach_id?: string
          created_at?: string
          data?: Json
          goal?: string
          id?: string
          name?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_blocks_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "program_blocks_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_blocks_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "program_blocks_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      program_days: {
        Row: {
          created_at: string
          day_number: number
          id: string
          name: string | null
          program_week_id: string
        }
        Insert: {
          created_at?: string
          day_number: number
          id?: string
          name?: string | null
          program_week_id: string
        }
        Update: {
          created_at?: string
          day_number?: number
          id?: string
          name?: string | null
          program_week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_days_program_week_id_fkey"
            columns: ["program_week_id"]
            isOneToOne: false
            referencedRelation: "program_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      program_exercises: {
        Row: {
          created_at: string
          exercise_id: string | null
          id: string
          load_text: string | null
          notes: string | null
          program_workout_id: string
          reps: string | null
          rest: string | null
          rpe: string | null
          sets: number | null
          snapshot_muscles: string[] | null
          snapshot_tracking_fields: string[] | null
          sort_order: number
          tempo: string | null
        }
        Insert: {
          created_at?: string
          exercise_id?: string | null
          id?: string
          load_text?: string | null
          notes?: string | null
          program_workout_id: string
          reps?: string | null
          rest?: string | null
          rpe?: string | null
          sets?: number | null
          snapshot_muscles?: string[] | null
          snapshot_tracking_fields?: string[] | null
          sort_order?: number
          tempo?: string | null
        }
        Update: {
          created_at?: string
          exercise_id?: string | null
          id?: string
          load_text?: string | null
          notes?: string | null
          program_workout_id?: string
          reps?: string | null
          rest?: string | null
          rpe?: string | null
          sets?: number | null
          snapshot_muscles?: string[] | null
          snapshot_tracking_fields?: string[] | null
          sort_order?: number
          tempo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "program_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_exercises_program_workout_id_fkey"
            columns: ["program_workout_id"]
            isOneToOne: false
            referencedRelation: "program_workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      program_plans: {
        Row: {
          coach_id: string
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_template: boolean
          name: string
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_template?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_template?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_plans_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "program_plans_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      program_weeks: {
        Row: {
          created_at: string
          id: string
          name: string | null
          program_plan_id: string
          week_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          program_plan_id: string
          week_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          program_plan_id?: string
          week_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "program_weeks_program_plan_id_fkey"
            columns: ["program_plan_id"]
            isOneToOne: false
            referencedRelation: "program_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      program_workouts: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          program_day_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          program_day_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          program_day_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "program_workouts_program_day_id_fkey"
            columns: ["program_day_id"]
            isOneToOne: false
            referencedRelation: "program_days"
            referencedColumns: ["id"]
          },
        ]
      }
      session_voice_events: {
        Row: {
          athlete_id: string
          confidence_score: number | null
          created_at: string
          id: string
          intent_detected: string | null
          transcript: string
          workout_log_id: string
        }
        Insert: {
          athlete_id: string
          confidence_score?: number | null
          created_at?: string
          id?: string
          intent_detected?: string | null
          transcript?: string
          workout_log_id: string
        }
        Update: {
          athlete_id?: string
          confidence_score?: number | null
          created_at?: string
          id?: string
          intent_detected?: string | null
          transcript?: string
          workout_log_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_voice_events_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "session_voice_events_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_voice_events_workout_log_id_fkey"
            columns: ["workout_log_id"]
            isOneToOne: false
            referencedRelation: "workout_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          category: Database["public"]["Enums"]["ticket_category"]
          created_at: string
          id: string
          message: string
          metadata: Json | null
          status: Database["public"]["Enums"]["ticket_status"]
          user_id: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["ticket_category"]
          created_at?: string
          id?: string
          message: string
          metadata?: Json | null
          status?: Database["public"]["Enums"]["ticket_status"]
          user_id?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["ticket_category"]
          created_at?: string
          id?: string
          message?: string
          metadata?: Json | null
          status?: Database["public"]["Enums"]["ticket_status"]
          user_id?: string | null
        }
        Relationships: []
      }
      training_phases: {
        Row: {
          athlete_id: string
          base_volume: number
          coach_id: string
          created_at: string
          end_date: string
          focus_type: Database["public"]["Enums"]["phase_focus_type"]
          id: string
          name: string
          notes: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          athlete_id: string
          base_volume?: number
          coach_id: string
          created_at?: string
          end_date: string
          focus_type: Database["public"]["Enums"]["phase_focus_type"]
          id?: string
          name: string
          notes?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          base_volume?: number
          coach_id?: string
          created_at?: string
          end_date?: string
          focus_type?: Database["public"]["Enums"]["phase_focus_type"]
          id?: string
          name?: string
          notes?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_phases_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "training_phases_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_phases_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "training_phases_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_ai_usage: {
        Row: {
          chat_count: number
          date: string
          last_reset: string
          user_id: string
          vision_count: number
        }
        Insert: {
          chat_count?: number
          date?: string
          last_reset?: string
          user_id: string
          vision_count?: number
        }
        Update: {
          chat_count?: number
          date?: string
          last_reset?: string
          user_id?: string
          vision_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "user_ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          awarded_at: string
          badge_id: string
          id: string
          user_id: string
        }
        Insert: {
          awarded_at?: string
          badge_id: string
          id?: string
          user_id: string
        }
        Update: {
          awarded_at?: string
          badge_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_checkins: {
        Row: {
          ai_summary: string | null
          athlete_id: string
          coach_id: string
          coach_notes: string | null
          created_at: string
          id: string
          metrics_snapshot: Json | null
          status: Database["public"]["Enums"]["checkin_status"]
          updated_at: string
          week_start: string
        }
        Insert: {
          ai_summary?: string | null
          athlete_id: string
          coach_id: string
          coach_notes?: string | null
          created_at?: string
          id?: string
          metrics_snapshot?: Json | null
          status?: Database["public"]["Enums"]["checkin_status"]
          updated_at?: string
          week_start: string
        }
        Update: {
          ai_summary?: string | null
          athlete_id?: string
          coach_id?: string
          coach_notes?: string | null
          created_at?: string
          id?: string
          metrics_snapshot?: Json | null
          status?: Database["public"]["Enums"]["checkin_status"]
          updated_at?: string
          week_start?: string
        }
        Relationships: []
      }
      workout_exercises: {
        Row: {
          calc_power_watts: number | null
          created_at: string
          exercise_name: string
          exercise_order: number
          id: string
          mean_velocity_ms: number | null
          notes: string | null
          peak_velocity_ms: number | null
          rom_cm: number | null
          sets_data: Json
          updated_at: string
          workout_log_id: string
        }
        Insert: {
          calc_power_watts?: number | null
          created_at?: string
          exercise_name: string
          exercise_order?: number
          id?: string
          mean_velocity_ms?: number | null
          notes?: string | null
          peak_velocity_ms?: number | null
          rom_cm?: number | null
          sets_data?: Json
          updated_at?: string
          workout_log_id: string
        }
        Update: {
          calc_power_watts?: number | null
          created_at?: string
          exercise_name?: string
          exercise_order?: number
          id?: string
          mean_velocity_ms?: number | null
          notes?: string | null
          peak_velocity_ms?: number | null
          rom_cm?: number | null
          sets_data?: Json
          updated_at?: string
          workout_log_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_exercises_workout_log_id_fkey"
            columns: ["workout_log_id"]
            isOneToOne: false
            referencedRelation: "workout_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_logs: {
        Row: {
          athlete_id: string
          coach_feedback: string | null
          coach_feedback_at: string | null
          completed_at: string | null
          created_at: string
          duration_minutes: number | null
          duration_seconds: number | null
          exercises_data: Json
          google_event_id: string | null
          id: string
          local_id: string | null
          notes: string | null
          program_id: string | null
          program_workout_id: string | null
          rpe_global: number | null
          scheduled_date: string | null
          scheduled_start_time: string | null
          srpe: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["workout_log_status"]
          sync_status: string
          total_load_au: number | null
          workout_id: string
        }
        Insert: {
          athlete_id: string
          coach_feedback?: string | null
          coach_feedback_at?: string | null
          completed_at?: string | null
          created_at?: string
          duration_minutes?: number | null
          duration_seconds?: number | null
          exercises_data?: Json
          google_event_id?: string | null
          id?: string
          local_id?: string | null
          notes?: string | null
          program_id?: string | null
          program_workout_id?: string | null
          rpe_global?: number | null
          scheduled_date?: string | null
          scheduled_start_time?: string | null
          srpe?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["workout_log_status"]
          sync_status?: string
          total_load_au?: number | null
          workout_id: string
        }
        Update: {
          athlete_id?: string
          coach_feedback?: string | null
          coach_feedback_at?: string | null
          completed_at?: string | null
          created_at?: string
          duration_minutes?: number | null
          duration_seconds?: number | null
          exercises_data?: Json
          google_event_id?: string | null
          id?: string
          local_id?: string | null
          notes?: string | null
          program_id?: string | null
          program_workout_id?: string | null
          rpe_global?: number | null
          scheduled_date?: string | null
          scheduled_start_time?: string | null
          srpe?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["workout_log_status"]
          sync_status?: string
          total_load_au?: number | null
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_logs_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "workout_logs_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_logs_program_workout_id_fkey"
            columns: ["program_workout_id"]
            isOneToOne: false
            referencedRelation: "program_workouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_logs_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_templates: {
        Row: {
          coach_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          structure: Json
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          structure?: Json
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          structure?: Json
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      workouts: {
        Row: {
          athlete_id: string
          coach_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          estimated_duration: number | null
          id: string
          scheduled_date: string | null
          status: Database["public"]["Enums"]["workout_status"]
          structure: Json
          sync_version: number
          title: string
          updated_at: string
        }
        Insert: {
          athlete_id: string
          coach_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          estimated_duration?: number | null
          id?: string
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["workout_status"]
          structure?: Json
          sync_version?: number
          title: string
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          coach_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          estimated_duration?: number | null
          id?: string
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["workout_status"]
          structure?: Json
          sync_version?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workouts_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "workouts_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workouts_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "workouts_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      analytics_athlete_progress: {
        Row: {
          athlete_id: string | null
          readiness_score: number | null
          rpe_average: number | null
          sessions_completed: number | null
          sets_completed: number | null
          total_volume: number | null
          workout_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_logs_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "workout_logs_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_athlete_summary: {
        Row: {
          acute_load_raw: number | null
          athlete_id: string | null
          avatar_url: string | null
          chronic_load_raw: number | null
          coach_id: string | null
          compliance_rate: number | null
          current_acwr: number | null
          full_name: string | null
          has_active_injury: boolean | null
          last_workout_date: string | null
          onboarding_completed: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "analytics_athlete_summary"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      archive_athlete: { Args: { p_athlete_id: string }; Returns: undefined }
      clone_program_week: {
        Args: {
          source_week_id: string
          target_order_index: number
          target_program_id: string
        }
        Returns: string
      }
      clone_program_workout: {
        Args: { source_workout_id: string; target_day_id: string }
        Returns: string
      }
      get_chat_partner_profiles: {
        Args: { p_user_ids: string[] }
        Returns: {
          avatar_url: string
          full_name: string
          id: string
        }[]
      }
      get_or_create_direct_room: {
        Args: { user_a: string; user_b: string }
        Returns: string
      }
      is_coach_of_athlete: { Args: { p_athlete_id: string }; Returns: boolean }
      is_my_athlete: { Args: { _athlete_id: string }; Returns: boolean }
      is_my_coach: { Args: { _coach_id: string }; Returns: boolean }
      is_room_member: {
        Args: { _room_id: string; _user_id: string }
        Returns: boolean
      }
      match_documents: {
        Args: {
          match_count?: number
          match_threshold?: number
          p_coach_id: string
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
      match_knowledge_chunks: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content: string
          document_id: string
          document_title: string
          id: string
          similarity: number
        }[]
      }
      schedule_program_week: {
        Args: { p_athlete_id: string; p_start_date: string; p_week_id: string }
        Returns: number
      }
      shares_room_with: {
        Args: { _other_user_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      billing_sub_status:
        | "active"
        | "past_due"
        | "canceled"
        | "incomplete"
        | "canceling"
      checkin_status: "pending" | "approved" | "sent" | "skipped"
      content_type: "video" | "pdf" | "link" | "text" | "ai_knowledge"
      cycle_phase: "menstrual" | "follicular" | "ovulatory" | "luteal"
      knowledge_doc_status: "pending" | "processing" | "processed" | "failed"
      meal_time: "breakfast" | "lunch" | "dinner" | "snack"
      phase_focus_type:
        | "strength"
        | "hypertrophy"
        | "endurance"
        | "power"
        | "recovery"
        | "peaking"
        | "transition"
      subscription_status: "active" | "past_due" | "canceled" | "trial" | "none"
      ticket_category: "bug" | "feature_request" | "billing" | "other"
      ticket_status: "new" | "in_progress" | "resolved" | "closed"
      user_role: "coach" | "athlete"
      workout_log_status: "scheduled" | "completed" | "missed" | "in_progress"
      workout_status: "pending" | "in_progress" | "completed" | "skipped"
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
      billing_sub_status: [
        "active",
        "past_due",
        "canceled",
        "incomplete",
        "canceling",
      ],
      checkin_status: ["pending", "approved", "sent", "skipped"],
      content_type: ["video", "pdf", "link", "text", "ai_knowledge"],
      cycle_phase: ["menstrual", "follicular", "ovulatory", "luteal"],
      knowledge_doc_status: ["pending", "processing", "processed", "failed"],
      meal_time: ["breakfast", "lunch", "dinner", "snack"],
      phase_focus_type: [
        "strength",
        "hypertrophy",
        "endurance",
        "power",
        "recovery",
        "peaking",
        "transition",
      ],
      subscription_status: ["active", "past_due", "canceled", "trial", "none"],
      ticket_category: ["bug", "feature_request", "billing", "other"],
      ticket_status: ["new", "in_progress", "resolved", "closed"],
      user_role: ["coach", "athlete"],
      workout_log_status: ["scheduled", "completed", "missed", "in_progress"],
      workout_status: ["pending", "in_progress", "completed", "skipped"],
    },
  },
} as const
