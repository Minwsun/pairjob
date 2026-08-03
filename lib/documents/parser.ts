import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { load } from "cheerio";

const MAX_BYTES = 10 * 1024 * 1024;
const headings: [RegExp, string][] = [
  [/^(summary|profile|professional summary|objective|tóm tắt|giới thiệu)$/i, "summary"],
  [/^(experience|work experience|employment history|kinh nghiệm|kinh nghiệm làm việc)$/i, "experience"],
  [/^(skills|technical skills|core competencies|kỹ năng|năng lực)$/i, "skills"],
  [/^(education|academic background|học vấn|đào tạo)$/i, "education"],
  [/^(projects|selected projects|portfolio|dự án)$/i, "projects"],
];

function sectionsFromText(text: string) {
  const sections: Record<string, string> = {}; let current = "content";
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim(); if (!trimmed) continue;
    const heading = trimmed.replace(/^#+\s*/, "").replace(/[:|]+$/, "").trim(); const matched = headings.find(([pattern]) => pattern.test(heading));
    if (matched) current = matched[1]; else sections[current] = `${sections[current] ?? ""}${trimmed}\n`;
  }
  return sections;
}

function cleanPages(pages: { text: string }[]) {
  const pageLines = pages.map((page) => page.text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean)); const frequency = new Map<string, number>();
  for (const lines of pageLines) for (const line of new Set(lines)) frequency.set(line, (frequency.get(line) ?? 0) + 1);
  const repeated = new Set([...frequency].filter(([line, count]) => pages.length > 1 && count / pages.length >= .6 && line.length < 120).map(([line]) => line));
  return pageLines.map((lines) => lines.filter((line) => !repeated.has(line) && !/^-- \d+ of \d+ --$/.test(line)).join("\n")).join("\n").trim();
}

function htmlText(source: string) {
  const $ = load(source); $("script,style,noscript,nav,footer,header,svg,canvas").remove(); $("br").replaceWith("\n");
  $("p,div,section,article,main,aside,h1,h2,h3,h4,h5,h6,li,tr,table,ul,ol").each((_, element) => { $(element).prepend("\n"); $(element).append("\n"); });
  return $("body").text().replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function parseLocalDocument(filePath: string, mimeType: string) {
  return parseDocumentBuffer(await readFile(filePath), mimeType);
}

export async function parseDocumentBuffer(buffer: Buffer, mimeType: string) {
  if (buffer.byteLength > MAX_BYTES) throw new Error("FILE_TOO_LARGE"); let text = "";
  if (mimeType === "application/pdf") {
    const { PDFParse } = await import("pdf-parse").catch((error) => {
      console.error("PDF runtime unavailable", error);
      throw new Error("PDF_RUNTIME_UNAVAILABLE", { cause: error });
    });
    const parser = new PDFParse({ data: buffer });
    try { const result = await parser.getText({ lineEnforce: true, cellSeparator: "\n", pageJoiner: "" }); text = cleanPages(result.pages); } finally { await parser.destroy(); }
    if (text.replace(/\s/g, "").length < 80) {
      return { text, sections: {}, ocrRequired: true, metadata: { sourceMethod: "native_pdf", warning: "OCR_REQUIRED" } };
    }
  } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = (await import("mammoth")).default;
    text = (await mammoth.extractRawText({ buffer })).value;
  }
  else { const source = buffer.toString("utf8"); text = mimeType === "text/html" ? htmlText(source) : source.replace(/^---[\s\S]*?---/, "").replace(/[`*_>#-]/g, " "); }
  return { text: text.trim(), sections: sectionsFromText(text), ocrRequired: false, metadata: { sourceMethod: mimeType === "application/pdf" ? "native_pdf" : mimeType.includes("wordprocessingml") ? "mammoth_docx" : mimeType === "text/html" ? "local_html" : "text" } };
}

function privateAddress(address: string) {
  if (address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80")) return true;
  if (!isIP(address)) return true; return /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);
}

export async function parsePublicUrl(value: string) {
  const url = new URL(value); if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("UNSAFE_URL");
  const addresses = await lookup(url.hostname, { all: true }); if (!addresses.length || (process.env.PARSER_ALLOW_PRIVATE_TEST_URLS !== "1" && addresses.some(({ address }) => privateAddress(address)))) throw new Error("UNSAFE_URL");
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { redirect: "error", signal: controller.signal, headers: { "User-Agent": "PairJobParser/1.0" } });
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("text/html")) throw new Error("URL_NOT_HTML");
    const length = Number(response.headers.get("content-length") ?? 0); if (length > MAX_BYTES) throw new Error("FILE_TOO_LARGE"); const html = await response.text(); if (Buffer.byteLength(html) > MAX_BYTES) throw new Error("FILE_TOO_LARGE");
    const text = htmlText(html); return { text, sections: sectionsFromText(text), ocrRequired: false, metadata: { sourceMethod: "public_html" } };
  } finally { clearTimeout(timer); }
}
