import { ChevronDown, Eye, EyeOff, Languages, Volume2 } from "lucide-react";
import { useEffect } from "react";
import { MessageSimple, useMessageContext } from "stream-chat-react";
import useAuthUser from "../hooks/useAuthUser";
import useTranslationPreferences from "../hooks/useTranslationPreferences";
import { TRANSLATION_LANGUAGES } from "../constants";
import { speakText } from "../lib/speech";
import { useChatTranslationStore, translationKey } from "../store/useChatTranslationStore";

// Wraps Stream's MessageSimple. The Stream message is rendered untouched; translations are
// local view state for the current viewer and are never sent as messages.
// The message is read from Stream MessageContext: stream-chat-react renders a custom Message
// component with only groupedByUser as a prop, so props.message is never set.
const VIDEO_INVITE_KIND = "video_call_invite";
const TranslatableMessage = (props) => {
  const { message } = useMessageContext("TranslatableMessage");
  const { authUser } = useAuthUser();
  const prefs = useTranslationPreferences();

  const messageId = message?.id;
  const text = typeof message?.text === "string" ? message.text.trim() : "";
  const isOwn = Boolean(message?.user?.id) && message.user.id === authUser?._id;
  // Only plain text is translated. Attachments, system, and deleted messages are left alone.
  const isVideoInvite =
    message?.extraData?.kind === VIDEO_INVITE_KIND || /\/call\/[\w-]+/.test(text);
  const canTranslate =
    Boolean(messageId && text) &&
    !message?.deleted_at &&
    message?.type !== "system" &&
    message?.type !== "error" &&
    !isVideoInvite;

  // The panel follows the language the viewer last chose for this message (menu or Translate),
  // falling back to the viewer default target.
  const chosenCode = useChatTranslationStore((s) => (messageId ? s.active[messageId] : undefined));
  const targetCode = chosenCode || prefs.target?.code;
  const targetName = (chosenCode && TRANSLATION_LANGUAGES.find((l) => l.code === chosenCode)?.name) || prefs.target?.name;
  const key = messageId && targetCode ? translationKey(messageId, targetCode) : null;
  const entry = useChatTranslationStore((s) => (key ? s.entries[key] : undefined));
  const hidden = useChatTranslationStore((s) => Boolean(messageId && s.hidden[messageId]));
  const translate = useChatTranslationStore((s) => s.translate);
  const setHidden = useChatTranslationStore((s) => s.setHidden);

  // Automatic translation: incoming text only, once per message and target language.
  // A failed automatic attempt leaves an error entry; the viewer retries manually.
  useEffect(() => {
    if (!canTranslate || isOwn || !prefs.autoTranslate || !targetCode || entry) return;
    translate(messageId, text, prefs.target);
  }, [canTranslate, isOwn, prefs.autoTranslate, targetCode, entry, messageId, text, translate, prefs.target]);

  const runTranslation = (target) => {
    if (!target?.code) return;
    translate(messageId, text, target);
    setHidden(messageId, false);
  };

  const toggleOriginal = () => setHidden(messageId, !hidden);

  const alignment = isOwn ? "items-end" : "items-start ml-12 sm:ml-14";
  const isCompact = prefs.displayMode === "compact";

  return (
    <div className="relative group/msg">
      <MessageSimple {...props} />

      {canTranslate && (
        <div className={`flex flex-col gap-1 mb-2 max-w-lg ${alignment} ${isOwn ? "mr-3 sm:mr-4" : ""}`}>
          <div className="flex flex-wrap items-center gap-1 text-[11px]">
            {(!entry || entry.status === "error") && (
              <button
                type="button"
                onClick={() => runTranslation(prefs.target)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                aria-label={entry?.status === "error" ? `Retry translation to ${targetName}` : `Translate message to ${targetName}`}
              >
                <Languages className="size-3" aria-hidden="true" />
                {entry?.status === "error" ? `Retry (${targetName})` : `Translate to ${targetName}`}
              </button>
            )}

            {entry?.status === "done" && (
              <button
                type="button"
                onClick={toggleOriginal}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium opacity-80 hover:opacity-100 hover:text-primary transition"
                aria-expanded={!hidden}
              >
                {hidden ? <Eye className="size-3" aria-hidden="true" /> : <EyeOff className="size-3" aria-hidden="true" />}
                {hidden ? `Show ${targetName}` : "Show original"}
              </button>
            )}

            <details className="dropdown dropdown-end">
              <summary
                className="btn btn-ghost btn-xs h-6 min-h-6 px-1.5 list-none cursor-pointer"
                aria-label="Choose translation language"
              >
                <ChevronDown className="size-3" aria-hidden="true" />
              </summary>
              <ul className="dropdown-content menu menu-xs bg-base-100 rounded-box z-20 w-60 p-2 shadow-lg border border-base-300">
                {prefs.nativeTarget && (
                  <li>
                    <button type="button" onClick={(e) => { runTranslation(prefs.nativeTarget); e.currentTarget.closest("details")?.removeAttribute("open"); }}>
                      Translate to native: {prefs.nativeTarget.name}
                    </button>
                  </li>
                )}
                <li>
                  <button type="button" onClick={(e) => { runTranslation(TRANSLATION_LANGUAGES.find((l) => l.code === "en")); e.currentTarget.closest("details")?.removeAttribute("open"); }}>
                    Translate to English
                  </button>
                </li>
                {prefs.learningTarget && (
                  <li>
                    <button type="button" onClick={(e) => { runTranslation(prefs.learningTarget); e.currentTarget.closest("details")?.removeAttribute("open"); }}>
                      Translate to learning: {prefs.learningTarget.name}
                    </button>
                  </li>
                )}
                <li className="menu-title pt-2">Another language</li>
                <li>
                  <select
                    className="select select-xs w-full"
                    aria-label="Translate to another language"
                    defaultValue=""
                    onChange={(e) => {
                      const chosen = TRANSLATION_LANGUAGES.find((l) => l.code === e.target.value);
                      if (chosen) runTranslation(chosen);
                      e.target.value = "";
                      e.target.closest("details")?.removeAttribute("open");
                    }}
                  >
                    <option value="" disabled>
                      Choose a language…
                    </option>
                    {TRANSLATION_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </li>
              </ul>
            </details>
          </div>

          {entry?.status === "loading" && (
            <div role="status" className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] text-primary bg-primary/10">
              <span className="loading loading-spinner loading-xs" aria-hidden="true" />
              Translating to {targetName}…
            </div>
          )}

          {entry?.status === "error" && (
            <p role="alert" className="text-[11px] text-error">
              {entry.error}
            </p>
          )}

          {entry?.status === "done" && !hidden && (
            <div className="card bg-base-200/90 border border-primary/30 p-2.5 rounded-xl text-xs space-y-1 shadow-sm w-full">
              <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-primary pb-1 border-b border-base-300/60">
                <span className="flex items-center gap-1 min-w-0">
                  <Languages className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {entry.sourceName ? `${entry.sourceName} → ` : ""}
                    {entry.targetName || targetName}
                  </span>
                </span>
                {!isCompact && (
                  <button
                    type="button"
                    onClick={() => speakText(entry.translatedText, targetCode)}
                    className="hover:text-primary-focus p-0.5 rounded transition"
                    aria-label={`Listen to ${entry.targetName || targetName} translation`}
                    title="Listen"
                  >
                    <Volume2 className="size-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
              <p
                lang={targetCode}
                className={`text-sm font-medium text-base-content leading-relaxed ${isCompact ? "truncate" : ""}`}
              >
                {entry.translatedText}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TranslatableMessage;
