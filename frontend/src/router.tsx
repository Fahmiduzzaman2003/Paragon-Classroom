import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { useAuthStore } from '@/stores/authStore'
import { Landing } from '@/pages/Landing'
import { Login } from '@/pages/Login'
import { Register } from '@/pages/Register'
import { ForgotPassword } from '@/pages/ForgotPassword'
import { ResetPassword } from '@/pages/ResetPassword'
import { VerifyEmail } from '@/pages/VerifyEmail'
import { GoogleCallback } from '@/pages/GoogleCallback'
import { Dashboard } from '@/pages/Dashboard'
import { Profile } from '@/pages/Profile'
import { Settings } from '@/pages/Settings'
import { Inbox } from '@/pages/Inbox'
import { GlobalCalendar } from '@/pages/GlobalCalendar'
import { GlobalLeaderboard } from '@/pages/GlobalLeaderboard'
import { CourseLayout } from '@/pages/CourseLayout'
import { CourseOverview } from '@/pages/course/Overview'
import { Materials } from '@/pages/course/Materials'
import { AIChat } from '@/pages/course/AIChat'
import { Quizzes } from '@/pages/course/Quizzes'
import { QuizAttempt } from '@/pages/course/QuizAttempt'
import { ExamFolder } from '@/pages/course/ExamFolder'
import { ExamReview } from '@/pages/course/ExamReview'
import { StudyBuddy } from '@/pages/course/StudyBuddy'
import { Analytics } from '@/pages/course/Analytics'
import { JoinExam } from '@/pages/JoinExam'
import { Leaderboard } from '@/pages/course/Leaderboard'
import { Assignments } from '@/pages/course/Assignments'
import { Forum } from '@/pages/course/Forum'
import { CourseCalendar } from '@/pages/course/CourseCalendar'
import { NotFound } from '@/pages/NotFound'

function RequireAuth() {
  const user = useAuthStore((s) => s.user)
  const hydrated = useAuthStore((s) => s.hydrated)
  // Wait for the session to rehydrate before deciding. In Firebase mode `user`
  // is null on a fresh page load until onIdTokenChanged restores the session —
  // redirecting on `!user` before that bounces an authenticated user to /login
  // on every reload / deep link.
  if (!hydrated) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

/** Gates student-only routes — teachers hitting `/app/exam/join` directly via
 * URL are bounced back to the dashboard. Admins still pass through so they
 * can QA the student flow. */
function RequireStudent() {
  const user = useAuthStore((s) => s.user)
  if (user && user.role !== 'student' && user.role !== 'admin') {
    return <Navigate to="/app" replace />
  }
  return <Outlet />
}

function RedirectIfAuthed() {
  const user = useAuthStore((s) => s.user)
  if (user) return <Navigate to="/app" replace />
  return <Outlet />
}

export const router = createBrowserRouter([
  {
    element: <RedirectIfAuthed />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/login', element: <Login /> },
      { path: '/register', element: <Register /> },
      { path: '/forgot-password', element: <ForgotPassword /> },
      { path: '/reset-password', element: <ResetPassword /> },
      { path: '/verify-email', element: <VerifyEmail /> },
      { path: '/auth/google/callback', element: <GoogleCallback /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/app',
        element: <AppShell />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: 'profile', element: <Profile /> },
          { path: 'settings', element: <Settings /> },
          { path: 'inbox', element: <Inbox /> },
          { path: 'calendar', element: <GlobalCalendar /> },
          { path: 'leaderboard', element: <GlobalLeaderboard /> },
          {
            // Student-only — sidebar hides the link, but the URL is still
            // guarded. Admins pass through so they can QA the flow.
            element: <RequireStudent />,
            children: [
              { path: 'exam/join', element: <JoinExam /> },
            ],
          },
          {
            path: 'courses/:courseId',
            element: <CourseLayout />,
            children: [
              { index: true, element: <CourseOverview /> },
              { path: 'materials', element: <Materials /> },
              // One route with an optional param so /chat and /chat/:id resolve to
              // the SAME element instance — navigating between them updates the
              // param without remounting AIChat (which would reset its state).
              { path: 'chat/:conversationId?', element: <AIChat /> },
              { path: 'quizzes', element: <Quizzes /> },
              { path: 'quizzes/:quizId', element: <QuizAttempt /> },
              { path: 'quizzes/:quizId/submissions', element: <ExamFolder /> },
              { path: 'quizzes/:quizId/submissions/:attemptId', element: <ExamReview /> },
              { path: 'study', element: <StudyBuddy /> },
              { path: 'analytics', element: <Analytics /> },
              { path: 'leaderboard', element: <Leaderboard /> },
              { path: 'assignments', element: <Assignments /> },
              { path: 'forum', element: <Forum /> },
              { path: 'calendar', element: <CourseCalendar /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFound /> },
])
