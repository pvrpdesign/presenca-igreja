export type UserRole = "recepcao" | "lideranca";
export type MemberStatus = "ativo" | "afastado" | "transferido";
export type ServiceType = "quarta" | "sabado" | "especial";
export type PersonType = "membro" | "visitante" | "pastor" | "musica";
export type FollowUpStatus = "pendente" | "acompanhado" | "removido";

export type Profile = {
  id: string;
  full_name: string | null;
  role: UserRole;
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
  created_at: string;
  updated_at: string;
};

export type Visitor = {
  id: string;
  full_name: string;
  phone: string | null;
  location: string | null;
  how_heard: string | null;
  prayer_request: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Pastor = {
  id: string;
  full_name: string;
  phone: string | null;
  district: string | null;
  created_by: string | null;
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
  created_at: string;
  updated_at: string;
};

export type Service = {
  id: string;
  service_date: string;
  service_type: ServiceType;
  title: string | null;
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

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          full_name?: string | null;
          role?: UserRole;
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
          how_heard?: string | null;
          prayer_request?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Visitor, "id" | "created_at">>;
        Relationships: [];
      };
      pastors: {
        Row: Pastor;
        Insert: {
          id?: string;
          full_name: string;
          phone?: string | null;
          district?: string | null;
          created_by?: string | null;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      member_status: MemberStatus;
      service_type: ServiceType;
      person_type: PersonType;
    };
    CompositeTypes: Record<string, never>;
  };
};
