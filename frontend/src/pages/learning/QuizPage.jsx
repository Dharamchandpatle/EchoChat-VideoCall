import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  RotateCcw,
  Sparkles,
  Trophy,
  Volume2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link, useNavigate, useParams } from "react-router";
import PageLoader from "../../components/PageLoader";
import ArrangeWordsQuestion from "../../components/learning/ArrangeWordsQuestion";
import MatchQuestion from "../../components/learning/MatchQuestion";
import { getPracticeQuiz, submitPracticeQuiz } from "../../lib/learningApi";
import { speakText } from "../../lib/speech";

const QuizPage = () => {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({}); // { [questionId]: answerValue }
  const [currentAnswer, setCurrentAnswer] = useState(null);
  const [hasAnsweredCurrent, setHasAnsweredCurrent] = useState(false);
  const [, setImmediateFeedback] = useState(null);
  const [quizCompletedResult, setQuizCompletedResult] = useState(null);
  const [startTime] = useState(Date.now());

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["practiceQuiz", categoryId],
    queryFn: () => getPracticeQuiz(categoryId),
    enabled: !!categoryId,
    refetchOnWindowFocus: false,
  });

  const { mutate: submitQuiz, isPending: isSubmitting } = useMutation({
    mutationFn: submitPracticeQuiz,
    onSuccess: (result) => {
      setQuizCompletedResult(result);
      queryClient.invalidateQueries({ queryKey: ["learningDashboard"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["lesson", categoryId] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || "Failed to submit quiz");
      // Session may be consumed or expired: load a fresh quiz so a retry is valid.
      queryClient.invalidateQueries({ queryKey: ["practiceQuiz", categoryId] });
    },
  });

  if (isLoading) return <PageLoader />;

  const questions = data?.questions || [];
  const currentQ = questions[currentIndex];
  const totalQuestions = questions.length;

  if (totalQuestions === 0) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-4">
        <h2 className="text-xl font-bold">No practice questions available</h2>
        <p className="text-sm opacity-70">
          We are adding more practice questions for this category soon.
        </p>
        <Link to="/learn/dashboard" className="btn btn-primary btn-sm">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  // Answer submission for the current question
  const handleCheckCurrentAnswer = () => {
    if (currentAnswer === null || currentAnswer === undefined) {
      toast.error("Please select or enter an answer first!");
      return;
    }

    const updatedAnswers = {
      ...userAnswers,
      [currentQ._id]: currentAnswer,
    };
    setUserAnswers(updatedAnswers);
    setHasAnsweredCurrent(true);

    // Provide immediate feedback state
    // Note: The official evaluated feedback is computed on the server when finishing,
    // but here we record the user's chosen answer and confirm it has been locked.
    setImmediateFeedback({
      locked: true,
      answer: currentAnswer,
    });
  };

  const handleNext = () => {
    if (currentIndex + 1 < totalQuestions) {
      setCurrentIndex((prev) => prev + 1);
      setCurrentAnswer(userAnswers[questions[currentIndex + 1]?._id] || null);
      setHasAnsweredCurrent(Boolean(userAnswers[questions[currentIndex + 1]?._id]));
      setImmediateFeedback(null);
    } else {
      // Finished all questions -> submit to server
      const payloadAnswers = Object.entries(userAnswers).map(([qId, ans]) => ({
        questionId: qId,
        userAnswer: ans,
      }));

      const timeTaken = Math.round((Date.now() - startTime) / 1000);
      submitQuiz({
        sessionId: data?.sessionId,
        categoryId,
        answers: payloadAnswers,
        timeTakenSeconds: timeTaken,
      });
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setUserAnswers({});
    setCurrentAnswer(null);
    setHasAnsweredCurrent(false);
    setImmediateFeedback(null);
    setQuizCompletedResult(null);
    refetch();
  };

  // Render Result Screen if quiz submitted
  if (quizCompletedResult) {
    const { scorePercentage, correctAnswers, incorrectAnswers, detailedFeedback = [] } =
      quizCompletedResult;

    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-8">
        <div className="card bg-base-200 border border-base-300 p-6 sm:p-8 text-center space-y-4">
          <div className="inline-flex p-3 rounded-2xl bg-primary/20 text-primary mx-auto">
            <Trophy className="size-10" />
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight">Quiz Completed!</h1>
          <p className="text-sm opacity-75">
            Great practice session! Here is your score breakdown:
          </p>

          <div className="text-5xl font-black text-primary font-mono my-2">
            {scorePercentage}%
          </div>

          <div className="flex justify-center gap-6 text-sm">
            <span className="text-success font-semibold flex items-center gap-1">
              <CheckCircle2 className="size-4" /> {correctAnswers} Correct
            </span>
            <span className="text-error font-semibold flex items-center gap-1">
              <XCircle className="size-4" /> {incorrectAnswers} Incorrect
            </span>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row justify-center gap-3">
            <button onClick={handleRestart} className="btn btn-outline gap-2">
              <RotateCcw className="size-4" /> Retry Quiz
            </button>
            <Link to="/learn/dashboard" className="btn btn-primary gap-2">
              Return to Dashboard <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>

        {/* Detailed Answer Review */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold">Answer Breakdown & Explanations:</h2>

          <div className="space-y-3">
            {detailedFeedback.map((fb, idx) => (
              <div
                key={idx}
                className={`card p-4 border rounded-xl text-left space-y-2 ${
                  fb.isCorrect
                    ? "border-success/40 bg-success/5"
                    : "border-error/40 bg-error/5"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-sm">
                    {idx + 1}. {fb.questionText}
                  </div>
                  {fb.isCorrect ? (
                    <span className="badge badge-success badge-sm gap-1">
                      <CheckCircle2 className="size-3" /> Correct
                    </span>
                  ) : (
                    <span className="badge badge-error badge-sm gap-1">
                      <XCircle className="size-3" /> Incorrect
                    </span>
                  )}
                </div>

                <div className="text-xs space-y-1">
                  <div>
                    <span className="opacity-60">Your Answer: </span>
                    <span className="font-semibold">
                      {Array.isArray(fb.userAnswer)
                        ? fb.userAnswer.join(" ")
                        : typeof fb.userAnswer === "object"
                        ? JSON.stringify(fb.userAnswer)
                        : String(fb.userAnswer || "None")}
                    </span>
                  </div>

                  {!fb.isCorrect && (
                    <div>
                      <span className="opacity-60 text-success">Correct Answer: </span>
                      <span className="font-semibold text-success">
                        {Array.isArray(fb.correctAnswer)
                          ? fb.correctAnswer.join(" ")
                          : typeof fb.correctAnswer === "object"
                          ? JSON.stringify(fb.correctAnswer)
                          : String(fb.correctAnswer)}
                      </span>
                    </div>
                  )}

                  {fb.explanation && (
                    <div className="text-xs opacity-75 pt-1 border-t border-base-300/40">
                      💡 {fb.explanation}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Active Question Render
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(`/learn/lesson/${categoryId}`)}
          className="btn btn-ghost btn-sm gap-1"
        >
          <ArrowLeft className="size-4" /> Lesson
        </button>

        <span className="text-xs font-mono font-bold opacity-75">
          Question {currentIndex + 1} of {totalQuestions}
        </span>
      </div>

      {/* Progress Bar */}
      <progress
        className="progress progress-primary w-full h-2.5"
        value={currentIndex + 1}
        max={totalQuestions}
      />

      {/* Question Card */}
      <div className="card bg-base-200 border border-base-300 p-6 space-y-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <span className="badge badge-outline badge-xs uppercase font-mono tracking-wider">
              {currentQ.type.replace("_", " ")}
            </span>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              {currentQ.question}
            </h2>
            {currentQ.prompt && (
              <p className="text-xs opacity-70 italic">{currentQ.prompt}</p>
            )}
          </div>

          {/* Audio button for listen_identify or target audio */}
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
          {/* 1. MATCH THE WORDS */}
          {currentQ.type === "match" && (
            <MatchQuestion
              pairsLeft={currentQ.pairsLeft || []}
              matchRightOptions={currentQ.matchRightOptions || []}
              value={currentAnswer}
              onChange={setCurrentAnswer}
              disabled={hasAnsweredCurrent}
            />
          )}

          {/* 2. ARRANGE WORDS IN CORRECT ORDER */}
          {currentQ.type === "arrange_words" && (
            <ArrangeWordsQuestion
              wordsToArrange={currentQ.wordsToArrange || []}
              value={currentAnswer}
              onChange={setCurrentAnswer}
              disabled={hasAnsweredCurrent}
            />
          )}

          {/* 3. MCQ, TRANSLATE, FILL BLANK, CORRECT SENTENCE, LISTEN IDENTIFY */}
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
                    disabled={hasAnsweredCurrent}
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

        {/* Immediate confirmation feedback if answer locked */}
        {hasAnsweredCurrent && (
          <div className="alert bg-base-100 border border-primary/30 p-3 rounded-xl flex items-center gap-2 text-xs">
            <CheckCircle2 className="size-4 text-primary" />
            <span>Answer locked. Click Next to proceed!</span>
          </div>
        )}

        {/* Actions Bar */}
        <div className="pt-4 border-t border-base-300 flex justify-end gap-3">
          {!hasAnsweredCurrent ? (
            <button
              type="button"
              onClick={handleCheckCurrentAnswer}
              disabled={!currentAnswer}
              className="btn btn-primary btn-md gap-2 shadow"
            >
              Confirm Answer
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              disabled={isSubmitting}
              className="btn btn-primary btn-md gap-2 shadow"
            >
              {currentIndex + 1 < totalQuestions ? (
                <>
                  Next Question <ArrowRight className="size-4" />
                </>
              ) : (
                <>
                  Submit Quiz <Sparkles className="size-4" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuizPage;
