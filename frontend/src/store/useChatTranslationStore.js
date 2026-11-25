import { create } from "zustand";
import { translateMessage } from "../lib/translationApi";

// Per-message translation state for the current device.
// Keys combine the message ID and the target language, so switching target languages keeps
// earlier translations and never shows one target's result under another.
// This is view state only: it never changes the Stream message itself.
const keyFor = (messageId, targetCode) => `${messageId}::${targetCode}`;

// One in-flight request per key, so repeated clicks or re-renders share a single call.
const inflight = new Map();

export const useChatTranslationStore = create((set, get) => ({
  entries: {}, // key -> { status: "loading" | "done" | "error", translatedText, sourceName, error }
  hidden: {}, // messageId -> true when the viewer hid the translation panel
  active: {}, // messageId -> target code the viewer last chose for this message (menu or Translate)

  translate: (messageId, text, target) => {
    if (!messageId || !text || !target?.code) return Promise.resolve();
    const key = keyFor(messageId, target.code);

    const existing = get().entries[key];
    if (existing?.status === "done" || existing?.status === "loading") return Promise.resolve();
    if (inflight.has(key)) return inflight.get(key);

    set((state) => ({
      active: { ...state.active, [messageId]: target.code },
      entries: { ...state.entries, [key]: { status: "loading" } },
    }));

    const request = translateMessage({ text, targetLanguage: target.code })
      .then((data) => {
        set((state) => ({
          entries: {
            ...state.entries,
            [key]: {
              status: "done",
              translatedText: data.translatedText,
              sourceName: data.sourceLanguage || data.detectedLanguage || null,
              targetName: data.targetLanguage || target.name,
            },
          },
        }));
      })
      .catch((error) => {
        const message =
          error.response?.data?.error ||
          (error.response?.status === 429
            ? "Too many translation requests. Try again shortly."
            : "Translation unavailable.");
        set((state) => ({
          entries: { ...state.entries, [key]: { status: "error", error: message } },
        }));
      })
      .finally(() => {
        inflight.delete(key);
      });

    inflight.set(key, request);
    return request;
  },

  setHidden: (messageId, hidden) =>
    set((state) => ({ hidden: { ...state.hidden, [messageId]: hidden } })),
}));

export const translationKey = keyFor;
