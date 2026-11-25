import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Clock,
  Lock,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Link, useNavigate, useParams } from "react-router";
import PageLoader from "../../components/PageLoader";
import ArrangeWordsQuestion from "../../components/learning/ArrangeWordsQuestion";
import MatchQuestion from "../../components/learning/MatchQuestion";
import { getLevelAssessment, submitLevelAssessment } from "../../lib/learningApi";
import { speakText } from "../../lib/speech";

const AssessmentPage = () => {
  const { level } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [currentAnswer, setCurrentAnswer] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ["levelAssessment", level],
    queryFn: () => getLevelAssessment(level),
    enabled: !!level,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { mutate: submitAssessment, isPending: isSubmitting } = useMutation({
    mutationFn: submitLevelAssessment,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["learningDashboard"] });
      queryClient.invalidateQueries({ queryKey: ["userLearningProfile"] });
      toast.success("Final assessment submitted and evaluated!");
      navigate(`/learn/assessment-result/${result.attemptId}`);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || "Failed to submit assessment");
      // Session may be consumed or expired: load a fresh assessment so a retry is valid.
      queryClient.invalidateQueries({ queryKey: ["levelAssessment", level] });
    },
  });

  // Timer interval
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (isLoading) return <PageLoader />;

  // Level Locked Guard
  if (error) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-4">
        <div className="p-4 rounded-2xl bg-warning/20 text-warning inline-flex">
          <Lock className="size-12" />
        </div>
        <h2 className="text-2xl font-bold">Level Locked</h2>
        <p className="text-sm opacity-75">
          {error.response?.data?.message ||
            "You must complete the previous level assessment with at least 60% before unlocking this level."}
        </p>
        <Link to="/learn/dashboard" className="btn btn-primary btn-sm">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const questions = data?.questions || [];
  const totalQuestions = questions.length;
  const currentQ = questions[currentIndex];

  if (totalQuestions === 0) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-4">
        <h2 className="text-xl font-bold">No assessment questions available</h2>
        <Link to="/learn/dashboard" className="btn btn-primary btn-sm">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const formatTimer = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs < 10 ? "0" : ""}${remainingSecs}`;
  };

  const handleNext = () => {
    // Record current answer
    const updatedAnswers = {
      ...answers,
      [currentQ._id]: currentAnswer,
    };
    setAnswers(updatedAnswers);

    if (currentIndex + 1 < totalQuestions) {
      setCurrentIndex((prev) => prev + 1);
      setCurrentAnswer(updatedAnswers[questions[currentIndex + 1]?._id] || null);
    } else {
      // Submit assessment
      const formattedAnswers = Object.entries(updatedAnswers).map(([qId, ans]) => ({
        questionId: qId,
        userAnswer: ans,
      }));

      submitAssessment({
        sessionId: data?.sessionId,
        level,
        answers: formattedAnswers,
        timeTakenSeconds: elapsedSeconds,
      });
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      const updatedAnswers = {
        ...answers,
        [currentQ._id]: currentAnswer,
      };
      setAnswers(updatedAnswers);
      setCurrentIndex((prev) => prev - 1);
      setCurrentAnswer(updatedAnswers[questions[currentIndex - 1]?._id] || null);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      {/* Top Banner with Timer & Level Badge */}
      <div className="card bg-base-200 border border-base-300 p-4 flex flex-row items-center justify-between">
        <button
          onClick={() => navigate("/learn/dashboard")}
          className="btn btn-ghost btn-sm gap-1"
        >
          <ArrowLeft className="size-4" /> Exit
        </button>

        <div className="flex items-center gap-3">
          <span className="badge badge-primary font-bold uppercase text-xs">
            {level} Final Test
          </span>

          <div className="flex items-center gap-1.5 text-xs font-mono font-bold bg-base-300 px-3 py-1.5 rounded-lg">
            <Clock className="size-3.5 text-primary" />
            <span>{formatTimer(elapsedSeconds)}</span>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs font-mono opacity-70">
          <span>
            Question {currentIndex + 1} of {totalQuestions}
          </span>
          <span>Passing benchmark: 60%</span>
        </div>
        <progress
          className="progress progress-primary w-full h-2.5"
          value={currentIndex + 1}
          max={totalQuestions}
        />
      </div>

      {/* Question Body */}
      <div className="card bg-base-200 border border-base-300 p-6 space-y-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <span className="badge badge-outline badge-xs uppercase font-mono">
              {currentQ.type.replace("_", " ")}
            </span>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              {currentQ.question}
            </h2>
            {currentQ.prompt && (
              <p className="text-xs opacity-70 italic">{currentQ.prompt}</p>
            )}
          </div>

          {(currentQ.audioText || currentQ.type === "listen_identify") && (
            <button
              type="button"
              onClick={() => speakText(currentQ.audioText || currentQ.question, "mr")}
              className="btn btn-primary btn-circle btn-sm shadow"
              title="Play pronunciation audio"
            >
              <Volume2 className="size-4" />
            </button>
          )}
        </div>

        {/* Input widgets according to question type */}
        <div className="pt-2">
          {currentQ.type === "match" && (
            <MatchQuestion
              pairsLeft={currentQ.pairsLeft || []}
              matchRightOptions={currentQ.matchRightOptions || []}
              value={currentAnswer}
              onChange={setCurrentAnswer}
            />
          )}

          {currentQ.type === "arrange_words" && (
            <ArrangeWordsQuestion
              wordsToArrange={currentQ.wordsToArrange || []}
              value={currentAnswer}
              onChange={setCurrentAnswer}
            />
          )}

          {[
            "mcq",
            "translate",
            "fill_blank",
            "correct_sentence",
            "listen_identify",
          ].includes(currentQ.type) && (
            <div className="space-y-2.5">
              {currentQ.options?.map((option, idx) => {
                const isSelected = currentAnswer === option;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCurrentAnswer(option)}
                    className={`w-full p-4 rounded-xl border text-left font-medium text-sm transition-all flex items-center justify-between ${
                      isSelected
                        ? "border-primary bg-primary/10 ring-2 ring-primary"
                        : "border-base-300 bg-base-100 hover:border-primary/50"
                    }`}
                  >
                    <span>{option}</span>
                    <span className="badge badge-ghost badge-sm">{idx + 1}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="pt-4 border-t border-base-300 flex items-center justify-between">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className="btn btn-outline btn-sm"
          >
            Previous
          </button>

          <button
            type="button"
            onClick={handleNext}
            disabled={isSubmitting || !currentAnswer}
            className="btn btn-primary btn-md gap-2 shadow"
          >
            {currentIndex + 1 < totalQuestions ? (
              <>
                Next Question <ArrowRight className="size-4" />
              </>
            ) : (
              <>
                Submit Final Assessment <Sparkles className="size-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssessmentPage;
