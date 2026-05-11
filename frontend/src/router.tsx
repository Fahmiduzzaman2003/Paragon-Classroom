import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { useAuthStore } from '@/stores/authStore'
import { Landing } from '@/pages/Landing'
import { Login } from '@/pages/Login'
import { Register } from '@/pages/Register'
import { Dashboard } from '@/pages/Dashboard'
import { Profile } from '@/pages/Profile'
import { DesignSystem } from '@/pages/DesignSystem'
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
  if (!user) return <Navigate to="/login" replace />
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
          { path: 'design-system', element: <DesignSystem /> },
          { path: 'inbox', element: <Inbox /> },
          { path: 'calendar', element: <GlobalCalendar /> },
          { path: 'leaderboard', element: <GlobalLeaderboard /> },
          { path: 'exam/join', element: <JoinExam /> },
          {
            path: 'courses/:courseId',
            element: <CourseLayout />,
            children: [
              { index: true, element: <CourseOverview /> },
              { path: 'materials', element: <Materials /> },
              { path: 'chat', element: <AIChat /> },
              { path: 'chat/:conversationId', element: <AIChat /> },
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
