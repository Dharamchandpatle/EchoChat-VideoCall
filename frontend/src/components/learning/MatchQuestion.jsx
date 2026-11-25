import { Check, X } from "lucide-react";
import { useState } from "react";

const MatchQuestion = ({ pairsLeft = [], matchRightOptions = [], value = {}, onChange, disabled }) => {
  const [selectedLeft, setSelectedLeft] = useState(null);

  // current pairs: { "leftText": "rightText" }
  const pairs = value || {};

  const handleSelectLeft = (leftItem) => {
    if (disabled) return;
    if (pairs[leftItem]) {
      // Remove existing pair if clicked again
      const newPairs = { ...pairs };
      delete newPairs[leftItem];
      onChange(newPairs);
      setSelectedLeft(null);
      return;
    }
    setSelectedLeft(leftItem === selectedLeft ? null : leftItem);
  };

  const handleSelectRight = (rightItem) => {
    if (disabled || !selectedLeft) return;

    // Check if rightItem is already paired with another left item
    const newPairs = { ...pairs };
    Object.keys(newPairs).forEach((k) => {
      if (newPairs[k] === rightItem) delete newPairs[k];
    });

    newPairs[selectedLeft] = rightItem;
    onChange(newPairs);
    setSelectedLeft(null);
  };

  const pairedRights = new Set(Object.values(pairs));

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold opacity-70 uppercase tracking-wider">
        Step 1: Select an item on the left &nbsp;➔&nbsp; Step 2: Select its matching pair on the right
      </p>

      <div className="grid grid-cols-2 gap-4">
        {/* Left Column */}
        <div className="space-y-2.5">
          <span className="text-xs font-bold opacity-60">ORIGINAL TERM</span>
          {pairsLeft.map((leftItem) => {
            const isPaired = Boolean(pairs[leftItem]);
            const isSelected = selectedLeft === leftItem;

            return (
              <button
                key={leftItem}
                type="button"
                disabled={disabled}
                onClick={() => handleSelectLeft(leftItem)}
                className={`w-full p-3.5 rounded-xl border text-left font-medium text-sm transition-all flex items-center justify-between ${
                  isSelected
                    ? "border-primary bg-primary/10 ring-2 ring-primary"
                    : isPaired
                    ? "border-success/40 bg-success/10 text-success-content"
                    : "border-base-300 bg-base-100 hover:border-primary/50"
                }`}
              >
                <span>{leftItem}</span>
                {isPaired && (
                  <span className="badge badge-success badge-sm gap-1">
                    <Check className="size-3" /> Paired
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right Column */}
        <div className="space-y-2.5">
          <span className="text-xs font-bold opacity-60">MATCHING TRANSLATION</span>
          {matchRightOptions.map((rightItem) => {
            const isUsed = pairedRights.has(rightItem);

            return (
              <button
                key={rightItem}
                type="button"
                disabled={disabled}
                onClick={() => handleSelectRight(rightItem)}
                className={`w-full p-3.5 rounded-xl border text-left font-medium text-sm transition-all flex items-center justify-between ${
                  isUsed
                    ? "border-success/40 bg-success/10 text-success-content"
                    : selectedLeft
                    ? "border-primary/60 bg-base-100 hover:bg-primary/5 cursor-pointer"
                    : "border-base-300 bg-base-100 opacity-80"
                }`}
              >
                <span>{rightItem}</span>
                {isUsed && (
                  <span className="badge badge-success badge-sm gap-1">
                    <Check className="size-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Paired summary */}
      {Object.keys(pairs).length > 0 && (
        <div className="p-3 bg-base-200 rounded-xl space-y-1.5 mt-2">
          <div className="text-xs font-bold opacity-70">Current Pairs:</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(pairs).map(([l, r]) => (
              <div
                key={l}
                className="badge badge-outline badge-lg gap-2 bg-base-100 py-3 font-medium"
              >
                <span>{l}</span>
                <span className="opacity-40">➔</span>
                <span className="font-semibold text-primary">{r}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => {
                      const newPairs = { ...pairs };
                      delete newPairs[l];
                      onChange(newPairs);
                    }}
                    className="hover:text-error ml-1"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MatchQuestion;
