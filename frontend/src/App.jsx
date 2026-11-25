import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AUTH_EXPIRED_EVENT } from "./lib/axios.js";
import { Routes, Route, Navigate } from "react-router-dom";

import HomePage from "./pages/HomePage.jsx";
import CallPage from "./pages/CallPage.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import NotificationsPage from "./pages/NotificationsPage.jsx";
import OnboardingPage from "./pages/OnboardingPage.jsx";
import SignUpPage from "./pages/SignUpPage.jsx";

import LanguageSelectionPage from "./pages/learning/LanguageSelectionPage.jsx";
import LearningDashboardPage from "./pages/learning/LearningDashboardPage.jsx";
import LessonPage from "./pages/learning/LessonPage.jsx";
import QuizPage from "./pages/learning/QuizPage.jsx";
import AssessmentPage from "./pages/learning/AssessmentPage.jsx";
import AssessmentResultPage from "./pages/learning/AssessmentResultPage.jsx";
import LearningProgressPage from "./pages/learning/LearningProgressPage.jsx";
import AdminLearningPage from "./pages/learning/AdminLearningPage.jsx";
import VocabularyPage from "./pages/learning/VocabularyPage.jsx";
import AiToolsPage from "./pages/learning/AiToolsPage.jsx";

import { Toaster } from "react-hot-toast";
import useAuthUser from "./hooks/useAuthUser.js";
import PageLoader from "./components/PageLoader.jsx";
import { useThemeStore } from "./store/useThemeStore.js";
import Layout from "./components/Layout.jsx";

const App = () => {
  const { isLoading, authUser } = useAuthUser();
  const { theme } = useThemeStore();
  const queryClient = useQueryClient();

  // Session expired mid-use: re-check the session so protected routes redirect to login.
  useEffect(() => {
    const onExpired = () => queryClient.invalidateQueries({ queryKey: ["authUser"] });
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [queryClient]);

  useEffect(() => {
    if (theme && typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme]);

  const isAuthenticated = Boolean(authUser);
  const isOnboarded = authUser?.isOnboarded;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-base-100 flex items-center justify-center" data-theme={theme}>
        <PageLoader />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-100 text-base-content" data-theme={theme}>
      <Routes>
        <Route
          path="/"
          element={
            isAuthenticated && isOnboarded ? (
              <Layout showSidebar={true}>
                <HomePage />
              </Layout>
            ) : (
              <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
            )
          }
        />
        <Route
          path="/signup"
          element={
            !isAuthenticated ? <SignUpPage /> : <Navigate to={isOnboarded ? "/" : "/onboarding"} />
          }
        />
        <Route
          path="/login"
          element={
            !isAuthenticated ? <LoginPage /> : <Navigate to={isOnboarded ? "/" : "/onboarding"} />
          }
        />
        <Route
          path="/notifications"
          element={
            isAuthenticated && isOnboarded ? (
              <Layout showSidebar={true}>
                <NotificationsPage />
              </Layout>
            ) : (
              <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
            )
          }
        />
        <Route
          path="/call/:id"
          element={
            isAuthenticated && isOnboarded ? (
              <CallPage />
            ) : (
              <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
            )
          }
        />

        <Route
          path="/chat/:id"
          element={
            isAuthenticated && isOnboarded ? (
              <Layout showSidebar={false}>
                <ChatPage />
              </Layout>
            ) : (
              <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
            )
          }
        />

        {/* Indian Languages Learning Routes */}
        <Route
          path="/learn"
          element={<Navigate to="/learn/dashboard" replace />}
        />

        <Route
          path="/learn/select-language"
          element={
            isAuthenticated && isOnboarded ? (
              <Layout showSidebar={true}>
                <LanguageSelectionPage />
              </Layout>
            ) : (
              <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
            )
          }
        />

        <Route
          path="/learn/dashboard"
          element={
            isAuthenticated && isOnboarded ? (
              <Layout showSidebar={true}>
                <LearningDashboardPage />
              </Layout>
            ) : (
              <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
            )
          }
        />

        <Route
          path="/learn/lesson/:categoryId"
          element={
            isAuthenticated && isOnboarded ? (
              <Layout showSidebar={true}>
                <LessonPage />
              </Layout>
            ) : (
              <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
            )
          }
        />

        <Route
          path="/learn/quiz/:categoryId"
          element={
            isAuthenticated && isOnboarded ? (
              <Layout showSidebar={true}>
                <QuizPage />
              </Layout>
            ) : (
              <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
            )
          }
        />

        <Route
          path="/learn/assessment/:level"
          element={
            isAuthenticated && isOnboarded ? (
              <Layout showSidebar={true}>
                <AssessmentPage />
              </Layout>
            ) : (
              <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
            )
          }
        />

        <Route
          path="/learn/assessment-result/:attemptId"
          element={
            isAuthenticated && isOnboarded ? (
              <Layout showSidebar={true}>
                <AssessmentResultPage />
              </Layout>
            ) : (
              <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
            )
          }
        />

        <Route
          path="/learn/vocabulary"
          element={
            isAuthenticated && isOnboarded ? (
              <Layout showSidebar={true}>
                <VocabularyPage />
              </Layout>
            ) : (
              <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
            )
          }
        />

        <Route
          path="/learn/ai-tools"
          element={
            isAuthenticated && isOnboarded ? (
              <Layout showSidebar={true}>
                <AiToolsPage />
              </Layout>
            ) : (
              <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
            )
          }
        />

        <Route
          path="/learn/progress"
          element={
            isAuthenticated && isOnboarded ? (
              <Layout showSidebar={true}>
                <LearningProgressPage />
              </Layout>
            ) : (
              <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
            )
          }
        />

        <Route
          path="/admin/learning"
          element={
            isAuthenticated && isOnboarded ? (
              <Layout showSidebar={true}>
                <AdminLearningPage />
              </Layout>
            ) : (
              <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
            )
          }
        />

        <Route
          path="/onboarding"
          element={
            isAuthenticated ? (
              !isOnboarded ? (
                <OnboardingPage />
              ) : (
                <Navigate to="/" />
              )
            ) : (
              <Navigate to="/login" />
            )
          }
        />
      </Routes>

      <Toaster />
    </div>
  );
};
export default App;