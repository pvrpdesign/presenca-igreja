type ExcelValue = string | number | boolean | null | undefined;

export type ExcelSheet = {
  name: string;
  rows: Record<string, ExcelValue>[];
};

export type PdfSection = {
  title: string;
  lines: string[];
};

function todayFileDate() {
  return new Date().toISOString().slice(0, 10);
}

export function datedFileName(prefix: string, extension: string) {
  return `${prefix}-${todayFileDate()}.${extension}`;
}

export async function downloadExcelWorkbook(fileName: string, sheets: ExcelSheet[]) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  sheets.forEach((sheet) => {
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
  });

  XLSX.writeFile(workbook, fileName);
}

function escapePdfText(value: string) {
  const text = `\uFEFF${value}`;
  return `<${Array.from(text)
    .map((char) => char.charCodeAt(0).toString(16).padStart(4, "0"))
    .join("")}>`;
}

function splitText(text: string, maxChars: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    if (!current) {
      current = word;
      return;
    }

    if (`${current} ${word}`.length > maxChars) {
      lines.push(current);
      current = word;
      return;
    }

    current = `${current} ${word}`;
  });

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadSimplePdf({
  fileName,
  title,
  subtitle,
  sections
}: {
  fileName: string;
  title: string;
  subtitle?: string;
  sections: PdfSection[];
}) {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 44;
  const bottom = 44;
  const normalSize = 10;

  const pages: string[][] = [];
  let currentPage: string[] = [];
  let y = pageHeight - margin;

  function addLine(text: string, size = normalSize, bold = false, extraGap = 0) {
    const maxChars = Math.max(36, Math.floor((pageWidth - margin * 2) / (size * 0.48)));
    splitText(text, maxChars).forEach((line) => {
      if (y < bottom) {
        pages.push(currentPage);
        currentPage = [];
        y = pageHeight - margin;
      }

      const font = bold ? "F2" : "F1";
      currentPage.push(`BT /${font} ${size} Tf ${margin} ${y} Td ${escapePdfText(line)} Tj ET`);
      y -= size + 6;
    });

    y -= extraGap;
  }

  addLine(title, 18, true, 8);
  if (subtitle) addLine(subtitle, 11, false, 4);
  addLine(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 9, false, 10);

  sections.forEach((section) => {
    addLine(section.title, 13, true, 3);

    if (section.lines.length === 0) {
      addLine("Nenhum registro encontrado.", 10, false, 8);
      return;
    }

    section.lines.forEach((line) => addLine(line, 10, false, 1));
    y -= 7;
  });

  if (currentPage.length > 0) pages.push(currentPage);

  const objects: string[] = [];
  const addObject = (content: string) => {
    objects.push(content);
    return objects.length;
  };

  const catalogId = addObject("PLACEHOLDER_CATALOG");
  const pagesId = addObject("PLACEHOLDER_PAGES");
  const fontRegularId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBoldId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds: number[] = [];

  pages.forEach((pageLines) => {
    const stream = pageLines.join("\n");
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    pageIds.push(pageId);
  });

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  downloadBlob(fileName, new Blob([pdf], { type: "application/pdf" }));
}
