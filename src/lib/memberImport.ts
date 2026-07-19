import type { Member, MemberStatus } from "@/lib/types";
import { findPotentialDuplicate, normalizeBrazilPhone } from "@/lib/duplicates";

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

const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;
const MAX_IMPORT_ROWS = 5000;

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
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error("A planilha está vazia.");
  }

  let headerRowNumber = 0;
  let headers: string[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (headerRowNumber) return;

    const currentHeaders = Array.from({ length: row.cellCount }, (_, index) =>
      row.getCell(index + 1).text.trim()
    );

    if (currentHeaders.some((header) => findField(header) === "full_name")) {
      headerRowNumber = rowNumber;
      headers = currentHeaders;
    }
  });

  if (!headerRowNumber) {
    throw new Error("Não encontrei a coluna Nome no arquivo.");
  }

  if (worksheet.rowCount - headerRowNumber > MAX_IMPORT_ROWS) {
    throw new Error(`A planilha pode ter no máximo ${MAX_IMPORT_ROWS} linhas.`);
  }

  const rows: RawImportRow[] = [];

  for (let rowNumber = headerRowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const parsedRow: RawImportRow = {};
    let hasContent = false;

    headers.forEach((header, index) => {
      if (!header) return;
      const value = row.getCell(index + 1).text.trim();
      if (value) hasContent = true;
      parsedRow[header] = value;
    });

    if (hasContent) rows.push(parsedRow);
  }

  return rows;
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

  if (file.size > MAX_IMPORT_FILE_SIZE) {
    throw new Error("O arquivo pode ter no máximo 10 MB.");
  }

  if (extension === "pdf") {
    const rows = await readPdfRows(file);
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new Error(`O arquivo pode ter no máximo ${MAX_IMPORT_ROWS} registros.`);
    }
    return rows;
  }

  if (extension === "xlsx") {
    return readSpreadsheetRows(file);
  }

  if (["csv", "txt"].includes(extension ?? "")) {
    const rows = tableLinesToRows((await file.text()).split(/\r?\n/));
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new Error(`O arquivo pode ter no máximo ${MAX_IMPORT_ROWS} registros.`);
    }
    return rows;
  }

  if (extension === "xls") {
    throw new Error("O formato .xls é antigo. Abra o arquivo no Excel e salve como .xlsx.");
  }

  throw new Error("Use um arquivo XLSX, CSV, TXT ou PDF.");
}

export function prepareMemberImportRows(
  rawRows: RawImportRow[],
  existingMembers: Pick<Member, "full_name" | "phone" | "neighborhood">[]
) {
  const seenRows: Pick<Member, "full_name" | "phone" | "neighborhood">[] = [];

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

      mapped.phone = normalizeBrazilPhone(mapped.phone);

      const statusResult = parseStatus(mapped.status);
      const errors: string[] = [];

      if (!mapped.full_name) errors.push("Nome obrigatório");
      if (statusResult.error) errors.push(statusResult.error);

      const isDuplicate =
        Boolean(mapped.full_name) &&
        Boolean(
          findPotentialDuplicate(existingMembers, {
            full_name: mapped.full_name,
            phone: mapped.phone,
            neighborhood: mapped.neighborhood
          }) ||
            findPotentialDuplicate(seenRows, {
              full_name: mapped.full_name,
              phone: mapped.phone,
              neighborhood: mapped.neighborhood
            })
        );

      if (mapped.full_name) {
        seenRows.push({
          full_name: mapped.full_name,
          phone: mapped.phone,
          neighborhood: mapped.neighborhood
        });
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
