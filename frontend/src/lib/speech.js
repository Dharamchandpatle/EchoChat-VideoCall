// Web Speech API wrapper for Indian Language text-to-speech

const LANGUAGE_SPEECH_TAGS = {
  hi: "hi-IN",
  mr: "mr-IN",
  en: "en-IN",
  gu: "gu-IN",
  bn: "bn-IN",
  ta: "ta-IN",
  te: "te-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  pa: "pa-IN",
  ur: "ur-IN",
  sa: "hi-IN", // fallback for Sanskrit
  or: "or-IN",
  as: "as-IN",
};

export const speakText = (text, langCode = "mr", rate = 0.9) => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    console.warn("Speech Synthesis is not supported in this browser.");
    return;
  }

  try {
    window.speechSynthesis.cancel(); // cancel any active speech

    const utterance = new SpeechSynthesisUtterance(text);
    const bcpTag = LANGUAGE_SPEECH_TAGS[langCode.toLowerCase()] || "hi-IN";
    utterance.lang = bcpTag;
    utterance.rate = rate;
    utterance.pitch = 1.0;

    // Try finding matching installed voice
    const voices = window.speechSynthesis.getVoices();
    const matchingVoice = voices.find(
      (v) => v.lang === bcpTag || v.lang.startsWith(langCode.toLowerCase())
    );

    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (error) {
    console.error("Speech synthesis error:", error);
  }
};
