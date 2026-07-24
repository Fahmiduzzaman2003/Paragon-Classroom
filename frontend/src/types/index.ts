export type Role = 'admin' | 'teacher' | 'student'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  avatarUrl?: string
  bio?: string
  institution?: string
}

export interface Course {
  id: string
  name: string
  code: string
  description: string
  gradient: [string, string, string]
  semester: string
  aiName: string
  aiPersonality: string
  teacherId: string
  teacherName: string
  studentCount: number
  progress: number
  unread: number
  accentHue: number
  tag: string
}

export type MaterialSection = 'class' | 'additional'

export interface MaterialFile {
  id: string
  courseId: string
  section: MaterialSection
  filename: string
  mime: string
  size: number
  folder?: string
  tags: string[]
  uploaderId: string
  uploaderName: string
  sourceUrl?: string
  sourceKind?: 'file' | 'link'
  status: 'processing' | 'ready' | 'failed'
  createdAt: string
  pages?: number
}

export interface Citation {
  id: string
  filename: string
  page: number
  snippet: string
  score: number
  sourceUrl?: string | null
}

export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  citations?: Citation[]
  createdAt: string
  streaming?: boolean
  /** True when this answer was served instantly from the semantic cache. */
  cached?: boolean
}

export interface Conversation {
  id: string
  courseId: string
  title: string
  messages: ChatMessage[]
  updatedAt: string
}

export type QuestionType =
  | 'mcq_single'
  | 'mcq_multi'
  | 'true_false'
  | 'short_answer'
  | 'code'
  | 'essay'

export interface Question {
  id: string
  quizId?: string
  position?: number
  type: QuestionType
  body: string
  options?: string[]
  correct?: (number | string)[]
  points: number
  explanation?: string
  acceptsAttachment?: boolean
  hasImage?: boolean
}

export type QuizStatus = 'draft' | 'scheduled' | 'live' | 'closed'

export interface Quiz {
  id: string
  courseId: string
  title: string
  description: string
  durationMin: number
  startAt: string | null
  endAt: string | null
  shuffleQuestions: boolean
  showResults: boolean
  allowRetake: boolean
  oneQuestionAtATime: boolean
  examMode: boolean
  examCode?: string | null
  proctoringEnabled?: boolean
  questionCount: number
  totalPoints: number
  submissionCount: number
  status: QuizStatus
  questions?: Question[]
  myAttemptId?: string | null
  myScore?: number | null
  createdAt: string
}

export interface ViolationEvent {
  type: string
  at: string
  extra?: Record<string, unknown>
}

export interface AttemptAttachment {
  id: string
  questionId: string
  filename: string
  mime: string
  size: number
  uploadedAt: string
}

export interface AttemptStart {
  id: string
  quizId: string
  startedAt: string
  durationMin: number
  questions: Question[]
}

export interface GradedQuestion {
  questionId: string
  correct: boolean
  points: number
  maxPoints: number
  feedback: string
  auto: boolean
  reviewed?: boolean
  explanation: string
  studentText?: string
  studentSelected?: number[]
  attachments?: AttemptAttachment[]
}

export interface AttemptResult {
  id: string
  quizId: string
  startedAt: string
  submittedAt: string | null
  score: number
  maxScore: number
  autoScore?: number
  manualScore?: number
  autoMax?: number
  manualMax?: number
  pendingManual?: number
  needsManualGrading: boolean
  released?: boolean
  teacherFeedback?: string
  violations?: ViolationEvent[]
  graded: GradedQuestion[]
}

export interface AttemptSummary {
  id: string
  quizId: string
  studentId: string
  studentName: string
  startedAt: string
  submittedAt: string | null
  score: number
  maxScore: number
  needsManualGrading: boolean
  released: boolean
  attachmentCount: number
}

export interface LeaderboardEntry {
  rank: number
  userId: string
  name: string
  avatarUrl?: string
  points: number
  quizzesTaken: number
  streak: number
}

export interface Assignment {
  id: string
  courseId: string
  title: string
  description: string
  deadline: string
  maxPoints: number
  submissionCount: number
  graded: number
  status: 'open' | 'closed' | 'draft'
  rubric?: { name: string; max_points: number; description?: string }[]
  mySubmissionId?: string | null
  myGrade?: number | null
}

export interface Submission {
  id: string
  assignmentId: string
  studentId: string
  studentName: string
  text: string
  files: { filename: string; path: string; size: number }[]
  submittedAt: string
  grade: number | null
  feedback: string
  rubricScores: { name: string; points: number }[]
  gradedAt: string | null
  isLate: boolean
}

export interface ForumThread {
  id: string
  courseId: string
  authorId: string
  authorName: string
  title: string
  body: string
  createdAt: string
  updatedAt: string
  replies: number
  upvotes: number
  pinned: boolean
  answered: boolean
  tags: string[]
}

export interface ForumReply {
  id: string
  threadId: string
  authorId: string
  authorName: string
  body: string
  upvotes: number
  accepted: boolean
  createdAt: string
}

export interface ForumThreadDetail extends ForumThread {
  replies_list: ForumReply[]
}

export interface CalendarEvent {
  id: string
  courseId: string
  title: string
  description?: string
  startAt: string
  endAt: string
  type: 'quiz' | 'assignment' | 'lecture' | 'office_hours' | 'custom'
}

export interface Announcement {
  id: string
  courseId: string
  title: string
  body: string
  createdAt: string
  authorName: string
  pinned: boolean
}

export interface Notification {
  id: string
  type:
    | 'announcement'
    | 'graded'
    | 'quiz_reminder'
    | 'mention'
    | 'forum_reply'
    | 'material_ready'
  title: string
  body: string
  courseId?: string
  courseName?: string
  read: boolean
  createdAt: string
}
