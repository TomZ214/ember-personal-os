/**
 * Small, dependency-free markdown renderer for the Notes module.
 * Supports: headings, bold/italic, inline + fenced code, lists, quotes,
 * links, hr. All input is escaped first — output is safe to inject.
 */

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

export function renderMarkdown(src: string): string {
  const lines = escapeHtml(src).split("\n");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let inCode = false;
  let para: string[] = [];

  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join("<br/>"))}</p>`);
      para = [];
    }
  };

  for (const raw of lines) {
    const line = raw;

    if (line.trim().startsWith("```")) {
      flushPara();
      closeList();
      out.push(inCode ? "</code></pre>" : "<pre><code>");
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(line);
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.*)/);
    if (h) {
      flushPara();
      closeList();
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line.trim())) {
      flushPara();
      closeList();
      out.push("<hr/>");
      continue;
    }
    const q = line.match(/^&gt;\s?(.*)/);
    if (q) {
      flushPara();
      closeList();
      out.push(`<blockquote>${inline(q[1])}</blockquote>`);
      continue;
    }
    const ul = line.match(/^\s*[-*]\s+(.*)/);
    const ol = line.match(/^\s*\d+\.\s+(.*)/);
    if (ul || ol) {
      flushPara();
      const kind = ul ? "ul" : "ol";
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
      continue;
    }
    if (line.trim() === "") {
      flushPara();
      closeList();
      continue;
    }
    para.push(line);
  }
  if (inCode) out.push("</code></pre>");
  flushPara();
  closeList();
  return out.join("\n");
}
