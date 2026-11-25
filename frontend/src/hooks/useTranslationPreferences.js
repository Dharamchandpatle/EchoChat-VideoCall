import { useMutation, useQueryClient } from "@tanstack/react-query";
import useAuthUser from "./useAuthUser";
import { findLanguage } from "../lib/languages";
import { updateLanguageProfile, updateTranslationPreferences } from "../lib/translationApi";

// The viewer's translation settings, derived from the server-stored user document.
// The translation target follows the saved mode (native, learning, or custom), so editing one
// language never overwrites another.
const useTranslationPreferences = () => {
  const { authUser } = useAuthUser();
  const queryClient = useQueryClient();

  const prefs = authUser?.translationPreferences || {};
  const targetChoice = prefs.targetChoice || "native";
  const nativeLanguage = authUser?.nativeLanguage || "";
  const learningLanguage = authUser?.learningLanguage || "";
  const customTargetLanguage = prefs.customTargetLanguage || "";

  const nativeTarget = findLanguage(nativeLanguage);
  const learningTarget = findLanguage(learningLanguage);
  const customTarget = findLanguage(customTargetLanguage);
  const modeTarget = targetChoice === "learning" ? learningTarget : targetChoice === "custom" ? customTarget : nativeTarget;
  const target = modeTarget || findLanguage("English");

  const syncUser = (user) =>
    queryClient.setQueryData(["authUser"], (old) => ({ ...(old || {}), success: true, user }));

  const preferencesMutation = useMutation({
    mutationFn: updateTranslationPreferences,
    onSuccess: (data) => syncUser(data.user),
  });
  const languageMutation = useMutation({
    mutationFn: updateLanguageProfile,
    onSuccess: (data) => syncUser(data.user),
  });

  return {
    isReady: Boolean(authUser),
    targetChoice,
    autoTranslate: Boolean(prefs.autoTranslate),
    displayMode: prefs.displayMode || "inline",
    customTargetLanguage,
    nativeLanguage,
    learningLanguage,
    nativeTarget,
    learningTarget,
    customTarget,
    target, // { name, code } the viewer translates into by default
    savePreferences: preferencesMutation.mutateAsync,
    saveLanguages: languageMutation.mutateAsync,
    saving: preferencesMutation.isPending || languageMutation.isPending,
  };
};

export default useTranslationPreferences;
