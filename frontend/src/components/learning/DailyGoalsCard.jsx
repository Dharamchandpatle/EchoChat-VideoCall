import { useQuery } from "@tanstack/react-query";
import { Flame, Target } from "lucide-react";
import { Link } from "react-router";
import { getTodayGoals } from "../../lib/learnPlusApi";

// Today's goals and streak. Uses UTC day boundaries (see the API documentation).
const Meter = ({ label, done, target, met }) => {
  const pct = target === 0 ? 100 : Math.min(100, Math.round((done / target) * 100));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-semibold">{label}</span>
        <span className={met ? "text-success font-semibold" : "opacity-70"}>
          {done}/{target}{met ? " ✓" : ""}
        </span>
      </div>
      <progress className={`progress ${met ? "progress-success" : "progress-primary"} w-full h-2`} value={pct} max="100" aria-label={`${label} progress`} />
    </div>
  );
};

const DailyGoalsCard = () => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dailyGoals"],
    queryFn: getTodayGoals,
    refetchOnWindowFocus: true,
  });

  if (isLoading) return <div className="card bg-base-200 p-4 skeleton h-28" aria-hidden="true" />;
  if (isError) {
    return <div role="alert" className="alert alert-warning text-sm">Today's goals could not be loaded.</div>;
  }

  return (
    <section className="card bg-base-200 border border-base-300 p-4 sm:p-5 space-y-4" aria-labelledby="goals-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="goals-heading" className="font-bold flex items-center gap-2">
          <Target className="size-4 text-primary" aria-hidden="true" /> Today's goals
        </h2>
        <div className="flex items-center gap-2 text-sm">
          <Flame className={`size-4 ${data.streak.current ? "text-warning" : "opacity-40"}`} aria-hidden="true" />
          <span className="font-semibold">{data.streak.current}-day streak</span>
          <span className="opacity-60 text-xs">· best {data.streak.longest}</span>
        </div>
      </div>
      <Meter label="Lessons" done={data.goals.lessons.done} target={data.goals.lessons.target} met={data.goals.lessons.met} />
      <Meter label="Quizzes" done={data.goals.quizzes.done} target={data.goals.quizzes.target} met={data.goals.quizzes.met} />
      {data.reminder && (
        <p role="status" className={`text-sm ${data.streak.atRisk ? "text-warning font-semibold" : "opacity-80"}`}>
          {data.reminder}
        </p>
      )}
      <p className="text-xs opacity-60">
        Goals reset at midnight UTC. <Link to="/learn/progress" className="link link-primary">Change goals and view analytics</Link>
      </p>
    </section>
  );
};

export default DailyGoalsCard;
