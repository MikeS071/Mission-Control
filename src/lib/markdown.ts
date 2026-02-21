const headingRegex = /^(#{1,6})\s+(.*)$/;
const unorderedListRegex = /^[-*]\s+(.*)$/;
const orderedListRegex = /^\d+\.\s+(.*)$/;
const blockquoteRegex = /^>\s?(.*)$/;
const horizontalRuleRegex = /^(-{3,}|_{3,}|\*{3,})$/;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatInline = (value: string) => {
  let output = escapeHtml(value);

  output = output.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img src="$2" alt="$1" loading="lazy" />');
  output = output.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  output = output.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  output = output.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  output = output.replace(/_([^_]+)_/g, '<em>$1</em>');
  output = output.replace(/`([^`]+)`/g, '<code>$1</code>');
  return output;
};

export function renderMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let codeBuffer: string[] = [];
  let inCodeBlock = false;
  let paragraphBuffer: string[] = [];

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  const ensureList = (type: 'ul' | 'ol') => {
    if (listType !== type) {
      closeList();
      html.push(`<${type}>`);
      listType = type;
    }
  };

  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      html.push(`<p>${formatInline(paragraphBuffer.join(' '))}</p>`);
      paragraphBuffer = [];
    }
  };

  const flushCode = () => {
    if (codeBuffer.length > 0) {
      html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
      codeBuffer = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        flushCode();
        inCodeBlock = false;
      } else {
        flushParagraph();
        closeList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(rawLine);
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      closeList();
      continue;
    }

    const headingMatch = line.match(headingRegex);
    if (headingMatch) {
      flushParagraph();
      closeList();
      const level = Math.min(6, headingMatch[1].length);
      html.push(`<h${level}>${formatInline(headingMatch[2].trim())}</h${level}>`);
      continue;
    }

    if (horizontalRuleRegex.test(line.trim())) {
      flushParagraph();
      closeList();
      html.push('<hr />');
      continue;
    }

    const blockquoteMatch = line.match(blockquoteRegex);
    if (blockquoteMatch) {
      flushParagraph();
      closeList();
      html.push(`<blockquote>${formatInline(blockquoteMatch[1])}</blockquote>`);
      continue;
    }

    const unorderedMatch = line.match(unorderedListRegex);
    if (unorderedMatch) {
      flushParagraph();
      ensureList('ul');
      html.push(`<li>${formatInline(unorderedMatch[1])}</li>`);
      continue;
    }

    const orderedMatch = line.match(orderedListRegex);
    if (orderedMatch) {
      flushParagraph();
      ensureList('ol');
      html.push(`<li>${formatInline(orderedMatch[1])}</li>`);
      continue;
    }

    paragraphBuffer.push(line.trim());
  }

  flushParagraph();
  closeList();
  if (inCodeBlock) {
    flushCode();
  }

  return html.filter(Boolean).join('\n');
}
