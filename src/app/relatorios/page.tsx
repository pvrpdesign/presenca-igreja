"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarClock, RefreshCw, UserCheck, UserRoundPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { Notice, PageHeader, StatusBadge } from "@/components/ui";
import { formatDateBR, SERVICE_LABELS, todayInputValue } from "@/lib/date";
import { supabase } from "@/lib/supabase";
import type { Attendance, Member, Service, Visitor } from "@/lib/types";

type ReportMember = Pick<
  Member,
  "id" | "full_name" | "phone" | "neighborhood" | "ministry"
>;

type VisitorFrequency = Pick<Visitor, "id" | "full_name" | "phone" | "location"> & {
  total: number;
};

type Reports = {
  lastService: Pick<Service, "id" | "service_date" | "service_type"> | null;
  absentLast: ReportMember[];
  missedTwo: ReportMember[];
  missedThree: ReportMember[];
  visitorsMoreThanOnce: VisitorFrequency[];
  visitorsThreeOrMore: VisitorFrequency[];
  serviceCount: number;
};

const emptyReports: Reports = {
  lastService: null,
  absentLast: [],
  missedTwo: [],
  missedThree: [],
  visitorsMoreThanOnce: [],
  visitorsThreeOrMore: [],
  serviceCount: 0
};

export default function ReportsPage() {
  return (
    <AuthGate allowedRoles={["lideranca"]}>
      <ReportsContent />
    </AuthGate>
  );
}

function ReportsContent() {
  const [reports, setReports] = useState<Reports>(emptyReports);
  const [isLoading, setIsLoading] = useState(true);

  const lastServiceText = useMemo(() => {
    if (!reports.lastService) return "Nenhum culto registrado";
    return `${SERVICE_LABELS[reports.lastService.service_type]} em ${formatDateBR(
      reports.lastService.service_date
    )}`;
  }, [reports.lastService]);

  const loadReports = useCallback(async () => {
    setIsLoading(true);

    const { data: servicesData } = await supabase
      .from("services")
      .select("id, service_date, service_type")
      .lte("service_date", todayInputValue())
      .order("service_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(12);

    const services = (servicesData ?? []) as Pick<
      Service,
      "id" | "service_date" | "service_type"
    >[];
    const recentServices = services.slice(0, 3);
    const serviceIds = recentServices.map((service) => service.id);

    const { data: membersData } = await supabase
      .from("members")
      .select("id, full_name, phone, neighborhood, ministry")
      .eq("status", "ativo")
      .order("full_name", { ascending: true });

    const activeMembers = (membersData ?? []) as ReportMember[];

    let memberAttendances: Pick<
      Attendance,
      "person_id" | "person_type" | "service_id"
    >[] = [];

    if (serviceIds.length > 0) {
      const { data } = await supabase
        .from("attendances")
        .select("person_id, person_type, service_id")
        .eq("person_type", "membro")
        .in("service_id", serviceIds);

      memberAttendances = (data ?? []) as Pick<
        Attendance,
        "person_id" | "person_type" | "service_id"
      >[];
    }

    const attendanceByService = new Map<string, Set<string>>();
    recentServices.forEach((service) => attendanceByService.set(service.id, new Set()));
    memberAttendances.forEach((attendance) => {
      attendanceByService.get(attendance.service_id)?.add(attendance.person_id);
    });

    const lastService = recentServices[0] ?? null;
    const lastPresent = lastService ? attendanceByService.get(lastService.id) : null;

    const absentLast =
      lastPresent && lastService
        ? activeMembers.filter((member) => !lastPresent.has(member.id))
        : [];

    const missedTwo =
      recentServices.length >= 2
        ? activeMembers.filter((member) =>
            recentServices
              .slice(0, 2)
              .every((service) => !attendanceByService.get(service.id)?.has(member.id))
          )
        : [];

    const missedThree =
      recentServices.length >= 3
        ? activeMembers.filter((member) =>
            recentServices
              .slice(0, 3)
              .every((service) => !attendanceByService.get(service.id)?.has(member.id))
          )
        : [];

    const { data: visitorAttendanceData } = await supabase
      .from("attendances")
      .select("person_id")
      .eq("person_type", "visitante")
      .limit(5000);

    const visitorCounts = new Map<string, number>();
    (visitorAttendanceData ?? []).forEach((attendance) => {
      visitorCounts.set(attendance.person_id, (visitorCounts.get(attendance.person_id) ?? 0) + 1);
    });

    const recurringVisitorIds = [...visitorCounts.entries()]
      .filter(([, total]) => total > 1)
      .map(([id]) => id);

    let visitorRows: Pick<Visitor, "id" | "full_name" | "phone" | "location">[] = [];

    if (recurringVisitorIds.length > 0) {
      const { data } = await supabase
        .from("visitors")
        .select("id, full_name, phone, location")
        .in("id", recurringVisitorIds);

      visitorRows = (data ?? []) as Pick<Visitor, "id" | "full_name" | "phone" | "location">[];
    }

    const visitorsWithFrequency = visitorRows
      .map((visitor) => ({
        ...visitor,
        total: visitorCounts.get(visitor.id) ?? 0
      }))
      .sort((a, b) => b.total - a.total || a.full_name.localeCompare(b.full_name));

    setReports({
      lastService,
      absentLast,
      missedTwo,
      missedThree,
      visitorsMoreThanOnce: visitorsWithFrequency.filter((visitor) => visitor.total > 1),
      visitorsThreeOrMore: visitorsWithFrequency.filter((visitor) => visitor.total >= 3),
      serviceCount: services.length
    });
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  return (
    <div>
      <PageHeader
        action={
          <button className="secondary-button" onClick={loadReports} type="button">
            <RefreshCw aria-hidden="true" size={17} />
            Atualizar
          </button>
        }
        eyebrow="Liderança"
        title="Relatórios"
      />

      <section className="mb-5 rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Último culto</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">{lastServiceText}</h2>
          </div>
          <StatusBadge tone={reports.serviceCount > 0 ? "success" : "warning"}>
            {reports.serviceCount} cultos na base
          </StatusBadge>
        </div>
      </section>

      {isLoading ? (
        <Notice title="Carregando relatórios..." />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          <ReportSection
            count={reports.absentLast.length}
            emptyText="Nenhum membro ausente no último culto."
            icon={CalendarClock}
            items={reports.absentLast}
            title="Membros ausentes no último culto"
          />
          <ReportSection
            count={reports.missedTwo.length}
            emptyText={
              reports.serviceCount < 2
                ? "Ainda não há 2 cultos registrados."
                : "Nenhum membro com 2 faltas seguidas."
            }
            icon={AlertCircle}
            items={reports.missedTwo}
            title="Membros com 2 faltas seguidas"
          />
          <ReportSection
            count={reports.missedThree.length}
            emptyText={
              reports.serviceCount < 3
                ? "Ainda não há 3 cultos registrados."
                : "Nenhum membro com 3 faltas seguidas."
            }
            icon={AlertCircle}
            items={reports.missedThree}
            title="Membros com 3 faltas seguidas"
          />
          <VisitorSection
            emptyText="Nenhum visitante veio mais de uma vez."
            icon={UserRoundPlus}
            items={reports.visitorsMoreThanOnce}
            title="Visitantes que vieram mais de uma vez"
          />
          <VisitorSection
            emptyText="Nenhum visitante veio 3 vezes ou mais."
            icon={UserCheck}
            items={reports.visitorsThreeOrMore}
            title="Visitantes que vieram 3 vezes ou mais"
          />
        </div>
      )}
    </div>
  );
}

function ReportSection({
  count,
  emptyText,
  icon: Icon,
  items,
  title
}: {
  count: number;
  emptyText: string;
  icon: LucideIcon;
  items: ReportMember[];
  title: string;
}) {
  return (
    <section className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon aria-hidden="true" size={19} />
          <h2 className="text-base font-semibold text-ink">{title}</h2>
        </div>
        <StatusBadge tone={count > 0 ? "warning" : "success"}>{count}</StatusBadge>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted">{emptyText}</p>
      ) : (
        <div className="space-y-3">
          {items.map((member) => (
            <div className="border-b border-line pb-3 last:border-0 last:pb-0" key={member.id}>
              <p className="font-medium text-ink">{member.full_name}</p>
              <p className="text-sm text-muted">
                {member.phone || member.ministry || member.neighborhood || "Sem contato"}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function VisitorSection({
  emptyText,
  icon: Icon,
  items,
  title
}: {
  emptyText: string;
  icon: LucideIcon;
  items: VisitorFrequency[];
  title: string;
}) {
  return (
    <section className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon aria-hidden="true" size={19} />
          <h2 className="text-base font-semibold text-ink">{title}</h2>
        </div>
        <StatusBadge tone={items.length > 0 ? "success" : "neutral"}>{items.length}</StatusBadge>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted">{emptyText}</p>
      ) : (
        <div className="space-y-3">
          {items.map((visitor) => (
            <div className="border-b border-line pb-3 last:border-0 last:pb-0" key={visitor.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{visitor.full_name}</p>
                  <p className="text-sm text-muted">
                    {visitor.phone || visitor.location || "Sem contato"}
                  </p>
                </div>
                <StatusBadge tone="success">{visitor.total} presenças</StatusBadge>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
