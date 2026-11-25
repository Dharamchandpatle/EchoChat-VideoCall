import { RotateCcw } from "lucide-react";

const ArrangeWordsQuestion = ({ wordsToArrange = [], value = [], onChange, disabled }) => {
  const selectedWords = Array.isArray(value) ? value : [];

  // Count occurrences of each word in the original pool vs selected
  const getAvailableCount = (word) => {
    const totalInPool = wordsToArrange.filter((w) => w === word).length;
    const usedCount = selectedWords.filter((w) => w === word).length;
    return totalInPool - usedCount;
  };

  const handleAddWord = (word) => {
    if (disabled) return;
    if (getAvailableCount(word) > 0) {
      onChange([...selectedWords, word]);
    }
  };

  const handleRemoveWordAtIndex = (indexToRemove) => {
    if (disabled) return;
    const updated = selectedWords.filter((_, idx) => idx !== indexToRemove);
    onChange(updated);
  };

  const handleReset = () => {
    if (disabled) return;
    onChange([]);
  };

  return (
    <div className="space-y-5">
      {/* Target Assembled Sentence Bar */}
      <div className="min-h-16 p-4 rounded-2xl border-2 border-dashed border-primary/40 bg-base-100 flex flex-wrap items-center gap-2">
        {selectedWords.length === 0 ? (
          <span className="text-sm opacity-50 italic">
            Tap words below in the correct sequence to construct the sentence...
          </span>
        ) : (
          selectedWords.map((word, index) => (
            <button
              key={`${word}-${index}`}
              type="button"
              disabled={disabled}
              onClick={() => handleRemoveWordAtIndex(index)}
              className="badge badge-primary badge-lg gap-1.5 p-3.5 font-semibold text-sm hover:badge-error transition-all cursor-pointer shadow-sm"
              title="Click to remove"
            >
              <span>{word}</span>
              <span className="text-xs opacity-70">✕</span>
            </button>
          ))
        )}
      </div>

      {/* Available Word Chips Bank */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold opacity-60 uppercase tracking-wider">
            Word Bank (Tap to add)
          </span>
          {selectedWords.length > 0 && !disabled && (
            <button
              type="button"
              onClick={handleReset}
              className="btn btn-ghost btn-xs text-xs gap-1 opacity-70 hover:opacity-100"
            >
              <RotateCcw className="size-3" /> Reset Sequence
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2.5 p-4 bg-base-200/60 rounded-2xl">
          {wordsToArrange.map((word, index) => {
            const available = getAvailableCount(word) > 0;
            return (
              <button
                key={`${word}-${index}`}
                type="button"
                disabled={disabled || !available}
                onClick={() => handleAddWord(word)}
                className={`btn btn-sm sm:btn-md font-semibold text-sm transition-all rounded-xl ${
                  available
                    ? "btn-outline border-base-300 hover:btn-primary shadow-sm"
                    : "btn-disabled opacity-30"
                }`}
              >
                {word}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ArrangeWordsQuestion;
