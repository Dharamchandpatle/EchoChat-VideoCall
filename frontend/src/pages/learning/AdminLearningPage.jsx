import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Database,
  GraduationCap,
  PlusCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router";
import PageLoader from "../../components/PageLoader";
import useAuthUser from "../../hooks/useAuthUser";
import { claimAdminRole, getAdminStats, triggerAdminSeed } from "../../lib/learningApi";

const AdminLearningPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { authUser } = useAuthUser();

  const [activeTab, setActiveTab] = useState("stats");

  const { data: stats, isLoading, error } = useQuery({
    queryKey: ["adminStats"],
    queryFn: getAdminStats,
    retry: false,
  });

  const { mutate: seedDb, isPending: isSeeding } = useMutation({
    mutationFn: triggerAdminSeed,
    onSuccess: (data) => {
      toast.success(data.message || "Database seeded successfully!");
      queryClient.invalidateQueries({ queryKey: ["adminStats"] });
      queryClient.invalidateQueries({ queryKey: ["languages"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["learningDashboard"] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || "Failed to seed learning content");
    },
  });

  const { mutate: makeMeAdmin, isPending: isClaiming } = useMutation({
    mutationFn: claimAdminRole,
    onSuccess: () => {
      toast.success("Administrator privileges granted!");
      queryClient.invalidateQueries({ queryKey: ["authUser"] });
      queryClient.invalidateQueries({ queryKey: ["adminStats"] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || "Could not claim admin role");
    },
  });

  if (isLoading) return <PageLoader />;

  const isAdmin = authUser?.role === "admin" && !error;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-8">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/learn/dashboard")}
          className="btn btn-ghost btn-sm gap-1.5"
        >
          <ArrowLeft className="size-4" /> Back to Learning
        </button>

        <span className="badge badge-accent font-bold uppercase text-xs gap-1">
          <ShieldCheck className="size-3.5" /> Learning Admin
        </span>
      </div>

      {/* Admin Notice if not admin */}
      {!isAdmin && (
        <div className="alert alert-warning border border-warning/30 p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldAlert className="size-8 shrink-0 text-warning" />
            <div>
              <h3 className="font-bold text-sm">Administrator Access Required</h3>
              <p className="text-xs opacity-80">
                You are currently logged in as a standard user. Click below to grant yourself
                administrator privileges to manage Indian Language courses and curricula.
              </p>
            </div>
          </div>

          <button
            onClick={() => makeMeAdmin()}
            disabled={isClaiming}
            className="btn btn-neutral btn-sm shadow"
          >
            Claim Administrator Role
          </button>
        </div>
      )}

      {/* Header */}
      <div className="card bg-base-200 border border-base-300 p-6 space-y-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <GraduationCap className="size-7 text-primary" /> Indian Languages Curriculum Admin
        </h1>
        <p className="text-xs sm:text-sm opacity-75">
          Manage 21 Indian constitutional languages, 15 learning categories, lesson vocabularies,
          interactive quizzes, and difficulty level assessments.
        </p>
      </div>

      {/* Tabs */}
      <div className="tabs tabs-boxed bg-base-200 p-1 w-fit">
        <button
          onClick={() => setActiveTab("stats")}
          className={`tab tab-sm font-bold ${activeTab === "stats" ? "tab-active" : ""}`}
        >
          Overview & Analytics
        </button>
        <button
          onClick={() => setActiveTab("seeder")}
          className={`tab tab-sm font-bold ${activeTab === "seeder" ? "tab-active" : ""}`}
        >
          Content Seeding & Sync
        </button>
      </div>

      {/* Tab 1: Stats */}
      {activeTab === "stats" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="card bg-base-200 border border-base-300 p-4">
              <span className="text-xs opacity-60 font-bold uppercase">Active Learners</span>
              <div className="text-3xl font-black font-mono text-primary mt-1">
                {stats?.activeLearners || 0}
              </div>
              <span className="text-[11px] opacity-70 mt-1">Total registered: {stats?.totalUsers || 0}</span>
            </div>

            <div className="card bg-base-200 border border-base-300 p-4">
              <span className="text-xs opacity-60 font-bold uppercase">Active Languages</span>
              <div className="text-3xl font-black font-mono text-secondary mt-1">
                {stats?.totalLanguages || 21}
              </div>
              <span className="text-[11px] opacity-70 mt-1">Indian languages</span>
            </div>

            <div className="card bg-base-200 border border-base-300 p-4">
              <span className="text-xs opacity-60 font-bold uppercase">Topic Categories</span>
              <div className="text-3xl font-black font-mono text-accent mt-1">
                {stats?.totalCategories || 15}
              </div>
              <span className="text-[11px] opacity-70 mt-1">3 difficulty levels</span>
            </div>

            <div className="card bg-base-200 border border-base-300 p-4">
              <span className="text-xs opacity-60 font-bold uppercase">Questions Bank</span>
              <div className="text-3xl font-black font-mono text-info mt-1">
                {stats?.totalQuestions || 0}
              </div>
              <span className="text-[11px] opacity-70 mt-1">Quizzes & tests</span>
            </div>
          </div>

          {/* Level Pass Breakdown */}
          <div className="card bg-base-200 border border-base-300 p-5 space-y-4">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <CheckCircle2 className="size-4 text-success" /> Level Assessments Cleared:
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-base-100 rounded-xl border border-base-300">
                <span className="text-xs opacity-60 uppercase font-bold">Easy Level Passes</span>
                <div className="text-2xl font-black font-mono text-success mt-1">
                  {stats?.levelBreakdown?.easy || 0}
                </div>
              </div>

              <div className="p-3 bg-base-100 rounded-xl border border-base-300">
                <span className="text-xs opacity-60 uppercase font-bold">Medium Level Passes</span>
                <div className="text-2xl font-black font-mono text-primary mt-1">
                  {stats?.levelBreakdown?.medium || 0}
                </div>
              </div>

              <div className="p-3 bg-base-100 rounded-xl border border-base-300">
                <span className="text-xs opacity-60 uppercase font-bold">Hard Level Passes</span>
                <div className="text-2xl font-black font-mono text-accent mt-1">
                  {stats?.levelBreakdown?.hard || 0}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Content Seeding & Management */}
      {activeTab === "seeder" && (
        <div className="space-y-6">
          <div className="card bg-base-200 border border-base-300 p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Database className="size-5 text-primary" /> Indian Languages Curriculum Seeder
                </h3>
                <p className="text-xs sm:text-sm opacity-75 mt-1">
                  Sync all 21 Indian languages, 15 structured categories across Easy, Medium, and Hard,
                  rich Hindi ⇄ Marathi lessons, 10 practice quiz questions covering all 7 question types,
                  and official Level Assessments (10 Qs for Easy, 15 Qs for Medium, 20 Qs for Hard).
                </p>
              </div>

              <button
                onClick={() => seedDb()}
                disabled={isSeeding}
                className="btn btn-primary gap-2 shadow shrink-0"
              >
                <RefreshCw className={`size-4 ${isSeeding ? "animate-spin" : ""}`} />
                {isSeeding ? "Seeding Database..." : "Seed Database"}
              </button>
            </div>

            <div className="bg-base-100 p-4 rounded-xl border border-base-300 text-xs space-y-2">
              <div className="font-bold opacity-80">Included in Seed Pipeline:</div>
              <ul className="list-disc list-inside space-y-1 opacity-70">
                <li>21 Indian languages (Hindi, Marathi, Gujarati, Tamil, Telugu, etc.) with scripts</li>
                <li>15 practical learning topics (Greetings, Travel, Food, Conversations, Workplace, etc.)</li>
                <li>Hindi to Marathi vocabulary with native script, Roman pronunciation, and example sentences</li>
                <li>All 7 question types: MCQ, Match, Translate, Fill-in-blanks, Sentence selection, Audio listening, Word ordering</li>
                <li>Level 1 (Easy: 10 Qs), Level 2 (Medium: 15 Qs), and Level 3 (Hard: 20 Qs) Level Tests</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLearningPage;
