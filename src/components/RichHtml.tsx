import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '../theme';
import { decodeHtmlEntities } from '../utils/format';

/**
 * Renderizador ligero para el HTML simple que viene del CMS de Boticuy
 * (campos JetEngine: <p>, <ul>/<ol>/<li>, <strong>/<b>, <a>, <br>).
 * No usa dependencias externas: el contenido es controlado y consistente.
 */

const decode = decodeHtmlEntities;

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

interface Part {
  text: string;
  bold: boolean;
}

function inlineParts(html: string): Part[] {
  let s = html.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1'); // links → su texto
  s = s.replace(/<br\s*\/?>/gi, '\n');
  const parts: Part[] = [];
  const re = /<(strong|b)>([\s\S]*?)<\/\1>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push({ text: decode(stripTags(s.slice(last, m.index))), bold: false });
    parts.push({ text: decode(stripTags(m[2])), bold: true });
    last = re.lastIndex;
  }
  if (last < s.length) parts.push({ text: decode(stripTags(s.slice(last))), bold: false });
  return parts.filter((p) => p.text.replace(/\s+/g, ' ').trim().length > 0);
}

function Inline({ html, style }: { html: string; style?: any }) {
  const parts = inlineParts(html);
  return (
    <Text style={style}>
      {parts.map((p, i) => (
        <Text key={i} style={p.bold ? styles.bold : undefined}>
          {p.text}
        </Text>
      ))}
    </Text>
  );
}

interface Block {
  type: 'p' | 'ul' | 'ol';
  content?: string;
  items?: string[];
}

function parseBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  const re = /<(ul|ol)>([\s\S]*?)<\/\1>|<p>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1]) {
      const items = [...m[2].matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((li) => li[1]);
      blocks.push({ type: m[1].toLowerCase() as 'ul' | 'ol', items });
    } else if (m[3] !== undefined) {
      blocks.push({ type: 'p', content: m[3] });
    }
  }
  // Si no había bloques reconocidos, tratar todo como un párrafo.
  if (blocks.length === 0 && stripTags(html).trim()) {
    blocks.push({ type: 'p', content: html });
  }
  return blocks;
}

export function RichHtml({ html }: { html: string }) {
  if (!html || !stripTags(html).trim()) return null;
  const blocks = parseBlocks(html);
  return (
    <View style={styles.container}>
      {blocks.map((b, i) => {
        if (b.type === 'p') {
          return <Inline key={i} html={b.content ?? ''} style={styles.paragraph} />;
        }
        return (
          <View key={i} style={styles.list}>
            {(b.items ?? []).map((li, j) => (
              <View key={j} style={styles.li}>
                <Text style={styles.bullet}>{b.type === 'ol' ? `${j + 1}.` : '•'}</Text>
                <Inline html={li} style={styles.liText} />
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  paragraph: { fontSize: 14, lineHeight: 21, color: colors.text },
  bold: { fontWeight: '700' },
  list: { gap: 6 },
  li: { flexDirection: 'row', gap: 8, paddingRight: spacing.sm },
  bullet: { color: colors.primary, fontSize: 14, lineHeight: 21, fontWeight: '700', minWidth: 16 },
  liText: { flex: 1, fontSize: 14, lineHeight: 21, color: colors.text },
});
