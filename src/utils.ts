/**
 * Safe utility to parse inline styling tags into HTML elements.
 * Supports:
 * - **bold** -> <strong>bold</strong>
 * - *italic* -> <em>italic</em>
 * - _underline_ -> <u>underline</u>
 * - [color:#hexOrName](text) -> <span style="color: #hexOrName">text</span>
 * - [size:scaleOrPercent](text) -> <span style="font-size: scaleOrPercent">text</span>
 */
export function parseTextToHtml(text: string): string {
  if (!text) return '';

  // 1. Escape HTML characters to protect against XSS/injections
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  // 2. Parse Bold: **text** -> <strong>text</strong>
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // 3. Parse Italic: *text* -> <em>text</em>
  escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // 4. Parse Underline: _text_ -> <u>text</u>
  escaped = escaped.replace(/_(.*?)_/g, '<u>$1</u>');

  // 5. Parse custom color: [color:#hexOrName](text) -> <span style="color: #hexOrName">text</span>
  escaped = escaped.replace(/\[color:(#[a-fA-F0-9]{3,8}|[a-zA-Z]+)\]\((.*?)\)/g, '<span style="color: $1">$2</span>');

  // 6. Parse custom relative size: [size:scale](text) -> <span style="font-size: scale">text</span>
  escaped = escaped.replace(/\[size:(\d+(?:\.\d+)?(?:em|%|px)?)\]\((.*?)\)/g, (match, size, innerText) => {
    let finalSize = size;
    // Default to 'em' if pure number with no unit specified
    if (/^\d+(?:\.\d+)?$/.test(size)) {
      finalSize = size + 'em';
    }
    return `<span style="font-size: ${finalSize}">${innerText}</span>`;
  });

  // 7. Convert newlines to <br> tags for display in rendered HTML
  escaped = escaped.replace(/\n/g, '<br>');

  return escaped;
}

/**
 * Like parseTextToHtml but also explicitly ensures newlines become <br> for contenteditable initialization.
 * (Already handled above, kept as alias for clarity.)
 */
export function parseTextToEditableHtml(text: string): string {
  return parseTextToHtml(text);
}

/**
 * Converts HTML from a contenteditable div back to our custom markup format.
 * Handles: <strong>/<b> → **text**, <em>/<i> → *text*, <u> → _text_,
 * <span style="color:..."> → [color:...](text), <span style="font-size:..."> → [size:...](text),
 * <br> → \n, <div>/<p> → newline prefix
 */
export function htmlToMarkup(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return serializeNode(div);
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || '';
  }

  const el = node as HTMLElement;
  const children = Array.from(el.childNodes).map(serializeNode).join('');
  const tag = el.tagName?.toLowerCase();

  if (!tag) return children;
  if (tag === 'br') return '\n';
  if (tag === 'strong' || tag === 'b') return `**${children}**`;
  if (tag === 'em' || tag === 'i') return `*${children}*`;
  if (tag === 'u') return `_${children}_`;
  if (tag === 'div' || tag === 'p') {
    // Block elements add a newline before (except first child)
    const isFirst = !node.previousSibling;
    return (isFirst ? '' : '\n') + children;
  }
  if (tag === 'span') {
    const colorValue = el.style.color;
    const fontSizeValue = el.style.fontSize;
    if (colorValue) {
      const hex = rgbToHex(colorValue) || colorValue;
      return `[color:${hex}](${children})`;
    }
    if (fontSizeValue) {
      return `[size:${fontSizeValue}](${children})`;
    }
    return children;
  }
  // <font color> from legacy execCommand implementations
  if (tag === 'font') {
    const color = el.getAttribute('color');
    if (color) return `[color:${color}](${children})`;
    return children;
  }
  return children;
}

function rgbToHex(rgb: string): string | null {
  const match = rgb.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (!match) return null;
  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}
