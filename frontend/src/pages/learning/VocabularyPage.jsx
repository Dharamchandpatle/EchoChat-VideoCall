import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, Circle, RotateCcw, Trash2, Volume2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router";
import PageLoader from "../../components/PageLoader";
import { speakText } from "../../lib/speech";
import { addVocabulary, deleteVocabulary, listVocabulary, reviewVocabulary, updateVocabulary } from "../../lib/learnPlusApi";

const TABS = [
  { id: "all", label: "All words", params: {} },
  { id: "new", label: "Still learning", params: { learned: false } },
  { id: "learned", label: "Learned", params: { learned: true } },
  { id: "review", label: "Review", params: { mode: "review" } },
];

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const VocabularyPage = () => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState({ word: "", meaning: "", example: "" });
  const selected = TABS.find((t) => t.id === tab);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["vocabulary", tab, page],
    queryFn: () => listVocabulary({ ...selected.params, page, limit: 20 }),
    placeholderData: keepPreviousData,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["vocabulary"] });

  const addMutation = useMutation({
    mutationFn: addVocabulary,
    onSuccess: () => {
      toast.success("Word saved to your vocabulary book");
      setDraft({ word: "", meaning: "", example: "" });
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e, "Could not save the word")),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, body }) => updateVocabulary(id, body),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e, "Could not update the word")),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteVocabulary,
    onSuccess: () => {
      toast.success("Word removed");
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e, "Could not remove the word")),
  });
  const reviewMutation = useMutation({
    mutationFn: reviewVocabulary,
    onSuccess: refresh,
  });

  const submitDraft = (e) => {
    e.preventDefault();
    if (!draft.word.trim()) {
      toast.error("Enter a word to save");
      return;
    }
    addMutation.mutate({ ...draft, origin: "manual" });
  };

  const words = data?.items ?? [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <BookOpen className="size-6 text-primary" aria-hidden="true" /> Vocabulary book
          </h1>
          <p className="text-sm opacity-70">Words you have saved, with meanings and examples.</p>
        </div>
        <Link to="/learn/ai-tools" className="btn btn-outline btn-sm">AI word explainer</Link>
      </header>

      <form onSubmit={submitDraft} className="card bg-base-200 p-4 grid grid-cols-1 sm:grid-cols-3 gap-3" aria-label="Add a word">
        <label className="form-control">
          <span className="label-text text-xs font-semibold mb-1">Word</span>
          <input
            className="input input-bordered input-sm"
            value={draft.word}
            maxLength={120}
            onChange={(e) => setDraft({ ...draft, word: e.target.value })}
            required
          />
        </label>
        <label className="form-control">
          <span className="label-text text-xs font-semibold mb-1">Meaning</span>
          <input
            className="input input-bordered input-sm"
            value={draft.meaning}
            maxLength={500}
            onChange={(e) => setDraft({ ...draft, meaning: e.target.value })}
          />
        </label>
        <div className="flex items-end gap-2">
          <label className="form-control flex-1">
            <span className="label-text text-xs font-semibold mb-1">Example</span>
            <input
              className="input input-bordered input-sm"
              value={draft.example}
              maxLength={500}
              onChange={(e) => setDraft({ ...draft, example: e.target.value })}
            />
          </label>
          <button type="submit" className="btn btn-primary btn-sm" disabled={addMutation.isPending}>
            Save word
          </button>
        </div>
      </form>

      <div role="tablist" className="tabs tabs-boxed tabs-sm flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? "tab-active" : ""}`}
            onClick={() => {
              setTab(t.id);
              setPage(1);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <PageLoader />
      ) : isError ? (
        <div role="alert" className="alert alert-error">
          <span>Could not load your vocabulary.</span>
          <button className="btn btn-sm" onClick={() => refetch()}>Try again</button>
        </div>
      ) : words.length === 0 ? (
        <div className="card bg-base-200 p-8 text-center space-y-2">
          <p className="font-semibold">No words here yet</p>
          <p className="text-sm opacity-70">Save words from your lessons or the AI word explainer to build your book.</p>
        </div>
      ) : (
        <ul className="space-y-3" aria-live="polite">
          {words.map((w) => (
            <li key={w._id} className="card bg-base-200 p-4 flex flex-col sm:flex-row sm:items-start gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-lg" lang={w.targetLanguage}>{w.word}</span>
                  {w.partOfSpeech && <span className="badge badge-ghost badge-sm">{w.partOfSpeech}</span>}
                  {w.learned && <span className="badge badge-success badge-sm">learned</span>}
                </div>
                {w.meaning && <p className="text-sm">{w.meaning}</p>}
                {w.example && (
                  <p className="text-sm opacity-80 italic" lang={w.targetLanguage}>
                    “{w.example}”{w.exampleTranslation ? <span className="not-italic opacity-70"> — {w.exampleTranslation}</span> : null}
                  </p>
                )}
                <p className="text-xs opacity-60">Reviewed {w.reviewCount} time{w.reviewCount === 1 ? "" : "s"}</p>
              </div>
              <div className="flex flex-wrap gap-1 sm:flex-col">
                <button className="btn btn-ghost btn-xs gap-1" onClick={() => speakText(w.word, w.targetLanguage)} aria-label={`Listen to ${w.word}`}>
                  <Volume2 className="size-3.5" aria-hidden="true" /> Listen
                </button>
                {w.example && (
                  <button className="btn btn-ghost btn-xs gap-1" onClick={() => speakText(w.example, w.targetLanguage)} aria-label={`Listen to example for ${w.word}`}>
                    <Volume2 className="size-3.5" aria-hidden="true" /> Example
                  </button>
                )}
                <button
                  className="btn btn-ghost btn-xs gap-1"
                  onClick={() => updateMutation.mutate({ id: w._id, body: { learned: !w.learned } })}
                  aria-label={w.learned ? `Mark ${w.word} as still learning` : `Mark ${w.word} as learned`}
                >
                  {w.learned ? <Circle className="size-3.5" aria-hidden="true" /> : <CheckCircle2 className="size-3.5" aria-hidden="true" />}
                  {w.learned ? "Still learning" : "Learned"}
                </button>
                <button className="btn btn-ghost btn-xs gap-1" onClick={() => reviewMutation.mutate(w._id)} aria-label={`Record review of ${w.word}`}>
                  <RotateCcw className="size-3.5" aria-hidden="true" /> Reviewed
                </button>
                <button
                  className="btn btn-ghost btn-xs text-error gap-1"
                  onClick={() => {
                    if (window.confirm(`Remove “${w.word}” from your vocabulary book?`)) deleteMutation.mutate(w._id);
                  }}
                  aria-label={`Remove ${w.word}`}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" /> Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data && (data.page > 1 || data.hasMore) && (
        <nav className="flex justify-center gap-2" aria-label="Vocabulary pages">
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="btn btn-sm btn-ghost no-animation">Page {page}</span>
          <button className="btn btn-sm" disabled={!data.hasMore} onClick={() => setPage((p) => p + 1)}>Next</button>
        </nav>
      )}
    </div>
  );
};

export default VocabularyPage;
