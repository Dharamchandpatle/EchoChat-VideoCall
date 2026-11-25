import { X } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { LANGUAGES } from "../constants";
import useTranslationPreferences from "../hooks/useTranslationPreferences";

const errorText = (error) => error?.response?.data?.message || "Could not save. Please try again.";

// Chat translation settings. Each control saves immediately and independently:
// native and learning languages are profile fields; the translation target and automatic
// translation are per-user viewing preferences. Changing one never overwrites another.
const TranslationSettingsModal = ({ open, onClose }) => {
  const prefs = useTranslationPreferences();
  const [customDraft, setCustomDraft] = useState("");

  if (!open) return null;

  const run = async (action, success) => {
    try {
      await action();
      if (success) toast.success(success);
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const customValue = customDraft || prefs.customTargetLanguage || "English";

  return (
    <div className="modal modal-open" role="dialog" aria-modal="true" aria-labelledby="translation-settings-title">
      <div className="modal-box max-w-lg space-y-5">
        <div className="flex items-center justify-between">
          <h2 id="translation-settings-title" className="text-lg font-bold">
            Translation settings
          </h2>
          <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={onClose} aria-label="Close settings">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <section className="space-y-3" aria-labelledby="lang-heading">
          <h3 id="lang-heading" className="text-sm font-semibold opacity-80">Your languages</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="form-control">
              <span className="label-text text-xs font-medium mb-1">Native language</span>
              <select
                className="select select-bordered select-sm"
                value={prefs.nativeLanguage}
                disabled={prefs.saving}
                onChange={(e) => run(() => prefs.saveLanguages({ nativeLanguage: e.target.value }), "Native language saved")}
              >
                <option value="" disabled>Choose…</option>
                {LANGUAGES.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="form-control">
              <span className="label-text text-xs font-medium mb-1">Learning language</span>
              <select
                className="select select-bordered select-sm"
                value={prefs.learningLanguage}
                disabled={prefs.saving}
                onChange={(e) => run(() => prefs.saveLanguages({ learningLanguage: e.target.value }), "Learning language saved")}
              >
                <option value="" disabled>Choose…</option>
                {LANGUAGES.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="target-heading">
          <h3 id="target-heading" className="text-sm font-semibold opacity-80">Translate messages into</h3>
          <fieldset className="space-y-2">
            <legend className="sr-only">Translation target</legend>
            {[
              { value: "native", label: "My native language", detail: prefs.nativeTarget?.name || "Not set" },
              { value: "learning", label: "My learning language", detail: prefs.learningTarget?.name || "Not set" },
              { value: "custom", label: "Another language", detail: prefs.customTarget?.name || "Pick below" },
            ].map((option) => (
              <label key={option.value} className="flex items-center gap-3 rounded-lg border border-base-300 px-3 py-2 cursor-pointer hover:bg-base-200">
                <input
                  type="radio"
                  name="translation-target"
                  className="radio radio-primary radio-sm"
                  checked={prefs.targetChoice === option.value}
                  disabled={prefs.saving}
                  onChange={() =>
                    run(
                      () =>
                        prefs.savePreferences(
                          option.value === "custom"
                            ? { targetChoice: "custom", customTargetLanguage: customValue }
                            : { targetChoice: option.value }
                        ),
                      `Translating into ${option.label.toLowerCase()}`
                    )
                  }
                />
                <span className="flex-1 text-sm">{option.label}</span>
                <span className="text-xs opacity-70">{option.detail}</span>
              </label>
            ))}
            <label className="form-control">
              <span className="label-text text-xs font-medium mb-1">Another language</span>
              <select
                className="select select-bordered select-sm"
                value={customValue}
                disabled={prefs.saving}
                onChange={(e) => {
                  setCustomDraft(e.target.value);
                  if (prefs.targetChoice === "custom") {
                    run(() => prefs.savePreferences({ customTargetLanguage: e.target.value }), "Translation language saved");
                  }
                }}
              >
                {LANGUAGES.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          </fieldset>
        </section>

        <section className="space-y-3" aria-labelledby="display-heading">
          <h3 id="display-heading" className="text-sm font-semibold opacity-80">Behaviour</h3>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-base-300 px-3 py-2">
            <span className="text-sm">
              Automatic translation
              <span className="block text-xs opacity-70">Translate incoming text messages as they arrive</span>
            </span>
            <input
              type="checkbox"
              className="toggle toggle-primary toggle-sm"
              checked={prefs.autoTranslate}
              disabled={prefs.saving}
              onChange={(e) =>
                run(() => prefs.savePreferences({ autoTranslate: e.target.checked }), e.target.checked ? "Automatic translation on" : "Automatic translation off")
              }
            />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm">Translation display</legend>
            {[
              { value: "inline", label: "Show translation under the message" },
              { value: "compact", label: "Compact (one line, no audio)" },
            ].map((option) => (
              <label key={option.value} className="flex items-center gap-3 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="display-mode"
                  className="radio radio-sm"
                  checked={prefs.displayMode === option.value}
                  disabled={prefs.saving}
                  onChange={() => run(() => prefs.savePreferences({ displayMode: option.value }))}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
        </section>

        <p className="text-xs opacity-60">
          These settings are yours alone. The other person's settings do not change, and your messages are never altered.
        </p>

        <div className="modal-action">
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>Done</button>
        </div>
      </div>
      <button type="button" className="modal-backdrop" aria-label="Close settings" onClick={onClose} />
    </div>
  );
};

export default TranslationSettingsModal;
