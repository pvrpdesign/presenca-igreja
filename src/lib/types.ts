export type UserRole = "recepcao" | "lideranca";
export type ApprovalStatus = "pendente" | "aprovado" | "rejeitado";
export type MemberStatus = "ativo" | "afastado" | "transferido";
export type SpeakerRole = "pastor" | "pregador";
export type ServiceType = "quarta" | "sabado" | "especial";
export type PersonType = "membro" | "visitante" | "pastor" | "musica";
export type FollowUpStatus = "pendente" | "acompanhado" | "removido";
export type FollowUpActionType = "mensagem" | "ligacao" | "visita" | "oracao" | "agradecimento" | "outro";
export type FollowUpOutcome = "realizado" | "sem_retorno";
export type AccessLogoutReason = "manual" | "inatividade";

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  requested_role: UserRole;
  approval_status: ApprovalStatus;
  is_admin: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
};

export type Member = {
  id: string;
  full_name: string;
  phone: string | null;
  neighborhood: string | null;
  ministry: string | null;
  status: MemberStatus;
  notes: string | null;
  created_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Visitor = {
  id: string;
  full_name: string;
  phone: string | null;
  location: string | null;
  denomination: string | null;
  how_heard: string | null;
  created_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
  updated_at: string;
};

export type VisitorSensitiveData = {
  visitor_id: string;
  prayer_request: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ExportAuditLog = {
  id: string;
  user_id: string | null;
  user_role: UserRole;
  export_type: string;
  file_name: string;
  purpose: string;
  record_count: number;
  filters: Record<string, string | number | boolean | null>;
  created_at: string;
};

export type RegistryHistory = {
  id: string;
  person_id: string;
  person_type: PersonType;
  action: "cadastrado" | "arquivado" | "restaurado";
  performed_by: string | null;
  performed_by_name: string;
  performed_at: string;
};

export type PersonMergeLog = {
  id: string;
  person_type: PersonType;
  primary_person_id: string;
  duplicate_person_id: string;
  primary_name: string;
  duplicate_name: string;
  primary_snapshot: Record<string, unknown>;
  duplicate_snapshot: Record<string, unknown>;
  merged_by: string | null;
  merged_by_name: string;
  merged_at: string;
};

export type AccessAuditLog = {
  id: string;
  user_id: string | null;
  user_name: string;
  user_email: string | null;
  user_role: UserRole;
  session_id: string;
  login_at: string;
  logout_at: string | null;
  logout_reason: AccessLogoutReason | null;
};

export type TermsAcceptance = {
  id: string;
  user_id: string | null;
  user_name: string;
  user_email: string | null;
  terms_version: string;
  accepted_at: string;
};

export type SystemSettings = {
  id: boolean;
  church_name: string;
  privacy_contact_email: string;
  member_absence_threshold: number;
  visitor_absence_threshold: number;
  session_timeout_minutes: number;
  thank_you_message: string;
  member_absence_message: string;
  visitor_absence_message: string;
  visitor_thank_you_message: string;
  pastor_thank_you_message: string;
  music_thank_you_message: string;
  invitation_message: string;
  updated_by: string | null;
  updated_at: string;
};

export type Pastor = {
  id: string;
  full_name: string;
  phone: string | null;
  district: string | null;
  speaker_role: SpeakerRole;
  created_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SpecialMusic = {
  id: string;
  performer_name: string;
  contact: string | null;
  church: string | null;
  visit_date: string;
  created_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Service = {
  id: string;
  service_date: string;
  service_type: ServiceType;
  title: string | null;
  checkin_token: string;
  checkin_enabled: boolean;
  created_by: string | null;
  created_at: string;
};

export type Attendance = {
  id: string;
  person_id: string;
  person_type: PersonType;
  service_id: string;
  service_date: string;
  service_type: ServiceType;
  registered_by: string | null;
  followed_up_by: string | null;
  followed_up_at: string | null;
  created_at: string;
};

export type MemberFollowUp = {
  id: string;
  member_id: string;
  last_service_id: string;
  last_service_date: string;
  absence_streak: number;
  status: FollowUpStatus;
  notes: string | null;
  contacted_by: string | null;
  contacted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type VisitorFollowUp = {
  id: string;
  visitor_id: string;
  last_service_id: string;
  last_service_date: string;
  absence_streak: number;
  status: FollowUpStatus;
  notes: string | null;
  contacted_by: string | null;
  contacted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FollowUpHistory = {
  id: string;
  person_id: string;
  person_type: PersonType;
  attendance_id: string | null;
  service_id: string | null;
  action_type: FollowUpActionType;
  outcome: FollowUpOutcome;
  notes: string | null;
  performed_by: string | null;
  performed_by_name: string;
  performed_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          full_name?: string | null;
          email?: string | null;
          role?: UserRole;
          requested_role?: UserRole;
          approval_status?: ApprovalStatus;
          is_admin?: boolean;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Omit<Profile, "id" | "created_at">>;
        Relationships: [];
      };
      members: {
        Row: Member;
        Insert: {
          id?: string;
          full_name: string;
          phone?: string | null;
          neighborhood?: string | null;
          ministry?: string | null;
          status?: MemberStatus;
          notes?: string | null;
          created_by?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Member, "id" | "created_at">>;
        Relationships: [];
      };
      visitors: {
        Row: Visitor;
        Insert: {
          id?: string;
          full_name: string;
          phone?: string | null;
          location?: string | null;
          denomination?: string | null;
          how_heard?: string | null;
          created_by?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Visitor, "id" | "created_at">>;
        Relationships: [];
      };
      visitor_sensitive_data: {
        Row: VisitorSensitiveData;
        Insert: {
          visitor_id: string;
          prayer_request?: string | null;
          notes?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<VisitorSensitiveData, "visitor_id" | "created_at">>;
        Relationships: [];
      };
      export_audit_logs: {
        Row: ExportAuditLog;
        Insert: {
          id?: string;
          user_id: string;
          user_role: UserRole;
          export_type: string;
          file_name: string;
          purpose: string;
          record_count: number;
          filters?: Record<string, string | number | boolean | null>;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      registry_history: {
        Row: RegistryHistory;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      person_merge_logs: {
        Row: PersonMergeLog;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      access_audit_logs: {
        Row: AccessAuditLog;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      terms_acceptances: {
        Row: TermsAcceptance;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      system_settings: {
        Row: SystemSettings;
        Insert: never;
        Update: Partial<Omit<SystemSettings, "id">>;
        Relationships: [];
      };
      pastors: {
        Row: Pastor;
        Insert: {
          id?: string;
          full_name: string;
          phone?: string | null;
          district?: string | null;
          speaker_role?: SpeakerRole;
          created_by?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Pastor, "id" | "created_at">>;
        Relationships: [];
      };
      special_music: {
        Row: SpecialMusic;
        Insert: {
          id?: string;
          performer_name: string;
          contact?: string | null;
          church?: string | null;
          visit_date?: string;
          created_by?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<SpecialMusic, "id" | "created_at">>;
        Relationships: [];
      };
      services: {
        Row: Service;
        Insert: {
          id?: string;
          service_date: string;
          service_type: ServiceType;
          title?: string | null;
          checkin_token?: string;
          checkin_enabled?: boolean;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Omit<Service, "id" | "created_at">>;
        Relationships: [];
      };
      attendances: {
        Row: Attendance;
        Insert: {
          id?: string;
          person_id: string;
          person_type: PersonType;
          service_id: string;
          service_date: string;
          service_type: ServiceType;
          registered_by?: string | null;
          followed_up_by?: string | null;
          followed_up_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Omit<Attendance, "id" | "created_at">>;
        Relationships: [];
      };
      member_followups: {
        Row: MemberFollowUp;
        Insert: {
          id?: string;
          member_id: string;
          last_service_id: string;
          last_service_date: string;
          absence_streak: number;
          status?: FollowUpStatus;
          notes?: string | null;
          contacted_by?: string | null;
          contacted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<MemberFollowUp, "id" | "created_at">>;
        Relationships: [];
      };
      visitor_followups: {
        Row: VisitorFollowUp;
        Insert: {
          id?: string;
          visitor_id: string;
          last_service_id: string;
          last_service_date: string;
          absence_streak: number;
          status?: FollowUpStatus;
          notes?: string | null;
          contacted_by?: string | null;
          contacted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<VisitorFollowUp, "id" | "created_at">>;
        Relationships: [];
      };
      followup_history: {
        Row: FollowUpHistory;
        Insert: {
          id?: string;
          person_id: string;
          person_type: PersonType;
          attendance_id?: string | null;
          service_id?: string | null;
          action_type: FollowUpActionType;
          outcome: FollowUpOutcome;
          notes?: string | null;
          performed_by: string;
          performed_by_name?: string;
          performed_at?: string;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_followup_actor_names: {
        Args: { p_user_ids: string[] };
        Returns: { display_name: string; user_id: string }[];
      };
      register_access_login: {
        Args: { p_session_id: string };
        Returns: undefined;
      };
      register_access_logout: {
        Args: { p_reason: AccessLogoutReason; p_session_id: string };
        Returns: undefined;
      };
      accept_current_terms: {
        Args: { p_terms_version: string };
        Returns: undefined;
      };
      merge_duplicate_person: {
        Args: {
          p_duplicate_id: string;
          p_person_type: PersonType;
          p_primary_id: string;
        };
        Returns: Record<string, string>;
      };
      get_member_checkin_service: {
        Args: { p_token: string };
        Returns: Record<string, string | boolean | null>;
      };
      register_member_self_checkin: {
        Args: { p_phone: string; p_token: string };
        Returns: Record<string, string | boolean | null>;
      };
    };
    Enums: {
      user_role: UserRole;
      member_status: MemberStatus;
      service_type: ServiceType;
      person_type: PersonType;
    };
    CompositeTypes: Record<string, never>;
  };
};
