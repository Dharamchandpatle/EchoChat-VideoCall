import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Info,
  Sparkles,
  Volume2,
} from "lucide-react";
import toast from "react-hot-toast";
import { Link, useNavigate, useParams } from "react-router";
import PageLoader from "../../components/PageLoader";
import { completeLesson, getLessonDetails } from "../../lib/learningApi";
import { speakText } from "../../lib/speech";

const LessonPage = () => {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["lesson", categoryId],
    queryFn: () => getLessonDetails(categoryId),
    enabled: !!categoryId,
    retry: (count, err) => err?.response?.status !== 404 && count < 2,
  });

  const { mutate: markComplete, isPending: isCompleting } = useMutation({
    mutationFn: completeLesson,
    onSuccess: () => {
      toast.success("Lesson completed! Daily streak updated.");
      queryClient.invalidateQueries({ queryKey: ["lesson", categoryId] });
      queryClient.invalidateQueries({ queryKey: ["learningDashboard"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || "Failed to mark lesson completed");
    },
  });

  if (isLoading) return <PageLoader />;

  if (isError) {
    const noContent = error?.response?.data?.code === "NO_CONTENT_FOR_PAIR";
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-4">
        <div className="card bg-base-200 border border-base-300 p-6 space-y-3 text-center">
          <BookOpen className="size-8 mx-auto opacity-60" aria-hidden="true" />
          <h1 className="text-xl font-bold">{noContent ? "Lesson not available yet" : "Could not load this lesson"}</h1>
          <p className="text-sm opacity-75">
            {noContent
              ? "This topic does not have a lesson for your selected language pair yet. You can switch to a pair that has content."
              : error?.response?.data?.message || "Please try again."}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => navigate("/learn/dashboard")} className="btn btn-ghost btn-sm">
              <ArrowLeft className="size-4" aria-hidden="true" /> Back to Dashboard
            </button>
            {noContent && (
              <Link to="/learn" className="btn btn-primary btn-sm">Change language pair</Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  const { category, lesson, vocabulary = [], userProgress } = data || {};

  const handleSpeak = (text) => {
    speakText(text, lesson?.targetLanguage || "mr");
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/learn/dashboard")}
          className="btn btn-ghost btn-sm gap-1.5"
        >
          <ArrowLeft className="size-4" /> Back to Dashboard
        </button>

        <div className="flex items-center gap-2">
          <span className="badge badge-primary font-bold uppercase text-xs">
            {lesson?.level || "easy"}
          </span>
          {userProgress?.isCompleted && (
            <span className="badge badge-success gap-1 text-xs font-semibold">
              <CheckCircle2 className="size-3.5" /> Completed
            </span>
          )}
        </div>
      </div>

      {/* Hero Header */}
      <div className="card bg-base-200 border border-base-300 p-6 space-y-2">
        <span className="text-xs font-bold uppercase tracking-wider text-primary">
          Topic: {category?.name}
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          {lesson?.title || category?.name}
        </h1>
        <p className="text-sm opacity-75 max-w-3xl">
          {lesson?.description || category?.description}
        </p>
      </div>

      {/* Grammar & Usage Notes Box */}
      {lesson?.grammarNotes && (
        <div className="alert bg-base-100 border border-info/30 shadow-sm flex items-start gap-3 p-4">
          <Info className="size-5 text-info mt-0.5 shrink-0" />
          <div className="text-xs sm:text-sm">
            <span className="font-bold block mb-0.5">Grammar & Cultural Tip:</span>
            <span className="opacity-80 leading-relaxed">{lesson.grammarNotes}</span>
          </div>
        </div>
      )}

      {/* Vocabulary Items List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <BookOpen className="size-4 text-primary" /> Key Vocabulary & Sentences ({vocabulary.length})
          </h2>
          <span className="text-xs opacity-60">Click speaker icon to listen to native audio</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vocabulary.map((vocab, index) => (
            <div
              key={vocab._id || index}
              className="card bg-base-100 border border-base-300 hover:border-primary/50 shadow-sm p-4 space-y-3 transition-all"
            >
              {/* Target & Audio */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-2xl font-bold font-mono text-primary flex items-center gap-2">
                    {vocab.targetText}
                  </div>
                  <div className="text-xs font-semibold tracking-wide text-secondary font-mono mt-0.5">
                    {vocab.romanized}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleSpeak(vocab.targetText)}
                  className="btn btn-circle btn-sm btn-ghost hover:btn-primary hover:text-white"
                  title="Listen to native pronunciation"
                >
                  <Volume2 className="size-4" />
                </button>
              </div>

              {/* Native Meaning */}
              <div className="pt-2 border-t border-base-300/60 flex items-center justify-between text-xs">
                <div>
                  <span className="opacity-60">Meaning: </span>
                  <span className="font-semibold text-base-content text-sm">
                    {vocab.sourceText}
                  </span>
                </div>
                {vocab.partOfSpeech && (
                  <span className="badge badge-ghost badge-xs uppercase font-mono">
                    {vocab.partOfSpeech}
                  </span>
                )}
              </div>

              {/* Example Sentences */}
              {vocab.exampleTarget && (
                <div className="bg-base-200/70 p-2.5 rounded-xl text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-base-content">
                      {vocab.exampleTarget}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSpeak(vocab.exampleTarget)}
                      className="text-primary hover:text-primary-focus ml-2"
                      title="Listen to example sentence"
                    >
                      <Volume2 className="size-3.5" />
                    </button>
                  </div>
                  <div className="opacity-60 italic">{vocab.exampleRomanized}</div>
                  <div className="opacity-80 pt-0.5 border-t border-base-300/50">
                    {vocab.exampleSource}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Sticky Action Footer */}
      <div className="card bg-base-200 border border-base-300 p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-xs sm:text-sm">
          {userProgress?.isCompleted ? (
            <span className="text-success font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="size-4" /> You have completed studying this lesson!
            </span>
          ) : (
            <span className="opacity-75">
              Done reading? Mark as completed to record your learning streak.
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {!userProgress?.isCompleted && (
            <button
              onClick={() => markComplete(lesson._id)}
              disabled={isCompleting}
              className="btn btn-outline btn-sm sm:btn-md flex-1 sm:flex-none gap-2"
            >
              <CheckCircle2 className="size-4 text-success" /> Mark Completed
            </button>
          )}

          <Link
            to={`/learn/quiz/${categoryId}`}
            className="btn btn-primary btn-sm sm:btn-md flex-1 sm:flex-none gap-2 shadow"
          >
            <Sparkles className="size-4" /> Practice Topic Quiz <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LessonPage;
