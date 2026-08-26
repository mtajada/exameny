import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Analytics } from "@vercel/analytics/react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import AppLayout from './components/layout/AppLayout';
import { AcademyLayout } from './components/layout/AcademyLayout';
import LandingPage from './pages/LandingPage';
import DashboardPage from "./pages/DashboardPage";
import EditorPage from './pages/EditorPage';
import ProfilePage from './pages/ProfilePage';
import AssignTaskPage from "./pages/AssignTaskPage";
import CreatePrintExercisePage from './pages/CreatePrintExercisePage';
import StudentDetailsPage from "./pages/StudentDetailsPage";
import AuthPage from "./pages/AuthPage";
import NotFound from "./pages/NotFound";
import ProfileSetupPage from './pages/ProfileSetupPage';
import SelectAiTaskTypePage from './pages/SelectAiTaskTypePage';
import GenerateAiPromptPage from './pages/GenerateAiPromptPage';
import EvaluationResultPage from './pages/EvaluationResultPage';
import ProgressPage from "./pages/ProgressPage";
import MyTasksPage from './pages/MyTasksPage';
import AcademyDashboardPage from './pages/AcademyDashboardPage';
import RuoEPracticePage from './pages/RuoEPracticePage';
import GenerateRuoEExercisePage from './pages/GenerateRuoEExercisePage';


import MistakesAnalysisPreviewPage from './pages/dev/MistakesAnalysisPreviewPage';
import AuthFlowsPreviewPage from './pages/dev/AuthFlowsPreviewPage';
import TestHarnessPage from './pages/TestHarnessPage';
import DemoPage from './pages/DemoPage';
import RoleWorkflowsDemoPage from './pages/RoleWorkflowsDemoPage';
import SpeakingPracticePage from './pages/SpeakingPracticePage';
import SpeakingSessionPage from './pages/SpeakingSessionPage';

import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/contexts/useAuth";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { AcademyAdminRoute } from "./components/auth/AcademyAdminRoute";
import { PlatformAdminRoute } from "./components/auth/PlatformAdminRoute";
import PlatformConsolePage from "./pages/PlatformConsolePage";
import { AuthGateLoadingCard } from "@/components/auth/AuthGateLoadingCard";
import { LearnerSpeakingRoute } from '@/features/speaking/LearnerSpeakingRoute';

const queryClient = new QueryClient();
const analyticsEnabled = import.meta.env.VITE_ENABLE_ANALYTICS === 'true';

function AuthenticatedBoundary() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

function RootRoute() {
  const { user, isLoading, isProcessingAuth, isPlatformAdmin, role } = useAuth();

  if (isLoading || isProcessingAuth) {
    return <AuthGateLoadingCard />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (isPlatformAdmin) {
    return <Navigate to="/platform" replace />;
  }

  if (role === 'academy_admin') {
    return <Navigate to="/academy" replace />;
  }

  return <Navigate to="/dashboard" replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    {analyticsEnabled && <Analytics />}
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <Routes>
          <Route path="/landing" element={<LandingPage />} />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="/demo/roles" element={<RoleWorkflowsDemoPage />} />
          <Route path="/demo/speaking" element={<SpeakingPracticePage demoMode />} />
          {import.meta.env.DEV && (
            <>
              <Route path="/dev/mistakes-analysis" element={<MistakesAnalysisPreviewPage />} />
              <Route path="/dev/auth-flows" element={<AuthFlowsPreviewPage />} />
              <Route path="/__tests__/harness" element={<TestHarnessPage />} />
            </>
          )}

          <Route element={<AuthenticatedBoundary />}>
            <Route path="/" element={<RootRoute />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/profile-setup" element={<ProfileSetupPage />} />
            <Route
              path="/platform"
              element={
                <PlatformAdminRoute>
                  <PlatformConsolePage />
                </PlatformAdminRoute>
              }
            />
            {/* Academy administration */}
            <Route path="/academy" element={
              <AcademyAdminRoute>
                <AcademyLayout />
              </AcademyAdminRoute>
            }>
              <Route path="dashboard" element={<AcademyDashboardPage />} />


              <Route index element={<Navigate to="dashboard" replace />} />
            </Route>

            {/* Authenticated learning and teaching workflows */}
            <Route path="/" element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }>
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="my-tasks" element={<MyTasksPage />} />
              <Route path="select-ai-task-type" element={<SelectAiTaskTypePage />} />
              <Route path="generate-ai-prompt" element={<GenerateAiPromptPage />} />
              <Route path="editor" element={<EditorPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="teacher/assign-task" element={<AssignTaskPage />} />
              <Route path="teacher/print-exercise" element={<CreatePrintExercisePage />} />
              <Route path="teacher/student/:studentId" element={<StudentDetailsPage />} />
              <Route path="student/:studentId" element={<StudentDetailsPage />} />
              <Route path="evaluation/:submissionId" element={<EvaluationResultPage />} />
              <Route path="progress" element={<ProgressPage />} />
              <Route
                path="speaking"
                element={
                  <LearnerSpeakingRoute>
                    <SpeakingPracticePage />
                  </LearnerSpeakingRoute>
                }
              />
              <Route
                path="speaking/session/:sessionId"
                element={
                  <LearnerSpeakingRoute>
                    <SpeakingSessionPage />
                  </LearnerSpeakingRoute>
                }
              />
              {/* Reading and language-use workflows */}
              <Route path="generate-ruoe-exercise" element={<GenerateRuoEExercisePage />} />
              <Route path="ruoe-practice/:exerciseId" element={<RuoEPracticePage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
