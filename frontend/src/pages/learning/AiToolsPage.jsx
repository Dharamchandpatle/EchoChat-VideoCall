import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, Languages, MessageSquare, Send, SpellCheck, Sparkles } from "lucide-react";
import { createElement, useState } from "react";
import toast from "react-hot-toast";
import { speakText } from "../../lib/speech";
import AiStatusBadge from "../../components/AiStatusBadge";
import { addVocabulary, checkGrammar, explainWord, practiceChat } from "../../lib/learnPlusApi";

const DIFFICULTIES = ["beginner", "intermediate", "advanced"];
const SCENARIOS = ["small talk", "greeting", "market", "restaurant", "travel", "doctor visit", "job interview", "making plans"];

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const Panel = ({ icon, title, description, children }) => (
  <section className="card bg-base-200 border border-base-300 p-4 sm:p-5 space-y-4">
    <header className="flex items-start gap-3">
      <div className="p-2 rounded-lg bg-primary/10 text-primary">{createElement(icon, { className: "size-5", "aria-hidden": "true" })}</div>
      <div>
        <h2 className="font-bold">{title}</h2>
        <p className="text-xs opacity-70">{description}</p>
      </div>
    </header>
    {children}
  </section>
);

// Grammar correction: the sentence is sent for analysis only. Nothing is posted anywhere.
const GrammarPanel = () => {
  const [text, setText] = useState("");
  const mutation = useMutation({
    mutationFn: checkGrammar,
    onError: (e) => toast.error(errorMessage(e, "Grammar check is unavailable right now")),
  });
  const result = mutation.data;

  return (
    <Panel icon={SpellCheck} title="Grammar check" description="Write a sentence in your learning language. You get a correction, an explanation, and a natural alternative.">
      <form
        className="flex flex-col sm:flex-row gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return toast.error("Write a sentence first");
          mutation.mutate(text.trim());
        }}
      >
        <label className="sr-only" htmlFor="grammar-input">Sentence to check</label>
        <input id="grammar-input" className="input input-bordered flex-1" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? <span className="loading loading-spinner loading-sm" /> : "Check"}
        </button>
      </form>
      {result && (
        <div className="space-y-2 text-sm" role="status">
          <p className={result.isCorrect ? "text-success font-semibold" : "text-warning font-semibold"}>
            {result.isCorrect ? "Looks correct." : "Here is a corrected version:"}
          </p>
          <p className="font-medium" lang={result.learningLanguage}>{result.corrected}</p>
          {result.explanation && <p className="opacity-80">{result.explanation}</p>}
          {result.mistakes?.length > 0 && (
            <ul className="list-disc pl-5 space-y-1">
              {result.mistakes.map((m, i) => (
                <li key={i}><span className="line-through opacity-70">{m.original}</span> → <strong>{m.fix}</strong>{m.reason ? ` — ${m.reason}` : ""}</li>
              ))}
            </ul>
          )}
          {result.naturalAlternative && (
            <p><span className="font-semibold">More natural:</span> <span lang={result.learningLanguage}>{result.naturalAlternative}</span></p>
          )}
        </div>
      )}
    </Panel>
  );
};

// Word explainer with save-to-vocabulary.
const WordPanel = () => {
  const queryClient = useQueryClient();
  const [word, setWord] = useState("");
  const mutation = useMutation({
    mutationFn: explainWord,
    onError: (e) => toast.error(errorMessage(e, "Word explanation is unavailable right now")),
  });
  const saveMutation = useMutation({
    mutationFn: (entry) => addVocabulary(entry),
    onSuccess: () => {
      toast.success("Saved to your vocabulary book");
      queryClient.invalidateQueries({ queryKey: ["vocabulary"] });
    },
    onError: (e) => toast.error(errorMessage(e, "Could not save the word")),
  });
  const result = mutation.data;

  return (
    <Panel icon={Languages} title="Word explainer" description="Look up a word for its meaning, usage, and examples. Save it to revisit later.">
      <form
        className="flex flex-col sm:flex-row gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!word.trim()) return toast.error("Enter a word");
          mutation.mutate(word.trim());
        }}
      >
        <label className="sr-only" htmlFor="word-input">Word to explain</label>
        <input id="word-input" className="input input-bordered flex-1" maxLength={120} value={word} onChange={(e) => setWord(e.target.value)} />
        <button className="btn btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? <span className="loading loading-spinner loading-sm" /> : "Explain"}
        </button>
      </form>
      {result && (
        <div className="space-y-2 text-sm" role="status">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-lg" lang={result.learningLanguage}>{result.word}</span>
            {result.partOfSpeech && <span className="badge badge-ghost badge-sm">{result.partOfSpeech}</span>}
            <button className="btn btn-ghost btn-xs" onClick={() => speakText(result.word, result.learningLanguage)}>Listen</button>
          </div>
          <p><span className="font-semibold">Meaning:</span> {result.meaning}</p>
          {result.usage && <p className="opacity-80">{result.usage}</p>}
          {result.examples?.map((ex, i) => (
            <p key={i} className="italic">
              <span lang={result.learningLanguage}>{ex.target}</span>{ex.native ? <span className="not-italic opacity-70"> — {ex.native}</span> : null}
            </p>
          ))}
          <button
            className="btn btn-outline btn-sm gap-1"
            disabled={saveMutation.isPending}
            onClick={() =>
              saveMutation.mutate({
                word: result.word,
                meaning: result.meaning,
                partOfSpeech: result.partOfSpeech,
                example: result.examples?.[0]?.target || "",
                exampleTranslation: result.examples?.[0]?.native || "",
                origin: "ai",
              })
            }
          >
            <BookmarkPlus className="size-4" aria-hidden="true" /> Save to vocabulary
          </button>
        </div>
      )}
    </Panel>
  );
};

// Conversation practice. Turns are kept in local state only and capped by the server.
const PracticePanel = () => {
  const [difficulty, setDifficulty] = useState("beginner");
  const [scenario, setScenario] = useState("small talk");
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState([]);

  const mutation = useMutation({
    mutationFn: (payload) => practiceChat(payload),
    onSuccess: (data) => {
      setTurns((prev) => [...prev, { role: "assistant", text: data.reply, translation: data.translation, tip: data.tip }]);
    },
    onError: (e) => toast.error(errorMessage(e, "The practice partner is unavailable right now")),
  });

  const send = (e) => {
    e.preventDefault();
    const text = message.trim();
    if (!text) return;
    const history = turns.map(({ role, text: t }) => ({ role, text: t }));
    setTurns((prev) => [...prev, { role: "user", text }]);
    setMessage("");
    mutation.mutate({ message: text, history, difficulty, scenario });
  };

  return (
    <Panel icon={MessageSquare} title="Conversation practice" description="Chat with an AI partner in your learning language. Pick a level and a real-life situation.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="form-control">
          <span className="label-text text-xs font-semibold mb-1">Difficulty</span>
          <select className="select select-bordered select-sm" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}
          </select>
        </label>
        <label className="form-control">
          <span className="label-text text-xs font-semibold mb-1">Situation</span>
          <select className="select select-bordered select-sm" value={scenario} onChange={(e) => setScenario(e.target.value)}>
            {SCENARIOS.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </label>
      </div>

      <div className="h-64 overflow-y-auto rounded-lg bg-base-100 border border-base-300 p-3 space-y-2" aria-live="polite">
        {turns.length === 0 && <p className="text-sm opacity-60 text-center mt-16">Say hello to begin.</p>}
        {turns.map((t, i) => (
          <div key={i} className={`chat ${t.role === "user" ? "chat-end" : "chat-start"}`}>
            <div className={`chat-bubble text-sm ${t.role === "user" ? "chat-bubble-primary" : ""}`}>
              <p>{t.text}</p>
              {t.translation && <p className="opacity-70 text-xs mt-1">{t.translation}</p>}
              {t.tip && <p className="text-xs mt-1 italic">Tip: {t.tip}</p>}
            </div>
          </div>
        ))}
        {mutation.isPending && <span className="loading loading-dots loading-sm" role="status" aria-label="Partner is replying" />}
      </div>

      <form onSubmit={send} className="flex gap-2">
        <label className="sr-only" htmlFor="practice-input">Your message</label>
        <input id="practice-input" className="input input-bordered flex-1" maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
        <button className="btn btn-primary gap-1" disabled={mutation.isPending || !message.trim()}>
          <Send className="size-4" aria-hidden="true" /> Send
        </button>
      </form>
      {turns.length > 0 && (
        <button className="btn btn-ghost btn-xs self-start" onClick={() => setTurns([])}>Start over</button>
      )}
    </Panel>
  );
};

const AiToolsPage = () => (
  <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
    <header>
      <h1 className="text-2xl font-extrabold flex items-center gap-2">
        <Sparkles className="size-6 text-primary" aria-hidden="true" /> AI learning tools
      </h1>
      <p className="text-sm opacity-70">Powered by Gemini. AI output can be wrong; check important answers with a teacher.</p>
      <div className="mt-2"><AiStatusBadge /></div>
    </header>
    <GrammarPanel />
    <WordPanel />
    <PracticePanel />
  </div>
);

export default AiToolsPage;
