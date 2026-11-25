import { useQuery } from "@tanstack/react-query";
import {
  Award,
  BookOpen,
  ChevronRight,
  Flame,
  Globe2,
  GraduationCap,
  Lock,
  Sparkles,
  Star,
  Trophy,
  Unlock,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import PageLoader from "../../components/PageLoader";
import DailyGoalsCard from "../../components/learning/DailyGoalsCard";
import { getCategories, getLearningDashboard } from "../../lib/learningApi";

const LearningDashboardPage = () => {
  const [activeLevelTab, setActiveLevelTab] = useState("easy");

  const { data: dashboard, isLoading: loadingDash } = useQuery({
    queryKey: ["learningDashboard"],
    queryFn: getLearningDashboard,
  });

  const { data: categories = [], isLoading: loadingCats } = useQuery({
    queryKey: ["categories", activeLevelTab],
    queryFn: () => getCategories(activeLevelTab),
  });

  if (loadingDash) return <PageLoader />;

  const { nativeLanguage, targetLanguage, progress, levels = [] } = dashboard || {};

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-8">
      {/* Daily goals and learning tools */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <DailyGoalsCard />
        </div>
        <div className="card bg-base-200 border border-base-300 p-4 space-y-2">
          <h2 className="font-bold text-sm">Learning tools</h2>
          <Link to="/learn/vocabulary" className="btn btn-outline btn-sm justify-start">Vocabulary book</Link>
          <Link to="/learn/ai-tools" className="btn btn-outline btn-sm justify-start">AI tutor and grammar check</Link>
          <Link to="/learn/progress" className="btn btn-outline btn-sm justify-start">Progress and analytics</Link>
        </div>
      </div>

      {/* Top Banner: Active Pair & Switch */}
      <div className="card bg-gradient-to-r from-primary/10 via-base-200 to-secondary/10 border border-base-300 shadow-sm p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="badge badge-primary font-bold uppercase text-xs">
                Active Course
              </span>
              <span className="text-xs opacity-70">
                {nativeLanguage?.name} ➔ {targetLanguage?.name}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold flex items-center gap-2">
              <span>Learning</span>
              <span className="text-primary font-mono">{targetLanguage?.nativeName}</span>
              <span className="text-base font-normal opacity-75">
                ({targetLanguage?.name})
              </span>
            </h1>
            <p className="text-xs sm:text-sm opacity-75">
              Explaining concepts in {nativeLanguage?.nativeName} ({nativeLanguage?.name})
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link to="/learn/select-language" className="btn btn-outline btn-sm gap-2">
              <Globe2 className="size-4" /> Change Language
            </Link>
            <Link to="/learn/progress" className="btn btn-primary btn-sm gap-1.5 shadow">
              <Trophy className="size-4" /> My Progress
            </Link>
          </div>
        </div>
      </div>

      {/* Gamified Stat Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 sm:gap-4">
        {/* Total Stars */}
        <div className="card bg-base-200 border border-base-300 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold opacity-60 uppercase">Total Stars</span>
            <div className="p-2 rounded-xl bg-amber-400/20 text-amber-500">
              <Star className="size-5 fill-amber-400 stroke-amber-500" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black mt-2 text-amber-500 flex items-baseline gap-1">
            {progress?.totalStars || 0}
            <span className="text-xs opacity-60 font-normal">/ 15</span>
          </div>
          <div className="text-xs opacity-70 mt-1">Level tests best rewards</div>
        </div>

        {/* Learning Streak */}
        <div className="card bg-base-200 border border-base-300 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold opacity-60 uppercase">Daily Streak</span>
            <div className="p-2 rounded-xl bg-orange-500/20 text-orange-500">
              <Flame className="size-5 fill-orange-500" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black mt-2 text-orange-500 flex items-baseline gap-1">
            {progress?.streak?.current || 0}
            <span className="text-xs opacity-60 font-normal">days</span>
          </div>
          <div className="text-xs opacity-70 mt-1">
            Best streak: {progress?.streak?.longest || 0} days
          </div>
        </div>

        {/* Lessons Completed */}
        <div className="card bg-base-200 border border-base-300 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold opacity-60 uppercase">Lessons Studied</span>
            <div className="p-2 rounded-xl bg-primary/20 text-primary">
              <BookOpen className="size-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black mt-2 text-primary flex items-baseline gap-1">
            {progress?.completedLessonsCount || 0}
            <span className="text-xs opacity-60 font-normal">
              / {progress?.totalLessonsCount || 15}
            </span>
          </div>
          <div className="text-xs opacity-70 mt-1">Practical topics completed</div>
        </div>

        {/* Quizzes Completed */}
        <div className="card bg-base-200 border border-base-300 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold opacity-60 uppercase">Quiz Mastery</span>
            <div className="p-2 rounded-xl bg-secondary/20 text-secondary">
              <GraduationCap className="size-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black mt-2 text-secondary flex items-baseline gap-1">
            {progress?.quizPercentage || 0}%
          </div>
          <div className="text-xs opacity-70 mt-1">Topic quiz completion</div>
        </div>
      </div>

      {/* Overall Progress Bar */}
      <div className="card bg-base-200 border border-base-300 p-5 space-y-2">
        <div className="flex justify-between items-center text-sm font-bold">
          <span className="flex items-center gap-1.5">
            <Sparkles className="size-4 text-primary" /> Overall Learning Journey Progress
          </span>
          <span className="text-primary font-mono">{progress?.overallProgress || 0}%</span>
        </div>
        <progress
          className="progress progress-primary w-full h-3"
          value={progress?.overallProgress || 0}
          max="100"
        />
        <div className="text-xs opacity-60 flex justify-between">
          <span>Level 1: Easy</span>
          <span>Level 2: Medium</span>
          <span>Level 3: Hard</span>
        </div>
      </div>

      {/* 3 Difficulty Levels Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Difficulty Levels & Assessments</h2>
          <p className="text-xs sm:text-sm opacity-70">
            Progress through Easy, Medium, and Hard. Score at least 60% on each final assessment
            to unlock the next level and earn up to 5 stars!
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {levels.map((lvl) => {
            const isUnlocked = lvl.isUnlocked;
            const stars = lvl.starsEarned || 0;

            return (
              <div
                key={lvl.id}
                className={`card border transition-all shadow-sm ${
                  isUnlocked
                    ? "bg-base-200 border-base-300 hover:border-primary/50"
                    : "bg-base-200/50 border-base-300/40 opacity-75"
                }`}
              >
                <div className="card-body p-5 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isUnlocked ? (
                          <span className="badge badge-success badge-sm gap-1">
                            <Unlock className="size-3" /> Unlocked
                          </span>
                        ) : (
                          <span className="badge badge-neutral badge-sm gap-1">
                            <Lock className="size-3" /> Locked
                          </span>
                        )}
                        {lvl.isCompleted && (
                          <span className="badge badge-primary badge-sm">Cleared</span>
                        )}
                      </div>

                      {/* Stars Display */}
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`size-3.5 ${
                              s <= stars
                                ? "fill-amber-400 stroke-amber-500"
                                : "stroke-base-content/20"
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    <h3 className="text-lg font-bold">{lvl.name}</h3>
                    <p className="text-xs opacity-75">{lvl.description}</p>

                    {!isUnlocked && lvl.unlockRequirement && (
                      <div className="text-xs text-warning bg-warning/10 p-2 rounded-lg font-medium">
                        🔒 {lvl.unlockRequirement}
                      </div>
                    )}
                  </div>

                  {/* Best score & Test Actions */}
                  <div className="pt-2 border-t border-base-300/60 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="opacity-70">Best Assessment Score:</span>
                      <span className="font-bold font-mono">
                        {lvl.bestScore ? `${lvl.bestScore}%` : "Not attempted"}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setActiveLevelTab(lvl.id)}
                        className={`btn btn-sm flex-1 ${
                          activeLevelTab === lvl.id ? "btn-primary" : "btn-outline"
                        }`}
                      >
                        Lessons
                      </button>

                      <Link
                        to={`/learn/assessment/${lvl.id}`}
                        className={`btn btn-sm flex-1 ${
                          !isUnlocked ? "btn-disabled" : "btn-accent"
                        }`}
                      >
                        Final Test ({lvl.questionsCount} Qs)
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Practical Category Topics Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight">
              Learning Topics ({activeLevelTab.toUpperCase()} Level)
            </h2>
            <p className="text-xs sm:text-sm opacity-70">
              Select a practical category to learn vocabulary, audio pronunciations, and take quizzes.
            </p>
          </div>

          <div className="tabs tabs-boxed bg-base-300/60 p-1">
            {["easy", "medium", "hard"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveLevelTab(tab)}
                className={`tab tab-sm font-semibold uppercase ${
                  activeLevelTab === tab ? "tab-active font-bold" : ""
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {loadingCats ? (
          <div className="flex justify-center py-8">
            <span className="loading loading-spinner loading-md text-primary" />
          </div>
        ) : categories.length === 0 ? (
          <div className="card bg-base-200 p-8 text-center text-sm opacity-70">
            No topics found for this level yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((cat) => (
              <div
                key={cat._id}
                className="card bg-base-200 border border-base-300 hover:shadow-md transition-all p-5 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="badge badge-outline badge-xs uppercase font-mono">
                      Topic #{cat.order}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {cat.isCompleted && (
                        <span className="badge badge-success badge-sm">Studied</span>
                      )}
                      {cat.quizCompleted && (
                        <span className="badge badge-primary badge-sm">
                          Quiz: {cat.quizBestScore}%
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-base-content">{cat.name}</h3>
                  <p className="text-xs opacity-75 line-clamp-2">{cat.description}</p>
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <Link
                    to={`/learn/lesson/${cat._id}`}
                    className="btn btn-primary btn-sm flex-1 gap-1"
                  >
                    <BookOpen className="size-3.5" /> Study Lesson
                  </Link>
                  <Link
                    to={`/learn/quiz/${cat._id}`}
                    className="btn btn-outline btn-sm flex-1 gap-1"
                  >
                    Practice Quiz <ChevronRight className="size-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LearningDashboardPage;
