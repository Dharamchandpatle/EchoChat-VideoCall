import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Globe, Languages, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router";
import PageLoader from "../../components/PageLoader";
import { getLanguages, getUserSelection, selectLanguagePair } from "../../lib/learningApi";

const LanguageSelectionPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [nativeLanguage, setNativeLanguage] = useState("hi");
  const [targetLanguage, setTargetLanguage] = useState("mr");
  const [step, setStep] = useState("target"); // "native" or "target"
  const [searchQuery, setSearchQuery] = useState("");

  const { data: languages = [], isLoading: loadingLangs } = useQuery({
    queryKey: ["languages"],
    queryFn: getLanguages,
  });

  const { data: userSelection, isLoading: loadingSelection } = useQuery({
    queryKey: ["userSelection"],
    queryFn: getUserSelection,
  });

  useEffect(() => {
    if (userSelection) {
      if (userSelection.nativeLanguage?.code) {
        setNativeLanguage(userSelection.nativeLanguage.code);
      }
      if (userSelection.targetLanguage?.code) {
        setTargetLanguage(userSelection.targetLanguage.code);
      }
    }
  }, [userSelection]);

  const { mutate: saveSelection, isPending: isSaving } = useMutation({
    mutationFn: selectLanguagePair,
    onSuccess: (data) => {
      if (data?.contentAvailable === false) {
        toast("Language pair saved, but no lessons exist for this pair yet. Lessons and quizzes will appear once content is added.", { icon: "ℹ️", duration: 6000 });
      } else {
        toast.success("Language preference updated!");
      }
      queryClient.invalidateQueries({ queryKey: ["learningDashboard"] });
      queryClient.invalidateQueries({ queryKey: ["userSelection"] });
      navigate("/learn/dashboard");
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || "Failed to update language selection");
    },
  });

  const handleConfirm = () => {
    if (nativeLanguage === targetLanguage) {
      toast.error("Native and Target languages cannot be the same!");
      return;
    }
    saveSelection({ nativeLanguage, targetLanguage });
  };

  if (loadingLangs || loadingSelection) return <PageLoader />;

  const filteredLanguages = languages.filter(
    (l) =>
      l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.nativeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.script.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedNativeObj = languages.find((l) => l.code === nativeLanguage);
  const selectedTargetObj = languages.find((l) => l.code === targetLanguage);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
          <Languages className="size-4" /> Learn Indian Languages
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
          Choose Your Language Journey
        </h1>
        <p className="text-sm sm:text-base opacity-75 max-w-xl mx-auto">
          Select the language you already know, and the Indian language you wish to master through
          interactive lessons, quizzes, and gamified level tests.
        </p>
      </div>

      {/* Selected Pair Preview Card */}
      <div className="card bg-base-200 border border-base-300 shadow-sm p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Native Language Box */}
          <div
            onClick={() => setStep("native")}
            className={`flex-1 w-full p-4 rounded-2xl border transition-all cursor-pointer ${
              step === "native"
                ? "border-primary bg-primary/10 ring-2 ring-primary"
                : "border-base-300 bg-base-100 hover:border-primary/50"
            }`}
          >
            <div className="text-xs font-bold opacity-60 uppercase tracking-wider mb-1">
              1. I ALREADY SPEAK (NATIVE)
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xl font-bold">{selectedNativeObj?.name || "Hindi"}</div>
                <div className="text-sm font-semibold opacity-80 text-primary">
                  {selectedNativeObj?.nativeName || "हिन्दी"}
                </div>
              </div>
              <span className="badge badge-primary badge-sm">Click to Change</span>
            </div>
          </div>

          <div className="p-2 bg-base-300 rounded-full text-base-content/70">
            <ArrowRight className="size-5" />
          </div>

          {/* Target Language Box */}
          <div
            onClick={() => setStep("target")}
            className={`flex-1 w-full p-4 rounded-2xl border transition-all cursor-pointer ${
              step === "target"
                ? "border-secondary bg-secondary/10 ring-2 ring-secondary"
                : "border-base-300 bg-base-100 hover:border-secondary/50"
            }`}
          >
            <div className="text-xs font-bold opacity-60 uppercase tracking-wider mb-1">
              2. I WANT TO LEARN (TARGET)
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xl font-bold">{selectedTargetObj?.name || "Marathi"}</div>
                <div className="text-sm font-semibold opacity-80 text-secondary">
                  {selectedTargetObj?.nativeName || "मराठी"}
                </div>
              </div>
              <span className="badge badge-secondary badge-sm">Click to Change</span>
            </div>
          </div>
        </div>

        {/* Warning if same */}
        {nativeLanguage === targetLanguage && (
          <div className="alert alert-warning text-xs mt-4 py-2">
            <span>Please select different languages for Native and Target!</span>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            onClick={handleConfirm}
            disabled={isSaving || nativeLanguage === targetLanguage}
            className="btn btn-primary btn-md sm:btn-wide gap-2 shadow-md"
          >
            <Sparkles className="size-4" /> Start Learning Now
          </button>
        </div>
      </div>

      {/* Language Picker Grid */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Globe className="size-5 text-primary" />
            <h2 className="text-lg font-bold">
              {step === "native"
                ? "Choose the language you already understand:"
                : "Choose the Indian language you want to learn:"}
            </h2>
          </div>
          <input
            type="text"
            placeholder="Search language or script..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input input-bordered input-sm w-full sm:w-64"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
          {filteredLanguages.map((lang) => {
            const isNative = nativeLanguage === lang.code;
            const isTarget = targetLanguage === lang.code;
            const isCurrentStep = step === "native" ? isNative : isTarget;

            return (
              <div
                key={lang.code}
                onClick={() => {
                  if (step === "native") {
                    setNativeLanguage(lang.code);
                    setStep("target"); // automatically advance
                  } else {
                    setTargetLanguage(lang.code);
                  }
                }}
                className={`card p-4 border transition-all cursor-pointer hover:shadow-md ${
                  isCurrentStep
                    ? step === "native"
                      ? "border-primary bg-primary/10 ring-2 ring-primary"
                      : "border-secondary bg-secondary/10 ring-2 ring-secondary"
                    : "border-base-300 bg-base-100 hover:border-primary/40"
                }`}
              >
                <div className="flex items-start justify-between">
                  <span className="badge badge-ghost badge-xs uppercase font-mono tracking-wider">
                    {lang.code}
                  </span>
                  {isCurrentStep && (
                    <CheckCircle2
                      className={`size-4 ${
                        step === "native" ? "text-primary" : "text-secondary"
                      }`}
                    />
                  )}
                </div>

                <div className="mt-2">
                  <div className="text-xl sm:text-2xl font-extrabold text-base-content tracking-tight">
                    {lang.nativeName}
                  </div>
                  <div className="font-semibold text-sm mt-0.5">{lang.name}</div>
                  <div className="text-xs opacity-60 font-mono mt-1">{lang.script} script</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default LanguageSelectionPage;
