import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Animated, StyleSheet, Linking, Keyboard, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { useChat } from '../../store/chatStore';
import { useToast } from '../../store/toastStore';
import { parseChatText } from '../../utils/chatText';
import { openWhatsApp } from '../../utils/whatsapp';
import { PRIVACY_URL } from '../../constants/privacy';
import { ChatMascot } from './ChatMascot';
import type { ChatMessage } from '../../utils/chatProtocol';
import {
  CHAT_NAME,
  CHAT_AI_NOTICE,
  CHAT_MAX_MESSAGE_LENGTH,
  CHAT_WHATSAPP_MESSAGE,
  CHAT_SUGGESTIONS,
  CHAT_SUGGESTIONS_VISIBLE,
  CHAT_SUGGESTIONS_ROTATE_MS,
} from '../../constants/chat';
import { colors, spacing, radius } from '../../theme';

/** Texto del bot: markdown ligero pintado como <Text>, nunca como HTML. Solo los enlaces validados se pueden tocar. */
function BotText({ text }: { text: string }) {
  const segments = parseChatText(text);
  return (
    <Text style={styles.botText}>
      {segments.map((seg, i) => (
        <Text
          key={i}
          style={[seg.bold && styles.bold, seg.url ? styles.link : null]}
          onPress={seg.url ? () => Linking.openURL(seg.url!).catch(() => { }) : undefined}
          accessibilityRole={seg.url ? 'link' : undefined}
        >
          {seg.text}
        </Text>
      ))}
    </Text>
  );
}

function RatingRow({ message }: { message: ChatMessage }) {
  const rate = useChat((s) => s.rate);
  const showToast = useToast((s) => s.show);
  const done = message.rating !== undefined;
  const press = async (value: 1 | -1) => {
    const ok = await rate(message.id, value);
    if (!ok && message.rating === undefined) showToast('No pudimos registrar tu opinión.');
  };
  return (
    <View style={styles.ratingRow}>
      <Pressable
        onPress={() => press(1)}
        disabled={done}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Respuesta útil"
        style={styles.ratingBtn}
      >
        <Ionicons name={message.rating === 1 ? 'thumbs-up' : 'thumbs-up-outline'} size={16} color={done && message.rating !== 1 ? colors.border : colors.textMuted} />
      </Pressable>
      <Pressable
        onPress={() => press(-1)}
        disabled={done}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Respuesta no útil"
        style={styles.ratingBtn}
      >
        <Ionicons name={message.rating === -1 ? 'thumbs-down' : 'thumbs-down-outline'} size={16} color={done && message.rating !== -1 ? colors.border : colors.textMuted} />
      </Pressable>
    </View>
  );
}

/** Tres puntos con rebote escalonado (reemplaza al spinner con texto). Solo visual. */
function TypingDots() {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = dots.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay((2 - i) * 150),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [dots]);
  return (
    <View style={styles.typingDots} accessibilityLabel="escribiendo">
      {dots.map((v, i) => (
        <Animated.View
          key={i}
          style={[
            styles.typingDot,
            { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }), transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }] },
          ]}
        />
      ))}
    </View>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <View style={[styles.bubble, styles.userBubble]}>
        <Text style={styles.userText}>{message.text}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.bubble, styles.botBubble, message.isError && styles.errorBubble]}>
      <BotText text={message.text} />
      {message.isError ? (
        <Pressable style={styles.errorWa} onPress={() => openWhatsApp(CHAT_WHATSAPP_MESSAGE)} accessibilityRole="button">
          <Ionicons name="logo-whatsapp" size={16} color={colors.white} />
          <Text style={styles.errorWaText}>Escríbenos por WhatsApp</Text>
        </Pressable>
      ) : null}
      {message.logId !== undefined && !message.isGreeting && !message.isError ? <RatingRow message={message} /> : null}
    </View>
  );
}

/**
 * Puntos de inicio y fin de un degradado CSS a 135° (linear-gradient(135deg, …)) para una caja
 * w × h: la línea pasa por el centro y mide (w + h)/√2, así las paradas caen igual que en la web
 * aunque la caja no sea cuadrada. Antes de medir la caja, esquina a esquina.
 */
function gradient135({ width: w, height: h }: { width: number; height: number }) {
  if (w <= 0 || h <= 0) return { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } };
  const dx = (w + h) / (4 * w);
  const dy = (w + h) / (4 * h);
  return { start: { x: 0.5 - dx, y: 0.5 - dy }, end: { x: 0.5 + dx, y: 0.5 + dy } };
}

function pickRandom(n: number, from: number[]): number[] {
  const pool = [...from];
  const out: number[] = [];
  while (out.length < n && pool.length > 0) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

/**
 * Sugerencias de inicio: 4 celdas de alto fijo en 2 columnas, elegidas al azar al montarse.
 * Cada CHAT_SUGGESTIONS_ROTATE_MS una celda al azar se desvanece y la reemplaza otra del pool
 * que no esté visible. La rotación se detiene con la app en segundo plano o con `hidden`
 * (teclado abierto). Solo visual: tocar una celda llama a `onPick` con el texto sin emoji.
 */
function Suggestions({ onPick, hidden }: { onPick: (text: string) => void; hidden: boolean }) {
  const [shown, setShown] = useState<number[]>(() =>
    pickRandom(CHAT_SUGGESTIONS_VISIBLE, CHAT_SUGGESTIONS.map((_, i) => i))
  );
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const fades = useRef(shown.map(() => new Animated.Value(1))).current;
  const [active, setActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => setActive(st === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // Al (re)empezar siempre se parte de las 4 celdas a opacidad plena.
    fades.forEach((f) => f.setValue(1));
    if (hidden || !active) return;
    // `alive` invalida los pasos pendientes de este efecto: si se pausa (teclado, segundo plano),
    // se desmonta o se envía el primer mensaje, un callback tardío ya no cambia nada.
    let alive = true;
    let busy = false;
    const timer = setInterval(() => {
      if (busy) return;
      const cell = Math.floor(Math.random() * CHAT_SUGGESTIONS_VISIBLE);
      const free = CHAT_SUGGESTIONS.map((_, i) => i).filter((i) => !shownRef.current.includes(i));
      if (free.length === 0) return;
      const next = free[Math.floor(Math.random() * free.length)];
      busy = true;
      // Sin driver nativo: stop/setValue son síncronos y el valor nunca queda desfasado entre JS y nativo.
      Animated.timing(fades[cell], { toValue: 0, duration: 250, useNativeDriver: false }).start(({ finished }) => {
        if (!alive || !finished) return;
        setShown((cur) => cur.map((v, i) => (i === cell ? next : v)));
        Animated.timing(fades[cell], { toValue: 1, duration: 250, useNativeDriver: false }).start(() => {
          if (alive) busy = false;
        });
      });
    }, CHAT_SUGGESTIONS_ROTATE_MS);
    return () => {
      alive = false;
      clearInterval(timer);
      // Cambio a medias: se revierte (la celda vuelve con su texto original a opacidad plena).
      fades.forEach((f) => {
        f.stopAnimation();
        f.setValue(1);
      });
    };
  }, [hidden, active, fades]);

  return (
    <View style={[styles.suggestions, hidden && { display: 'none' }]}>
      {[0, 1].map((row) => (
        <View key={row} style={styles.suggestionRow}>
          {shown.slice(row * 2, row * 2 + 2).map((idx, k) => {
            const cell = row * 2 + k;
            const sug = CHAT_SUGGESTIONS[idx];
            return (
              <Animated.View key={cell} style={[styles.suggestionCell, { opacity: fades[cell] }]}>
                <Pressable style={styles.suggestionBtn} onPress={() => onPick(sug.text)} accessibilityRole="button" accessibilityLabel={sug.text}>
                  <Text style={styles.suggestionText} numberOfLines={2}>
                    {sug.emoji} {sug.text}
                  </Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/**
 * Chat con IA del Home. El chat vive en el servidor: aquí solo hay interfaz.
 * Bloque de ALTO FIJO (`height`) con su propia lista de mensajes con scroll
 * interno (nestedScrollEnabled), pensado para ir dentro del ScrollView del Home.
 * La conversación vive en memoria (ver store/chatStore.ts).
 */
export function ChatPanel({ height }: { height: number }) {
  const messages = useChat((s) => s.messages);
  const sending = useChat((s) => s.sending);
  const send = useChat((s) => s.send);
  const newConversation = useChat((s) => s.newConversation);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const [kbOpen, setKbOpen] = useState(false);
  const [bandSize, setBandSize] = useState({ width: 0, height: 0 });
  // Las sugerencias solo existen antes del primer mensaje del usuario (tocado o escrito).
  const showSuggestions = !messages.some((m) => m.role === 'user');

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKbOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const submit = () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    send(text);
  };

  const canSend = draft.trim().length > 0 && !sending;

  return (
    <LinearGradient colors={['#1c4eb5', '#2a58bf', '#44d8f1']} locations={[0, 0.4, 1]} {...gradient135(bandSize)} style={styles.band} onLayout={(e) => setBandSize(e.nativeEvent.layout)}>
      <View style={[styles.card, { height }]}>
        <View style={styles.cardClip}>
          <LinearGradient colors={['#00133d', '#123f96']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
            <ChatMascot size={44} source={require('../../../assets/FAVICON-WEB.png')} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{CHAT_NAME}</Text>
              <View style={styles.statusRow}>
                <View style={styles.dot} />
                <Text style={styles.status}>en línea</Text>
              </View>
            </View>
            <Pressable
              onPress={newConversation}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Nueva conversación"
              style={styles.newBtn}
            >
              <Ionicons name="refresh" size={16} color={colors.white} />
              <Text style={styles.newBtnText}>Nuevo chat</Text>
            </Pressable>
          </LinearGradient>

          <ScrollView
            ref={scrollRef}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.map((m) => (
              <Bubble key={m.id} message={m} />
            ))}
            {sending ? (
              <View style={[styles.bubble, styles.botBubble]}>
                <TypingDots />
              </View>
            ) : null}
          </ScrollView>

          {showSuggestions && !sending ? <Suggestions onPick={send} hidden={kbOpen} /> : null}

          <View style={[styles.inputRow, kbOpen && styles.inputRowKb]}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Escribe tu consulta…"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={CHAT_MAX_MESSAGE_LENGTH}
              accessibilityLabel="Mensaje para Boticuy IA Agente"
            />
            <Pressable
              onPress={submit}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Enviar mensaje"
              style={[styles.sendBtn, !canSend && styles.sendBtnOff]}
            >
              <Ionicons name="send" size={18} color={colors.white} />
            </Pressable>
          </View>

          {/* Con el teclado abierto se ocultan las partes secundarias: aviso de IA y franja de WhatsApp. */}
          {kbOpen ? null : (
            <>
            <View style={styles.noticeRow}>
              <Text style={styles.notice}>{CHAT_AI_NOTICE}</Text>
              {PRIVACY_URL ? (
                <Text
                  style={styles.privacy}
                  onPress={() => Linking.openURL(PRIVACY_URL!).catch(() => { })}
                  accessibilityRole="link"
                >
                  Política de privacidad
                </Text>
              ) : null}
            </View>

            {/* WhatsApp: franja al final de la tarjeta (también aparece dentro de los mensajes de error). */}
            <Pressable
              style={styles.waStrip}
              onPress={() => openWhatsApp(CHAT_WHATSAPP_MESSAGE)}
              accessibilityRole="button"
              accessibilityLabel="Escribir por WhatsApp"
            >
              <Ionicons name="logo-whatsapp" size={18} color={colors.success} />
              <Text style={styles.waStripText}>Prefiero hablar por WhatsApp</Text>
            </Pressable>
            </>
          )}
        </View>
      </View>
    </LinearGradient>
  );
}

/** Margen del bloque degradado alrededor de la tarjeta (HomeScreen lo descuenta al acotar el alto con el teclado). */
export const CHAT_BAND_PADDING = spacing.lg;

// Paleta del chat de la web (valores propios del chat, no del tema global).
const chat = {
  navy: '#00133d',
  navyMid: '#123f96',
  cyan: '#44d8f1',
  surface: '#f7f8fc',
  line: '#e8eaf5',
  ink: '#1a1a2e',
  placeholder: '#7f8bb5',
  dots: '#b7bce0',
} as const;

const styles = StyleSheet.create({
  band: { padding: CHAT_BAND_PADDING },
  // La sombra va en la tarjeta; el recorte redondeado en `cardClip` (overflow hidden anularía la sombra en iOS).
  card: {
    backgroundColor: colors.white,
    borderRadius: 28,
    shadowColor: chat.navy,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
  cardClip: { flex: 1, borderRadius: 28, overflow: 'hidden', backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 3,
    borderBottomColor: chat.cyan,
  },
  title: { color: colors.white, fontWeight: '800', fontSize: 15 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.success },
  status: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: radius.pill,
    paddingHorizontal: 12,
  },
  newBtnText: { color: colors.white, fontWeight: '600', fontSize: 13 },
  list: { flex: 1, backgroundColor: chat.surface },
  listContent: { padding: 20, gap: 10 },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  userText: { color: colors.white, fontSize: 14.5, lineHeight: 22 },
  botBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: chat.line,
    borderBottomLeftRadius: 4,
  },
  errorBubble: { borderColor: colors.warning },
  botText: { color: chat.ink, fontSize: 14.5, lineHeight: 22 },
  bold: { fontWeight: '800' },
  link: { color: colors.primary, textDecorationLine: 'underline' },
  typingDots: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 22 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: chat.dots },
  errorWa: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.sm,
    backgroundColor: colors.success,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  errorWaText: { color: colors.white, fontWeight: '700', fontSize: 12 },
  ratingRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  ratingBtn: {
    borderWidth: 1,
    borderColor: chat.line,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    opacity: 0.6,
  },
  // Dos filas explícitas de 2 celdas (flex 1): sin anchos en % ni flexWrap, que podían envolver a una columna en pantallas angostas.
  suggestions: { gap: 6, paddingTop: 8, paddingBottom: 5, paddingHorizontal: 20, backgroundColor: chat.surface },
  suggestionRow: { flexDirection: 'row', gap: 6 },
  suggestionCell: { flex: 1, height: 38 },
  suggestionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: '#eef1fc',
    borderWidth: 1,
    borderColor: '#d7ddf5',
    borderRadius: 14,
  },
  suggestionText: { color: colors.primary, fontWeight: '600', fontSize: 12, lineHeight: 15, textAlign: 'center' },
  inputRowKb: { paddingTop: 8, paddingBottom: 8 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 18,
    backgroundColor: chat.surface,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    paddingVertical: 15,
    paddingHorizontal: 22,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.white,
    color: chat.ink,
    fontSize: 14.5,
    fontWeight: '500',
    textAlignVertical: 'center',
  },
  sendBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnOff: { backgroundColor: colors.textMuted },
  noticeRow: { paddingHorizontal: 20, paddingBottom: 12, backgroundColor: chat.surface },
  notice: { fontSize: 11, color: colors.textMuted },
  privacy: { fontSize: 11, color: colors.primary, textDecorationLine: 'underline', marginTop: 2 },
  waStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 10,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: '#eeeeee',
  },
  waStripText: { color: chat.ink, fontWeight: '600', fontSize: 12 },
});
