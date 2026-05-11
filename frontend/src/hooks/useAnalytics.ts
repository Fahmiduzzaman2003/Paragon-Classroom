import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface AnalyticsOverview {
  students_enrolled: number
  active_7d: number
  stale_7_14d: number
  inactive_14d_plus: number
  submission_rate_pct: number
  avg_class_pct: number
  median_class_pct: number
  stddev_class_pct: number
  min_class_pct: number
  max_class_pct: number
  total_quizzes: number
  total_attempts: number
  pending_manual_review: number
  total_assignments: number
  assignment_submissions: number
  assignments_to_grade: number
  chat_messages_total: number
  avg_chat_per_student: number
}

export interface HistogramBucket {
  bucket: string
  count: number
}

export interface ScoreDistribution {
  histogram: HistogramBucket[]
  mean: number
  median: number
  stddev: number
  samples: number
}

export interface StudentRow {
  user_id: string
  name: string
  email: string
  avatar_url: string | null
  enrolled_at: string | null
  attempts_count: number
  avg_pct: number
  submissions_count: number
  late_count: number
  chat_messages: number
  last_activity_at: string | null
  days_since_active: number | null
  quiz_coverage_pct: number
  assignment_coverage_pct: number
  risk_score: number
  risk_label: 'low' | 'medium' | 'high'
}

export interface QuestionRow {
  question_id: string
  quiz_id: string
  quiz_title: string
  type: string
  body: string
  points: number
  n_responses: number
  difficulty: number
  discrimination: number
  flag: 'good' | 'ok' | 'review' | 'too easy'
}

export interface QuizTrendPoint {
  quiz_id: string
  title: string
  created_at: string
  n: number
  mean: number
  median: number
  min: number
  max: number
  p25: number
  p75: number
}

export interface DailyCount {
  date: string
  count: number
}

export interface TrendsOut {
  quiz_points: QuizTrendPoint[]
  submissions_by_day: DailyCount[]
}

export interface AssignmentRow {
  assignment_id: string
  title: string
  deadline: string
  max_points: number
  submission_count: number
  submission_rate_pct: number
  graded_count: number
  grading_progress_pct: number
  avg_grade: number
  median_grade: number
  late_count: number
  late_rate_pct: number
}

export interface AnalyticsBundle {
  overview: AnalyticsOverview
  score_distribution: ScoreDistribution
  students: StudentRow[]
  questions: QuestionRow[]
  trends: TrendsOut
  assignments: AssignmentRow[]
}

export function useAnalytics(courseId: string | undefined) {
  return useQuery<AnalyticsBundle>({
    queryKey: ['analytics', courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data } = await api.get<AnalyticsBundle>(`/courses/${courseId}/analytics`)
      return data
    },
    staleTime: 30_000, // refresh every 30s on focus, otherwise rely on manual refetch
  })
}

export function useAnalyticsInsights(courseId: string | undefined, enabled: boolean) {
  return useQuery<{ summary: string }>({
    queryKey: ['analytics-insights', courseId],
    enabled: !!courseId && enabled,
    queryFn: async () => {
      const { data } = await api.get<{ summary: string }>(
        `/courses/${courseId}/analytics/insights`,
      )
      return data
    },
    staleTime: 5 * 60_000,
  })
}
