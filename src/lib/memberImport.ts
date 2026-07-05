import type { Member, MemberStatus } from "@/lib/types";

export type RawImportRow = Record<string, string>;

export type MemberImportRow = {
  id: string;
  sourceRow: number;
  full_name: string;
  phone: string;
  neighborhood: string;
  ministry: string;
  status: MemberStatus;
  notes: string;
  errors: string[];
  isDuplicate: boolean;
};

type ImportField = "full_name" | "phone" | "neighborhood" | "ministry" | "status" | "notes";

const HEADER_ALIASES: Record<ImportField, string[]> = {
  full_name: ["nome", "nomecompleto", "membro", "nomedomembro"],
  phone: ["telefone", "whatsapp", "zap", "celular", "contato"],
  neighborhood: ["bairro", "cidadebairro", "cidade", "endereco", "endereco"],
  ministry: ["ministerio", "departamento", "area", "funcao"],
  status: ["status", "situacao"],
  notes: ["observacoes", "observacao", "obs", "notas", "anotacoes"]
};

const STATUS_ALIASES: Record<string, MemberStatus> = {
  ativo: "ativo",
  ativa: "ativo",
  afastado: "afastado",
  afastada: "afastado",
  transferido: "transferido",
  transferida: "transferido"
};

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function normalizeValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function cleanCell(value: unknown) {
  return String(value ?? "").trim();
}

function findField(header: string): ImportField | null {
  const normalized = normalizeKey(header);
  const match = Object.entries(HEADER_ALIASES).find(([, aliases]) =>
    aliases.includes(normalized)
  );

  return (match?.[0] as ImportField | undefined) ?? null;
}

function parseStatus(value: string): { status: MemberStatus; error?: string } {
  if (!value.trim()) return { status: "ativo" };

  const status = STATUS_ALIASES[normalizeValue(value)];
  if (status) return { status };

  return { status: "ativo", error: "Status inválido" };
}

function duplicateKey(name: string, phone: string) {
  return `${normalizeValue(name)}|${normalizeValue(phone)}`;
}

function splitDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === delimiter && !insideQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function bestDelimiter(lines: string[]) {
  const candidates = [";", "\t", ",", "|"];
  return candidates
    .map((delimiter) => ({
      delimiter,
      score: lines.reduce(
        (total, line) => total + Math.max(splitDelimitedLine(line, delimiter).length - 1, 0),
        0
      )
    }))
    .sort((a, b) => b.score - a.score)[0]?.delimiter ?? ";";
}

function tableLinesToRows(lines: string[]) {
  const cleanLines = lines.map((line) => line.trim()).filter(Boolean);
  const delimiter = bestDelimiter(cleanLines);
  const table = cleanLines.map((line) => splitDelimitedLine(line, delimiter));
  const headerIndex = table.findIndex((cells) =>
    cells.some((cell) => findField(cell) === "full_name")
  );

  if (headerIndex === -1) {
    throw new Error("Não encontrei a coluna Nome no arquivo.");
  }

  const headers = table[headerIndex];

  return table.slice(headerIndex + 1).map((cells) => {
    const row: RawImportRow = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });
}

async function readSpreadsheetRows(file: File) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("A planilha está vazia.");
  }

  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<RawImportRow>(sheet, {
    defval: "",
    raw: false
  });
}

type PdfTextItem = {
  str: string;
  transform: number[];
};

function isPdfTextItem(item: unknown): item is PdfTextItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    "transform" in item &&
    typeof (item as PdfTextItem).str === "string" &&
    Array.isArray((item as PdfTextItem).transform)
  );
}

async function readPdfRows(file: File) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.mjs",
    import.meta.url
  ).toString();

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;
  const lines: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const grouped = new Map<number, { text: string; x: number }[]>();

    content.items.forEach((rawItem) => {
      if (!isPdfTextItem(rawItem)) return;

      const item = rawItem as PdfTextItem;
      const x = Math.round(item.transform[4] ?? 0);
      const y = Math.round(item.transform[5] ?? 0);
      const current = grouped.get(y) ?? [];
      current.push({ text: item.str.trim(), x });
      grouped.set(y, current);
    });

    [...grouped.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, items]) => {
        const line = items
          .sort((a, b) => a.x - b.x)
          .map((item) => item.text)
          .filter(Boolean)
          .join(";");

        if (line) lines.push(line);
      });
  }

  return tableLinesToRows(lines);
}

export async function readMemberImportFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "pdf") {
    return readPdfRows(file);
  }

  if (["csv", "xls", "xlsx", "txt"].includes(extension ?? "")) {
    return readSpreadsheetRows(file);
  }

  throw new Error("Use um arquivo Excel, CSV ou PDF.");
}

export function prepareMemberImportRows(
  rawRows: RawImportRow[],
  existingMembers: Pick<Member, "full_name" | "phone">[]
) {
  const existingKeys = new Set(
    existingMembers.map((member) => duplicateKey(member.full_name, member.phone ?? ""))
  );
  const seenKeys = new Set<string>();

  return rawRows
    .map((rawRow, index) => {
      const mapped: Record<ImportField, string> = {
        full_name: "",
        phone: "",
        neighborhood: "",
        ministry: "",
        status: "",
        notes: ""
      };

      Object.entries(rawRow).forEach(([header, value]) => {
        const field = findField(header);
        if (field) mapped[field] = cleanCell(value);
      });

      const statusResult = parseStatus(mapped.status);
      const key = duplicateKey(mapped.full_name, mapped.phone);
      const errors: string[] = [];

      if (!mapped.full_name) errors.push("Nome obrigatório");
      if (statusResult.error) errors.push(statusResult.error);

      const isDuplicate =
        Boolean(mapped.full_name) && (existingKeys.has(key) || seenKeys.has(key));

      if (mapped.full_name) {
        seenKeys.add(key);
      }

      return {
        id: `${index}-${mapped.full_name || "sem-nome"}`,
        sourceRow: index + 2,
        full_name: mapped.full_name,
        phone: mapped.phone,
        neighborhood: mapped.neighborhood,
        ministry: mapped.ministry,
        status: statusResult.status,
        notes: mapped.notes,
        errors,
        isDuplicate
      };
    })
    .filter((row) =>
      [
        row.full_name,
        row.phone,
        row.neighborhood,
        row.ministry,
        row.notes
      ].some(Boolean)
    );
}
