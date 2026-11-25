import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  RotateCcw,
  Sparkles,
  Trophy,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import PageLoader from "../../components/PageLoader";
import StarCelebration from "../../components/learning/StarCelebration";
import { getAssessmentResult } from "../../lib/learningApi";

const AssessmentResultPage = () => {
  const { attemptId } = useParams();
  const [showReview, setShowReview] = useState(false);

  const { data: attempt, isLoading } = useQuery({
    queryKey: ["assessmentResult", attemptId],
    queryFn: () => getAssessmentResult(attemptId),
    enabled: !!attemptId,
  });

  if (isLoading) return <PageLoader />;

  if (!attempt) {
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-4">
        <h2 className="text-xl font-bold">Result not found</h2>
        <Link to="/learn/dashboard" className="btn btn-primary btn-sm">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const {
    level,
    scorePercentage,
    correctAnswers,
    incorrectAnswers,
    totalQuestions,
    timeTakenSeconds,
    starsEarned,
    isPassed,
    answers = [],
  } = attempt;

  const nextLevel = level === "easy" ? "medium" : level === "medium" ? "hard" : null;

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins}m ${rem}s`;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-8">
      {/* Celebration Header */}
      <div className="card bg-base-200 border border-base-300 shadow-md p-6 sm:p-8">
        <StarCelebration starsEarned={starsEarned} isPassed={isPassed} />

        {/* Big Score Card */}
        <div className="text-center my-4">
          <div className="text-6xl font-black text-primary font-mono tracking-tight">
            {scorePercentage}%
          </div>
          <div className="text-xs uppercase font-bold tracking-widest opacity-60 mt-1">
            Level {level.toUpperCase()} Final Score
          </div>
        </div>

        {/* Metric Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-6">
          <div className="p-3 bg-base-100 rounded-xl text-center border border-base-300">
            <span className="text-xs opacity-60 block">Questions</span>
            <span className="text-lg font-bold font-mono">{totalQuestions}</span>
          </div>

          <div className="p-3 bg-base-100 rounded-xl text-center border border-base-300">
            <span className="text-xs opacity-60 block">Correct</span>
            <span className="text-lg font-bold font-mono text-success">
              {correctAnswers}
            </span>
          </div>

          <div className="p-3 bg-base-100 rounded-xl text-center border border-base-300">
            <span className="text-xs opacity-60 block">Incorrect</span>
            <span className="text-lg font-bold font-mono text-error">
              {incorrectAnswers}
            </span>
          </div>

          <div className="p-3 bg-base-100 rounded-xl text-center border border-base-300">
            <span className="text-xs opacity-60 block">Time Taken</span>
            <span className="text-lg font-bold font-mono flex items-center justify-center gap-1">
              <Clock className="size-3.5 opacity-60" /> {formatTime(timeTakenSeconds)}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 border-t border-base-300">
          <button
            onClick={() => setShowReview(!showReview)}
            className="btn btn-outline btn-md w-full sm:w-auto gap-2"
          >
            <Eye className="size-4" /> {showReview ? "Hide Review" : "Review Answers"}
          </button>

          <Link
            to={`/learn/assessment/${level}`}
            className="btn btn-ghost btn-md w-full sm:w-auto gap-2"
          >
            <RotateCcw className="size-4" /> Retry Test
          </Link>

          {isPassed && nextLevel && (
            <Link
              to={`/learn/assessment/${nextLevel}`}
              className="btn btn-secondary btn-md w-full sm:w-auto gap-2 shadow"
            >
              Continue to {nextLevel.toUpperCase()} <ArrowRight className="size-4" />
            </Link>
          )}

          <Link to="/learn/dashboard" className="btn btn-primary btn-md w-full sm:w-auto shadow">
            Return to Dashboard
          </Link>
        </div>
      </div>

      {/* Answer Review Section */}
      {showReview && (
        <div className="space-y-4 animate-fadeIn">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Eye className="size-5 text-primary" /> Full Question & Answer Review:
          </h2>

          <div className="space-y-3">
            {answers.map((item, idx) => (
              <div
                key={idx}
                className={`card p-5 border rounded-2xl text-left space-y-2.5 ${
                  item.isCorrect
                    ? "border-success/40 bg-success/5"
                    : "border-error/40 bg-error/5"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="font-semibold text-sm">
                    {idx + 1}. {item.questionText}
                  </div>
                  {item.isCorrect ? (
                    <span className="badge badge-success badge-sm gap-1 shrink-0">
                      <CheckCircle2 className="size-3" /> Correct
                    </span>
                  ) : (
                    <span className="badge badge-error badge-sm gap-1 shrink-0">
                      <XCircle className="size-3" /> Incorrect
                    </span>
                  )}
                </div>

                <div className="text-xs space-y-1.5 pt-1">
                  <div>
                    <span className="opacity-60">Your Response: </span>
                    <span className="font-semibold">
                      {Array.isArray(item.userAnswer)
                        ? item.userAnswer.join(" ")
                        : typeof item.userAnswer === "object"
                        ? JSON.stringify(item.userAnswer)
                        : String(item.userAnswer || "No answer")}
                    </span>
                  </div>

                  {!item.isCorrect && (
                    <div>
                      <span className="opacity-60 text-success">Expected Answer: </span>
                      <span className="font-semibold text-success">
                        {Array.isArray(item.correctAnswer)
                          ? item.correctAnswer.join(" ")
                          : typeof item.correctAnswer === "object"
                          ? JSON.stringify(item.correctAnswer)
                          : String(item.correctAnswer)}
                      </span>
                    </div>
                  )}

                  {item.explanation && (
                    <div className="text-xs opacity-75 pt-1.5 border-t border-base-300/40">
                      💡 {item.explanation}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AssessmentResultPage;
