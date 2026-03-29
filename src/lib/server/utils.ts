export function normalizeJiraBaseUrl(rawUrl?: string) {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return "";
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

export function parseLabelList(rawLabels?: string) {
  return String(rawLabels || "")
    .split(",")
    .map((label) => label.trim())
    .map((label) => label.replace(/^\[+/, "").replace(/\]+$/, "").trim())
    .map((label) => label.replace(/^"+|"+$/g, "").replace(/^'+|'+$/g, "").trim())
    .filter(Boolean);
}

export function slugify(input: string) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function adfToPlainText(node: unknown): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map((item) => adfToPlainText(item)).join("");
  if (typeof node !== "object") return "";

  const typedNode = node as { type?: string; text?: string; content?: unknown[] };
  if (typedNode.type === "text") return typedNode.text || "";
  if (typedNode.type === "hardBreak") return "\n";

  const content = adfToPlainText(typedNode.content || []);
  if (["paragraph", "heading", "listItem", "bulletList", "orderedList", "tableRow"].includes(String(typedNode.type || ""))) {
    return `${content}\n`;
  }
  return content;
}

export function normalizeMultilineText(value: unknown, maxLength = 1500) {
  const text = String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...[truncated]`;
}
