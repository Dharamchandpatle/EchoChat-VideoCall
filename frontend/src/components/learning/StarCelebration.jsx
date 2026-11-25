import { Sparkles, Star } from "lucide-react";
import { useEffect, useState } from "react";

const StarCelebration = ({ starsEarned = 0, isPassed = false }) => {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimate(true), 150);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center p-6 text-center">
      {/* Animated glowing star cluster */}
      <div className="relative mb-6">
        <div className="flex items-center justify-center gap-2 sm:gap-3">
          {[1, 2, 3, 4, 5].map((index) => {
            const isFilled = index <= starsEarned;
            return (
              <div
                key={index}
                className={`transition-all duration-700 transform ${
                  animate
                    ? "scale-100 opacity-100 rotate-0"
                    : "scale-0 opacity-0 -rotate-45"
                }`}
                style={{ transitionDelay: `${index * 150}ms` }}
              >
                <div
                  className={`p-2 sm:p-3 rounded-2xl ${
                    isFilled
                      ? "bg-amber-400/20 text-amber-500 shadow-lg shadow-amber-500/20"
                      : "bg-base-200 text-base-content/20"
                  }`}
                >
                  <Star
                    className={`size-8 sm:size-12 ${
                      isFilled ? "fill-amber-400 stroke-amber-500 animate-pulse" : "stroke-current"
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {isPassed && (
          <div className="absolute -top-3 -right-3 animate-bounce">
            <span className="badge badge-warning gap-1 p-3 font-semibold shadow">
              <Sparkles className="size-3.5" /> Level Passed!
            </span>
          </div>
        )}
      </div>

      <h2 className="text-3xl font-extrabold tracking-tight">
        {starsEarned === 5
          ? "🌟 Flawless Mastery! (5 Stars)"
          : starsEarned >= 3
          ? "🎉 Outstanding Work! (3 Stars)"
          : starsEarned >= 2
          ? "👍 Level Cleared! (2 Stars)"
          : starsEarned === 1
          ? "⚡ Good Effort! (1 Star)"
          : "Keep Practicing! (0 Stars)"}
      </h2>
      <p className="text-sm opacity-75 mt-1 max-w-md">
        {isPassed
          ? "Congratulations! You have met the benchmark to progress further in your language journey."
          : "You need at least 60% (2 Stars) to unlock the next level. Review the questions and try again!"}
      </p>
    </div>
  );
};

export default StarCelebration;
