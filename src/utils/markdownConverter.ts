import logger from './logger';
import type { Tokens } from 'marked';

// Lazy load marked module (ESM) using dynamic import
let markedModule: typeof import('marked') | null = null;
let markedConfigured = false;

/**
 * Get the marked module, loading it dynamically if needed
 */
async function getMarked(): Promise<typeof import('marked')> {
  if (!markedModule) {
    markedModule = await import('marked');
  }
  return markedModule;
}

/**
 * Initialize marked with WordPress-optimized renderer
 */
async function initializeMarked(): Promise<void> {
  if (markedConfigured) {
    return;
  }

  const markedModule = await getMarked();
  const { marked, Renderer } = markedModule;
  
  // Create custom renderer by extending the default renderer
  const renderer = new Renderer();
  
  // Override table rendering
  renderer.table = function(token: Tokens.Table): string {
    const headerRow = token.header.map(cell => renderer.tablecell(cell)).join('');
    const bodyRows = token.rows.map(row => {
      const cells = row.map(cell => renderer.tablecell(cell)).join('');
      return `<tr>${cells}</tr>`;
    }).join('\n');

    return `<table class="wp-block-table">
<thead>
<tr>${headerRow}</tr>
</thead>
<tbody>
${bodyRows}
</tbody>
</table>`;
  };

  // Override code block rendering
  renderer.code = function(token: Tokens.Code): string {
    const lang = token.lang || 'plaintext';
    const escapedCode = token.text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    return `<pre class="wp-block-code"><code class="language-${lang}">${escapedCode}</code></pre>`;
  };

  // Override blockquote rendering
  const originalBlockquote = renderer.blockquote.bind(renderer);
  renderer.blockquote = function(token: Tokens.Blockquote): string {
    const body = originalBlockquote(token);
    return body.replace('<blockquote>', '<blockquote class="wp-block-quote">');
  };

  // Override image rendering
  renderer.image = function(token: Tokens.Image): string {
    const titleAttr = token.title ? ` title="${token.title}"` : '';
    return `<figure class="wp-block-image"><img src="${token.href}" alt="${token.text}"${titleAttr} /></figure>`;
  };

  // Override list rendering
  const originalList = renderer.list.bind(renderer);
  renderer.list = function(token: Tokens.List): string {
    const body = originalList(token);
    const type = token.ordered ? 'ol' : 'ul';
    return body.replace(`<${type}>`, `<${type} class="wp-block-list">`);
  };

  // Configure marked with custom renderer
  marked.use({
    renderer: renderer,
    gfm: true, // GitHub Flavored Markdown
    breaks: false, // Don't convert \n to <br>
    pedantic: false,
  });

  markedConfigured = true;
}

/**
 * Convert Markdown to WordPress-ready HTML
 * @param markdown - The markdown content to convert
 * @returns Clean HTML ready for WordPress
 */
export async function markdownToWordPressHTML(markdown: string): Promise<string> {
  if (!markdown || typeof markdown !== 'string') {
    logger.warn('Invalid markdown input received');
    return '';
  }

  try {
    // Initialize marked with custom renderer
    await initializeMarked();
    
    // Get marked module and parse
    const { marked } = await getMarked();

    // Convert markdown to HTML
    let html = marked.parse(markdown) as string;

    // Post-processing: Clean up extra whitespace
    html = html
      .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
      .replace(/>\s+</g, '><') // Remove whitespace between tags
      .trim();

    logger.info(`Successfully converted markdown to HTML (${html.length} chars)`);
    return html;
  } catch (error: any) {
    logger.error(`Failed to convert markdown to HTML: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
    throw new Error(`Markdown conversion failed: ${error.message}`);
  }
}

/**
 * Sanitize and clean markdown content before conversion
 * @param markdown - Raw markdown content
 * @returns Cleaned markdown
 */
export function cleanMarkdownContent(markdown: string): string {
  if (!markdown || typeof markdown !== 'string') {
    return '';
  }

  let cleaned = markdown;

  // Remove any potential script injections (just in case)
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove excessive blank lines (more than 3 consecutive)
  cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');

  // Trim leading/trailing whitespace
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Convert markdown to HTML with cleaning
 * @param markdown - Raw markdown content
 * @returns WordPress-ready HTML
 */
export async function convertMarkdownForWordPress(markdown: string): Promise<string> {
  const cleaned = cleanMarkdownContent(markdown);
  return await markdownToWordPressHTML(cleaned);
}
