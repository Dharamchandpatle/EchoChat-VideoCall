import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Crown,
  Flame,
  GraduationCap,
  Sparkles,
  Star,
  Trophy,
  Zap,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import PageLoader from "../../components/PageLoader";
import { getUserLearningProfile } from "../../lib/learningApi";

const BADGE_ICONS = {
  Award: Award,
  BookOpen: BookOpen,
  Sparkles: Sparkles,
  GraduationCap: GraduationCap,
  Trophy: Trophy,
  Crown: Crown,
  Zap: Zap,
  Star: Star,
  Flame: Flame,
};

const ALL_SYSTEM_BADGES = [
  {
    id: "first_lesson",
    title: "First Step",
    description: "Completed your very first Indian language lesson!",
    icon: "BookOpen",
  },
  {
    id: "lesson_enthusiast",
    title: "Language Enthusiast",
    description: "Completed 5 language lessons!",
    icon: "Sparkles",
  },
  {
    id: "polyglot_scholar",
    title: "Dedicated Scholar",
    description: "Completed all 15 core language topics!",
    icon: "GraduationCap",
  },
  {
    id: "easy_master",
    title: "Easy Explorer",
    description: "Passed Level 1 Easy Final Assessment with 60%+!",
    icon: "Trophy",
  },
  {
    id: "medium_master",
    title: "Fluent Conversationalist",
    description: "Passed Level 2 Medium Assessment with 60%+!",
    icon: "Trophy",
  },
  {
    id: "hard_champion",
    title: "Language Champion",
    description: "Passed Level 3 Hard Assessment with 60%+!",
    icon: "Crown",
  },
  {
    id: "perfect_score",
    title: "Flawless Performance",
    description: "Achieved 100% on a Final Level Assessment!",
    icon: "Zap",
  },
  {
    id: "star_gazer",
    title: "Star Collector",
    description: "Earned 5+ total stars across assessments!",
    icon: "Star",
  },
  {
    id: "master_stargazer",
    title: "Galaxy Achiever",
    description: "Earned 10+ stars in your language journey!",
    icon: "Sparkles",
  },
  {
    id: "streak_starter",
    title: "On Fire",
    description: "Maintained a 3-day active learning streak!",
    icon: "Flame",
  },
];

const LearningProgressPage = () => {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["userLearningProfile"],
    queryFn: getUserLearningProfile,
  });

  if (isLoading) return <PageLoader />;

  const { user, nativeLanguage, targetLanguage, progress, achievements = [], recentAssessments = [] } =
    data || {};

  const unlockedBadgeIds = new Set(achievements.map((a) => a.badgeId));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-8">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/learn/dashboard")}
          className="btn btn-ghost btn-sm gap-1.5"
        >
          <ArrowLeft className="size-4" /> Learning Dashboard
        </button>

        <span className="badge badge-primary font-bold uppercase text-xs">
          Learner Profile
        </span>
      </div>

      {/* User Header Profile Card */}
      <div className="card bg-base-200 border border-base-300 p-6 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="avatar size-16 sm:size-20 rounded-full ring-2 ring-primary">
            <img
              src={user?.profilePic || "https://api.dicebear.com/9.x/avataaars/svg?seed=learn"}
              alt={user?.fullName}
              className="rounded-full"
            />
          </div>

          <div>
            <h1 className="text-2xl font-bold">{user?.fullName}</h1>
            <p className="text-xs opacity-70">
              Native: <span className="font-semibold uppercase">{nativeLanguage}</span> &nbsp;|&nbsp;
              Target: <span className="font-semibold uppercase text-primary">{targetLanguage}</span>
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="badge badge-accent badge-sm font-semibold">
                Current Level: {progress?.currentLevel?.toUpperCase() || "EASY"}
              </span>
              <span className="badge badge-warning badge-sm font-semibold gap-1">
                <Star className="size-3 fill-current" /> {progress?.totalStars || 0} Stars
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="p-3 bg-base-100 rounded-2xl border border-base-300 text-center min-w-24">
            <span className="text-xs opacity-60 block">Current Streak</span>
            <span className="text-2xl font-black text-orange-500 font-mono flex items-center justify-center gap-1">
              <Flame className="size-5 fill-orange-500" /> {progress?.streak?.current || 0}
            </span>
          </div>

          <div className="p-3 bg-base-100 rounded-2xl border border-base-300 text-center min-w-24">
            <span className="text-xs opacity-60 block">Longest Streak</span>
            <span className="text-2xl font-black text-primary font-mono">
              {progress?.streak?.longest || 0} d
            </span>
          </div>
        </div>
      </div>

      {/* Level Best Scores Grid */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Trophy className="size-5 text-primary" /> Level Assessment Records
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {["easy", "medium", "hard"].map((lvl) => {
            const score = progress?.levelBestScores?.[lvl] || 0;
            const stars = progress?.levelStars?.[lvl] || 0;
            const isUnlocked = progress?.unlockedLevels?.includes(lvl);

            return (
              <div
                key={lvl}
                className={`card p-5 border rounded-2xl ${
                  isUnlocked ? "bg-base-200 border-base-300" : "bg-base-200/50 opacity-60 border-base-300/40"
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">{lvl} LEVEL</span>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`size-3 ${
                          s <= stars ? "fill-amber-400 stroke-amber-500" : "stroke-base-content/20"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="text-3xl font-black font-mono text-primary">
                  {score > 0 ? `${score}%` : "0%"}
                </div>
                <div className="text-xs opacity-70 mt-1">
                  {score >= 60 ? "Status: Passed ✅" : isUnlocked ? "Status: Attempt Ready" : "Status: Locked 🔒"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Achievement Badges Showcase */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="size-5 text-amber-500" /> Achievement Badges (
            {achievements.length}/{ALL_SYSTEM_BADGES.length})
          </h2>
          <span className="text-xs opacity-60">Earn stars & complete lessons to unlock</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5">
          {ALL_SYSTEM_BADGES.map((badge) => {
            const isUnlocked = unlockedBadgeIds.has(badge.id);
            const IconComponent = BADGE_ICONS[badge.icon] || Award;

            return (
              <div
                key={badge.id}
                className={`card p-4 border rounded-2xl text-center space-y-2 transition-all ${
                  isUnlocked
                    ? "bg-base-200 border-amber-400/40 shadow-sm"
                    : "bg-base-200/40 border-base-300/40 opacity-40 grayscale"
                }`}
              >
                <div
                  className={`size-12 mx-auto rounded-2xl flex items-center justify-center ${
                    isUnlocked
                      ? "bg-amber-400/20 text-amber-500 shadow-md shadow-amber-500/10"
                      : "bg-base-300 text-base-content/40"
                  }`}
                >
                  <IconComponent className="size-6" />
                </div>

                <h3 className="font-bold text-xs leading-tight">{badge.title}</h3>
                <p className="text-[10px] opacity-70 leading-snug">{badge.description}</p>

                {isUnlocked && (
                  <span className="badge badge-success badge-xs uppercase font-mono tracking-wider">
                    Unlocked
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Assessment Attempts Table */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <GraduationCap className="size-5 text-primary" /> Assessment History
        </h2>

        {recentAssessments.length === 0 ? (
          <div className="card bg-base-200 p-6 text-center text-xs opacity-70">
            No assessment attempts yet. Take a Level Final Assessment from the dashboard!
          </div>
        ) : (
          <div className="overflow-x-auto card bg-base-200 border border-base-300">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Level</th>
                  <th>Score</th>
                  <th>Stars</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentAssessments.map((a) => (
                  <tr key={a._id}>
                    <td className="font-bold uppercase font-mono">{a.level}</td>
                    <td className="font-mono">{a.scorePercentage}%</td>
                    <td>
                      <span className="badge badge-warning badge-sm gap-1">
                        <Star className="size-3 fill-current" /> {a.starsEarned}
                      </span>
                    </td>
                    <td>
                      {a.isPassed ? (
                        <span className="badge badge-success badge-sm">Passed</span>
                      ) : (
                        <span className="badge badge-ghost badge-sm">Try Again</span>
                      )}
                    </td>
                    <td className="text-xs opacity-70">
                      {new Date(a.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      <Link
                        to={`/learn/assessment-result/${a._id}`}
                        className="btn btn-ghost btn-xs text-primary"
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default LearningProgressPage;
