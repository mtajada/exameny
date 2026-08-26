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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      academies: {
        Row: {
          created_at: string
          id: number
          name: string
        }
        Insert: {
          created_at?: string
          id?: number
          name: string
        }
        Update: {
          created_at?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      academy_memberships: {
        Row: {
          academy_id: number
          created_at: string
          email: string
          id: number
          role: string
          status: string
          subscription_end_date: string | null
          subscription_start_date: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          academy_id: number
          created_at?: string
          email: string
          id?: number
          role: string
          status?: string
          subscription_end_date?: string | null
          subscription_start_date?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          academy_id?: number
          created_at?: string
          email?: string
          id?: number
          role?: string
          status?: string
          subscription_end_date?: string | null
          subscription_start_date?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academy_memberships_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assigned_prompts: {
        Row: {
          assigned_at: string
          created_at: string
          id: string
          prompt_text: string | null
          ruoe_exercise_id: number | null
          status: string
          student_id: string
          student_membership_id: number
          task_type_id: number
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          created_at?: string
          id?: string
          prompt_text?: string | null
          ruoe_exercise_id?: number | null
          status?: string
          student_id: string
          student_membership_id: number
          task_type_id: number
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          created_at?: string
          id?: string
          prompt_text?: string | null
          ruoe_exercise_id?: number | null
          status?: string
          student_id?: string
          student_membership_id?: number
          task_type_id?: number
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assigned_prompts_ruoe_exercise_id_fkey"
            columns: ["ruoe_exercise_id"]
            isOneToOne: false
            referencedRelation: "ruoe_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assigned_prompts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assigned_prompts_student_membership_id_fkey"
            columns: ["student_membership_id"]
            isOneToOne: false
            referencedRelation: "academy_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assigned_prompts_task_type_id_fkey"
            columns: ["task_type_id"]
            isOneToOne: false
            referencedRelation: "exam_task_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assigned_prompts_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      band_descriptors: {
        Row: {
          created_at: string
          criterion_id: number
          descriptor_text: string
          exam_type_id: number
          id: number
          level_id: number
          score: number
        }
        Insert: {
          created_at?: string
          criterion_id: number
          descriptor_text: string
          exam_type_id: number
          id?: number
          level_id: number
          score: number
        }
        Update: {
          created_at?: string
          criterion_id?: number
          descriptor_text?: string
          exam_type_id?: number
          id?: number
          level_id?: number
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "band_descriptors_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "evaluation_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "band_descriptors_exam_type_id_fkey"
            columns: ["exam_type_id"]
            isOneToOne: false
            referencedRelation: "exam_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "band_descriptors_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
        ]
      }
      class_members: {
        Row: {
          class_id: number
          membership_id: number
        }
        Insert: {
          class_id: number
          membership_id: number
        }
        Update: {
          class_id?: number
          membership_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "class_members_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_members_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "academy_memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          academy_id: number
          created_at: string
          description: string | null
          id: number
          name: string
        }
        Insert: {
          academy_id: number
          created_at?: string
          description?: string | null
          id?: number
          name: string
        }
        Update: {
          academy_id?: number
          created_at?: string
          description?: string | null
          id?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
        ]
      }
      edge_function_idempotency: {
        Row: {
          created_at: string
          function_name: string
          id: number
          request_id: string
          response_payload: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          function_name: string
          id?: number
          request_id: string
          response_payload: Json
          user_id: string
        }
        Update: {
          created_at?: string
          function_name?: string
          id?: number
          request_id?: string
          response_payload?: Json
          user_id?: string
        }
        Relationships: []
      }
      error_categories: {
        Row: {
          code: string
          description: string
          id: number
          name: string
        }
        Insert: {
          code: string
          description: string
          id?: number
          name: string
        }
        Update: {
          code?: string
          description?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      error_tags: {
        Row: {
          category_id: number
          code: string
          description: string
          id: number
          name: string
          skills: string[]
        }
        Insert: {
          category_id: number
          code: string
          description: string
          id?: number
          name: string
          skills?: string[]
        }
        Update: {
          category_id?: number
          code?: string
          description?: string
          id?: number
          name?: string
          skills?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "error_tags_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "error_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_criteria: {
        Row: {
          created_at: string
          criterion_code: string
          description: string | null
          id: number
          name: string
        }
        Insert: {
          created_at?: string
          criterion_code: string
          description?: string | null
          id?: number
          name: string
        }
        Update: {
          created_at?: string
          criterion_code?: string
          description?: string | null
          id?: number
          name?: string
        }
        Relationships: []
      }
      evaluations: {
        Row: {
          ai_criteria_evaluation: Json | null
          ai_mistakes_error: string | null
          ai_mistakes_items_v2: Json | null
          ai_mistakes_metrics_v2: Json | null
          ai_mistakes_status: string
          ai_mistakes_summary: Json | null
          ai_overall_commentary: string | null
          ai_overall_score: string | null
          created_at: string
          evaluation_completed_at: string | null
          id: string
          status: string | null
          submission_id: string
          teacher_comments: string | null
          teacher_criteria_evaluation: Json | null
          teacher_overall_score: string | null
          teacher_reviewed_at: string | null
          updated_at: string
        }
        Insert: {
          ai_criteria_evaluation?: Json | null
          ai_mistakes_error?: string | null
          ai_mistakes_items_v2?: Json | null
          ai_mistakes_metrics_v2?: Json | null
          ai_mistakes_status?: string
          ai_mistakes_summary?: Json | null
          ai_overall_commentary?: string | null
          ai_overall_score?: string | null
          created_at?: string
          evaluation_completed_at?: string | null
          id?: string
          status?: string | null
          submission_id: string
          teacher_comments?: string | null
          teacher_criteria_evaluation?: Json | null
          teacher_overall_score?: string | null
          teacher_reviewed_at?: string | null
          updated_at?: string
        }
        Update: {
          ai_criteria_evaluation?: Json | null
          ai_mistakes_error?: string | null
          ai_mistakes_items_v2?: Json | null
          ai_mistakes_metrics_v2?: Json | null
          ai_mistakes_status?: string
          ai_mistakes_summary?: Json | null
          ai_overall_commentary?: string | null
          ai_overall_score?: string | null
          created_at?: string
          evaluation_completed_at?: string | null
          id?: string
          status?: string | null
          submission_id?: string
          teacher_comments?: string | null
          teacher_criteria_evaluation?: Json | null
          teacher_overall_score?: string | null
          teacher_reviewed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_task_types: {
        Row: {
          created_at: string
          default_time_minutes: number | null
          description: string | null
          exam_type_id: number
          id: number
          level_id: number
          name: string
          task_code: string
        }
        Insert: {
          created_at?: string
          default_time_minutes?: number | null
          description?: string | null
          exam_type_id: number
          id?: number
          level_id: number
          name: string
          task_code: string
        }
        Update: {
          created_at?: string
          default_time_minutes?: number | null
          description?: string | null
          exam_type_id?: number
          id?: number
          level_id?: number
          name?: string
          task_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_task_types_exam_type_id_fkey"
            columns: ["exam_type_id"]
            isOneToOne: false
            referencedRelation: "exam_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_task_types_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_types: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: number
          max_score: number
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: number
          max_score: number
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: number
          max_score?: number
          name?: string
        }
        Relationships: []
      }
      levels: {
        Row: {
          code: string
          created_at: string
          id: number
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: number
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      mistakes: {
        Row: {
          anchor_end: number
          anchor_start: number
          anchor_text: string
          category_id: number
          created_at: string
          explanation: string
          id: string
          meta: Json
          source: string
          student_id: string
          suggested_correction: string | null
          tag_id: number | null
          task_type_id: number
          updated_at: string
          writing_submission_id: string
        }
        Insert: {
          anchor_end: number
          anchor_start: number
          anchor_text: string
          category_id: number
          created_at?: string
          explanation: string
          id?: string
          meta?: Json
          source?: string
          student_id: string
          suggested_correction?: string | null
          tag_id?: number | null
          task_type_id: number
          updated_at?: string
          writing_submission_id: string
        }
        Update: {
          anchor_end?: number
          anchor_start?: number
          anchor_text?: string
          category_id?: number
          created_at?: string
          explanation?: string
          id?: string
          meta?: Json
          source?: string
          student_id?: string
          suggested_correction?: string | null
          tag_id?: number | null
          task_type_id?: number
          updated_at?: string
          writing_submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mistakes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "error_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mistakes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mistakes_submission_task_type_fk"
            columns: ["writing_submission_id", "task_type_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id", "task_type_id"]
          },
          {
            foreignKeyName: "mistakes_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "error_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mistakes_task_type_id_fkey"
            columns: ["task_type_id"]
            isOneToOne: false
            referencedRelation: "exam_task_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mistakes_writing_submission_id_fkey"
            columns: ["writing_submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_profiles: {
        Row: {
          created_at: string
          industry: string
          main_goal: string | null
          responsibilities: string[]
          role_title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          industry: string
          main_goal?: string | null
          responsibilities?: string[]
          role_title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          industry?: string
          main_goal?: string | null
          responsibilities?: string[]
          role_title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          academy_id: number | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: string | null
          updated_at: string
        }
        Insert: {
          academy_id?: number | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          role?: string | null
          updated_at?: string
        }
        Update: {
          academy_id?: number | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
        ]
      }
      ruoe_exercises: {
        Row: {
          academy_id: number
          author_id: string | null
          content_text: string
          created_at: string
          id: number
          is_public: boolean
          task_type_id: number
          teacher_skill_focus: string | null
          teacher_theme: string | null
          title: string
          updated_at: string
        }
        Insert: {
          academy_id: number
          author_id?: string | null
          content_text: string
          created_at?: string
          id?: number
          is_public?: boolean
          task_type_id: number
          teacher_skill_focus?: string | null
          teacher_theme?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          academy_id?: number
          author_id?: string | null
          content_text?: string
          created_at?: string
          id?: number
          is_public?: boolean
          task_type_id?: number
          teacher_skill_focus?: string | null
          teacher_theme?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ruoe_exercises_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruoe_exercises_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruoe_exercises_task_type_id_fkey"
            columns: ["task_type_id"]
            isOneToOne: false
            referencedRelation: "exam_task_types"
            referencedColumns: ["id"]
          },
        ]
      }
      ruoe_options: {
        Row: {
          feedback: string | null
          id: number
          is_correct: boolean
          option_letter: string
          option_text: string
          question_id: number
        }
        Insert: {
          feedback?: string | null
          id?: number
          is_correct?: boolean
          option_letter: string
          option_text: string
          question_id: number
        }
        Update: {
          feedback?: string | null
          id?: number
          is_correct?: boolean
          option_letter?: string
          option_text?: string
          question_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "ruoe_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "ruoe_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      ruoe_questions: {
        Row: {
          correct_answers: string[]
          exercise_id: number
          explanation: string | null
          id: number
          order: number
          original_sentence: string | null
          question_text: string | null
          transformation_sentence: string | null
        }
        Insert: {
          correct_answers: string[]
          exercise_id: number
          explanation?: string | null
          id?: number
          order: number
          original_sentence?: string | null
          question_text?: string | null
          transformation_sentence?: string | null
        }
        Update: {
          correct_answers?: string[]
          exercise_id?: number
          explanation?: string | null
          id?: number
          order?: number
          original_sentence?: string | null
          question_text?: string | null
          transformation_sentence?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ruoe_questions_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "ruoe_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      ruoe_user_answers: {
        Row: {
          attempt_id: number
          is_correct: boolean | null
          question_id: number
          user_answer: string | null
        }
        Insert: {
          attempt_id: number
          is_correct?: boolean | null
          question_id: number
          user_answer?: string | null
        }
        Update: {
          attempt_id?: number
          is_correct?: boolean | null
          question_id?: number
          user_answer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ruoe_user_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "ruoe_user_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruoe_user_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "ruoe_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      ruoe_user_attempts: {
        Row: {
          attempt_number: number
          completed_at: string | null
          exercise_id: number
          id: number
          max_score: number | null
          membership_id: number
          restarted_from_attempt_id: number | null
          score: number | null
          started_at: string
          status: string
          student_id: string
        }
        Insert: {
          attempt_number: number
          completed_at?: string | null
          exercise_id: number
          id?: number
          max_score?: number | null
          membership_id: number
          restarted_from_attempt_id?: number | null
          score?: number | null
          started_at?: string
          status?: string
          student_id: string
        }
        Update: {
          attempt_number?: number
          completed_at?: string | null
          exercise_id?: number
          id?: number
          max_score?: number | null
          membership_id?: number
          restarted_from_attempt_id?: number | null
          score?: number | null
          started_at?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ruoe_user_attempts_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "ruoe_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruoe_user_attempts_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "academy_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruoe_user_attempts_restarted_from_attempt_id_fkey"
            columns: ["restarted_from_attempt_id"]
            isOneToOne: false
            referencedRelation: "ruoe_user_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruoe_user_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      speaking_personas: {
        Row: {
          accent: string
          avatar_url: string | null
          created_at: string
          default_prompt: string | null
          gender: string
          id: number
          is_active: boolean
          name: string
          updated_at: string
          voice_id: string
        }
        Insert: {
          accent: string
          avatar_url?: string | null
          created_at?: string
          default_prompt?: string | null
          gender: string
          id?: number
          is_active?: boolean
          name: string
          updated_at?: string
          voice_id: string
        }
        Update: {
          accent?: string
          avatar_url?: string | null
          created_at?: string
          default_prompt?: string | null
          gender?: string
          id?: number
          is_active?: boolean
          name?: string
          updated_at?: string
          voice_id?: string
        }
        Relationships: []
      }
      speaking_scenarios: {
        Row: {
          category: string
          created_at: string
          created_by_membership_id: number | null
          default_persona_id: number | null
          description_md: string | null
          id: number
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by_membership_id?: number | null
          default_persona_id?: number | null
          description_md?: string | null
          id?: number
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by_membership_id?: number | null
          default_persona_id?: number | null
          description_md?: string | null
          id?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "speaking_scenarios_created_by_membership_id_fkey"
            columns: ["created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "academy_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "speaking_scenarios_default_persona_id_fkey"
            columns: ["default_persona_id"]
            isOneToOne: false
            referencedRelation: "speaking_personas"
            referencedColumns: ["id"]
          },
        ]
      }
      speaking_sessions: {
        Row: {
          conversation_id_ext: string | null
          created_at: string
          id: string
          membership_id: number
          nuances: string | null
          persona_id: number
          scenario_id: number | null
          status: string
          updated_at: string
          use_profile: boolean
        }
        Insert: {
          conversation_id_ext?: string | null
          created_at?: string
          id?: string
          membership_id: number
          nuances?: string | null
          persona_id: number
          scenario_id?: number | null
          status?: string
          updated_at?: string
          use_profile?: boolean
        }
        Update: {
          conversation_id_ext?: string | null
          created_at?: string
          id?: string
          membership_id?: number
          nuances?: string | null
          persona_id?: number
          scenario_id?: number | null
          status?: string
          updated_at?: string
          use_profile?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "speaking_sessions_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "academy_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "speaking_sessions_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "speaking_personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "speaking_sessions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "speaking_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      speaking_transcripts: {
        Row: {
          created_at: string
          full_text: string
          raw_json: Json | null
          session_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_text?: string
          raw_json?: Json | null
          session_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_text?: string
          raw_json?: Json | null
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "speaking_transcripts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "speaking_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      speaking_turns: {
        Row: {
          created_at: string
          end_ms: number | null
          filler_count: number | null
          id: number
          raw_json: Json | null
          session_id: string
          speaker: string
          start_ms: number | null
          text: string
          wpm: number | null
        }
        Insert: {
          created_at?: string
          end_ms?: number | null
          filler_count?: number | null
          id?: number
          raw_json?: Json | null
          session_id: string
          speaker: string
          start_ms?: number | null
          text?: string
          wpm?: number | null
        }
        Update: {
          created_at?: string
          end_ms?: number | null
          filler_count?: number | null
          id?: number
          raw_json?: Json | null
          session_id?: string
          speaker?: string
          start_ms?: number | null
          text?: string
          wpm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "speaking_turns_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "speaking_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      student_profiles: {
        Row: {
          assigned_teacher_id: string | null
          created_at: string
          membership_id: number
          target_exam_id: number | null
          target_level_id: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_teacher_id?: string | null
          created_at?: string
          membership_id: number
          target_exam_id?: number | null
          target_level_id?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_teacher_id?: string | null
          created_at?: string
          membership_id?: number
          target_exam_id?: number | null
          target_level_id?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_profiles_assigned_teacher_id_fkey"
            columns: ["assigned_teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_profiles_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: true
            referencedRelation: "academy_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_profiles_target_exam_id_fkey"
            columns: ["target_exam_id"]
            isOneToOne: false
            referencedRelation: "exam_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_profiles_target_level_id_fkey"
            columns: ["target_level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_profiles_history: {
        Row: {
          archived_at: string
          assigned_teacher_id: string | null
          created_at: string
          membership_id: number
          target_exam_id: number | null
          target_level_id: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string
          assigned_teacher_id?: string | null
          created_at: string
          membership_id: number
          target_exam_id?: number | null
          target_level_id?: number | null
          updated_at: string
          user_id: string
        }
        Update: {
          archived_at?: string
          assigned_teacher_id?: string | null
          created_at?: string
          membership_id?: number
          target_exam_id?: number | null
          target_level_id?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_profiles_history_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "academy_memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          ai_generated_prompt_text: string | null
          assigned_prompt_id: string | null
          created_at: string
          evaluation_requested_at: string | null
          id: string
          last_timer_synced_at: string | null
          status: string
          student_id: string
          student_membership_id: number
          submission_text: string | null
          submitted_at: string | null
          task_type_id: number
          time_spent_seconds: number
          updated_at: string
          word_count: number | null
          writing_mode: string | null
        }
        Insert: {
          ai_generated_prompt_text?: string | null
          assigned_prompt_id?: string | null
          created_at?: string
          evaluation_requested_at?: string | null
          id?: string
          last_timer_synced_at?: string | null
          status?: string
          student_id: string
          student_membership_id: number
          submission_text?: string | null
          submitted_at?: string | null
          task_type_id: number
          time_spent_seconds?: number
          updated_at?: string
          word_count?: number | null
          writing_mode?: string | null
        }
        Update: {
          ai_generated_prompt_text?: string | null
          assigned_prompt_id?: string | null
          created_at?: string
          evaluation_requested_at?: string | null
          id?: string
          last_timer_synced_at?: string | null
          status?: string
          student_id?: string
          student_membership_id?: number
          submission_text?: string | null
          submitted_at?: string | null
          task_type_id?: number
          time_spent_seconds?: number
          updated_at?: string
          word_count?: number | null
          writing_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_assigned_prompt_id_fkey"
            columns: ["assigned_prompt_id"]
            isOneToOne: false
            referencedRelation: "assigned_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_student_membership_id_fkey"
            columns: ["student_membership_id"]
            isOneToOne: false
            referencedRelation: "academy_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_task_type_id_fkey"
            columns: ["task_type_id"]
            isOneToOne: false
            referencedRelation: "exam_task_types"
            referencedColumns: ["id"]
          },
        ]
      }
      task_criteria_link: {
        Row: {
          created_at: string
          criterion_id: number
          id: number
          task_type_id: number
        }
        Insert: {
          created_at?: string
          criterion_id: number
          id?: number
          task_type_id: number
        }
        Update: {
          created_at?: string
          criterion_id?: number
          id?: number
          task_type_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_criteria_link_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "evaluation_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_criteria_link_task_type_id_fkey"
            columns: ["task_type_id"]
            isOneToOne: false
            referencedRelation: "exam_task_types"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          active_academy_id: number | null
          created_at: string
          full_name: string | null
          is_initial_setup_completed: boolean
          target_exam_id: number | null
          target_level_id: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_academy_id?: number | null
          created_at?: string
          full_name?: string | null
          is_initial_setup_completed?: boolean
          target_exam_id?: number | null
          target_level_id?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_academy_id?: number | null
          created_at?: string
          full_name?: string | null
          is_initial_setup_completed?: boolean
          target_exam_id?: number | null
          target_level_id?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_active_academy_id_fkey"
            columns: ["active_academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_preferences_target_exam_id_fkey"
            columns: ["target_exam_id"]
            isOneToOne: false
            referencedRelation: "exam_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_preferences_target_level_id_fkey"
            columns: ["target_level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_membership: {
        Args: { p_membership_id: number; p_request_id?: string }
        Returns: {
          academy_id: number
          membership_id: number
          metadata_payload: Json
          request_id: string
          role: string
          should_refresh_session: boolean
          status: string
          user_id: string
        }[]
      }
      admin_manage_membership: {
        Args: {
          p_allow_active_clear?: boolean
          p_clear_user?: boolean
          p_delete_auth_user?: boolean
          p_email?: string
          p_force_status_active?: boolean
          p_membership_id: number
          p_request_id?: string
          p_role?: string
          p_status?: string
          p_subscription_end_date?: string
          p_subscription_start_date?: string
          p_target_user_id?: string
        }
        Returns: {
          academy_id: number
          created_at: string
          email: string
          id: number
          metadata_payload: Json
          metadata_targets: Json
          request_id: string
          role: string
          should_refresh_session: boolean
          status: string
          subscription_end_date: string
          subscription_start_date: string
          updated_at: string
          user_id: string
        }[]
      }
      admin_prepare_membership_invite: {
        Args: { p_academy_id: number; p_email: string; p_role?: string }
        Returns: {
          academy_id: number
          created_at: string
          email: string
          id: number
          role: string
          status: string
          subscription_end_date: string | null
          subscription_start_date: string | null
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "academy_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can_access_academy: {
        Args: { p_academy_id: number; p_user_id?: string }
        Returns: boolean
      }
      can_access_exercise: {
        Args: { p_exercise_id: number; p_user_id?: string }
        Returns: boolean
      }
      can_access_membership: {
        Args: { p_membership_id: number; p_user_id?: string }
        Returns: boolean
      }
      can_access_speaking_session: {
        Args: { p_session_id: string; p_user_id?: string }
        Returns: boolean
      }
      can_access_submission: {
        Args: { p_submission_id: string; p_user_id?: string }
        Returns: boolean
      }
      can_manage_academy: {
        Args: { p_academy_id: number; p_user_id?: string }
        Returns: boolean
      }
      create_ruoe_exercise_from_json: {
        Args: {
          p_academy_id: number
          p_author_id: string
          p_exercise_data: Json
          p_task_type_id: number
          p_teacher_skill_focus?: string
          p_teacher_theme?: string
        }
        Returns: number
      }
      create_speaking_session: {
        Args: {
          p_nuances?: string
          p_persona_id: number
          p_scenario_id?: number
          p_use_profile?: boolean
        }
        Returns: string
      }
      deactivate_membership: {
        Args: { p_membership_id: number; p_request_id?: string }
        Returns: {
          academy_id: number
          membership_id: number
          metadata_payload: Json
          request_id: string
          role: string
          should_refresh_session: boolean
          status: string
          user_id: string
        }[]
      }
      enqueue_event_outbox: {
        Args: { p_event_type: string; p_payload: Json }
        Returns: {
          created_at: string
          event_type: string
          id: number
          payload: Json
        }[]
      }
      ensure_profile_membership_alignment: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      evaluate_ruoe_attempt: { Args: { p_attempt_id: number }; Returns: Json }
      finalize_invited_signup: {
        Args: { p_request_id?: string }
        Returns: {
          auto_selected_academy_id: number
          is_platform_admin: boolean
          memberships: Json
          memberships_claimed: Json
          memberships_inactive: Json
          metadata_payload: Json
          request_id: string
          should_refresh_session: boolean
        }[]
      }
      get_my_academy_id_from_jwt: { Args: never; Returns: number }
      get_my_email_from_jwt: { Args: never; Returns: string }
      get_my_role_from_jwt: { Args: never; Returns: string }
      is_active_staff_in_academy: {
        Args: { p_academy_id: number }
        Returns: boolean
      }
      is_platform_admin: { Args: { p_user_id?: string }; Returns: boolean }
      list_open_membership_alias_conflicts: {
        Args: { p_membership_ids: number[] }
        Returns: {
          detected_at: string
          email_login: string
          email_membership: string
          membership_id: number
          resolved_at: string
        }[]
      }
      list_user_academies: {
        Args: never
        Returns: {
          active_academies: Json
          inactive_academies: Json
        }[]
      }
      log_submission_time_spent: {
        Args: {
          p_new_seconds: number
          p_submission_id: string
          p_synced_at?: string
        }
        Returns: {
          out_last_timer_synced_at: string
          out_time_spent_seconds: number
        }[]
      }
      migrate_membership_role: {
        Args: {
          p_actor_academy_id: number
          p_actor_is_platform_admin: boolean
          p_actor_user_id: string
          p_membership_id: number
          p_new_role: string
          p_reason?: string
          p_request_id?: string
        }
        Returns: {
          academy_id: number
          cleaned_records: Json
          membership_id: number
          metadata_payload: Json
          new_role: string
          old_role: string
          request_id: string
          should_refresh_session: boolean
        }[]
      }
      process_membership_claim: {
        Args: {
          p_force_status_active?: boolean
          p_membership_id: number
          p_user_id: string
        }
        Returns: {
          academy_id: number
          created_at: string
          email: string
          id: number
          role: string
          status: string
          subscription_end_date: string | null
          subscription_start_date: string | null
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "academy_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reconcile_active_academy_preference: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      resolve_current_membership: {
        Args: { p_user_id: string }
        Returns: {
          academy_id: number
          created_at: string
          email: string
          id: number
          role: string
          status: string
          subscription_end_date: string | null
          subscription_start_date: string | null
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "academy_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_invitation_membership: {
        Args: {
          p_academy_id?: number
          p_email?: string
          p_membership_id?: number
        }
        Returns: {
          academy_id: number
          created_at: string
          email: string
          id: number
          role: string
          status: string
          subscription_end_date: string | null
          subscription_start_date: string | null
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "academy_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_membership_alias: {
        Args: {
          p_actor_academy_id: number
          p_actor_is_platform_admin: boolean
          p_actor_user_id: string
          p_membership_id: number
          p_normalized_email: string
          p_reason?: string
          p_request_id?: string
        }
        Returns: {
          email_normalized: string
          membership_id: number
          metadata_payload: Json
          request_id: string
          should_refresh_session: boolean
        }[]
      }
      save_eval_and_mistakes: {
        Args: {
          p_actor_academy_id: number
          p_actor_user_id: string
          p_eval: Json
          p_mistakes: Json
          p_submission_id: string
        }
        Returns: undefined
      }
      save_evaluation_and_update_submission: {
        Args: {
          p_ai_criteria_evaluation: Json
          p_ai_overall_commentary: string
          p_ai_overall_score: string
          p_submission_id: string
        }
        Returns: undefined
      }
      save_speaking_transcript: {
        Args: { p_session_id: string; p_transcript: Json }
        Returns: undefined
      }
      save_user_preferences: {
        Args: {
          p_clear_target_goal?: boolean
          p_full_name?: string
          p_full_name_provided?: boolean
          p_request_id?: string
          p_target_exam_id?: number
          p_target_level_id?: number
        }
        Returns: {
          active_academy_id: number
          duration_ms: number
          full_name: string
          is_initial_setup_completed: boolean
          metadata_payload: Json
          request_id: string
          should_refresh_session: boolean
          source: string
          target_exam_id: number
          target_level_id: number
          user_id: string
        }[]
      }
      set_active_academy: {
        Args: { p_academy_id: number; p_request_id?: string }
        Returns: {
          membership: Database["public"]["Tables"]["academy_memberships"]["Row"]
          metadata_payload: Json
          request_id: string
          should_refresh_session: boolean
        }[]
      }
      setup_student_profile: {
        Args: {
          p_full_name?: string
          p_target_exam_id: number
          p_target_level_id: number
        }
        Returns: {
          metadata_payload: Json
          request_id: string
          should_refresh_session: boolean
        }[]
      }
      start_ruoe_attempt: {
        Args: { p_exercise_id: number; p_retry_from_attempt_id?: number }
        Returns: {
          attempt_number: number
          completed_at: string | null
          exercise_id: number
          id: number
          max_score: number | null
          membership_id: number
          restarted_from_attempt_id: number | null
          score: number | null
          started_at: string
          status: string
          student_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ruoe_user_attempts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sync_user_metadata: {
        Args: {
          p_memberships_claimed?: Json
          p_request_id?: string
          p_user_id: string
        }
        Returns: {
          metadata_payload: Json
          request_id: string
          should_refresh_session: boolean
        }[]
      }
      update_membership_subscription_dates: {
        Args: {
          p_clear_subscription_end?: boolean
          p_clear_subscription_start?: boolean
          p_membership_id: number
          p_request_id?: string
          p_subscription_end_date?: string
          p_subscription_start_date?: string
        }
        Returns: {
          academy_id: number
          created_at: string
          email: string
          id: number
          metadata_payload: Json
          metadata_targets: Json
          request_id: string
          role: string
          should_refresh_session: boolean
          status: string
          subscription_end_date: string
          subscription_start_date: string
          updated_at: string
          user_id: string
        }[]
      }
      update_profile_membership_data: {
        Args: {
          p_academy_id?: number
          p_membership_id: number
          p_membership_status?: string
          p_request_id?: string
          p_role?: string
        }
        Returns: {
          academy_id: number
          created_at: string
          email: string
          id: number
          metadata_payload: Json
          metadata_targets: Json
          request_id: string
          role: string
          should_refresh_session: boolean
          status: string
          subscription_end_date: string
          subscription_start_date: string
          updated_at: string
          user_id: string
        }[]
      }
      update_profile_public_fields: {
        Args: { p_avatar_url?: string; p_full_name?: string }
        Returns: {
          academy_id: number | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_membership_alias_conflict: {
        Args: {
          p_email_login: string
          p_email_membership: string
          p_membership_id: number
          p_payload?: Json
          p_request_id: string
          p_user_id: string
        }
        Returns: {
          detected_at: string
          email_login: string
          email_membership: string
          id: number
          membership_id: number
          payload: Json
          request_id: string
          resolved_at: string
          resolver_id: string
          user_id: string
        }[]
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
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
    Enums: {},
  },
} as const
