import type {
  Announcement,
  Assignment,
  AttemptAttachment,
  AttemptResult,
  AttemptStart,
  AttemptSummary,
  CalendarEvent,
  ChatMessage,
  Citation,
  Conversation,
  Course,
  ForumReply,
  ForumThread,
  ForumThreadDetail,
  MaterialFile,
  Notification,
  Question,
  Quiz,
  Submission,
} from '@/types'

// Palette used to cycle accent hues when we lack one from backend
const ACCENT_PALETTE: number[] = [268, 326, 196, 162, 42, 18]

export interface ApiCourse {
  id: string
  name: string
  code: string
  description: string
  semester: string
  gradient: string
  accent_hue: number
  ai_name: string
  ai_personality: string
  rag_mode: 'strict' | 'balanced' | 'open'
  teacher_id: string
  teacher_name: string
  student_count: number
  material_count: number
  enrolled: boolean
  created_at: string
}

export function mapCourse(c: ApiCourse, index = 0): Course {
  const parts = c.gradient.split(',').map((p) => p.trim())
  const [a, b, d] = [parts[0] ?? '#815AFF', parts[1] ?? '#FF46BE', parts[2] ?? '#00C8FF']
  return {
    id: c.id,
    name: c.name,
    code: c.code,
    description: c.description,
    gradient: [a, b, d],
    semester: c.semester,
    aiName: c.ai_name,
    aiPersonality: c.ai_personality,
    teacherId: c.teacher_id,
    teacherName: c.teacher_name,
    studentCount: c.student_count,
    progress: 0,
    unread: 0,
    accentHue: c.accent_hue || ACCENT_PALETTE[index % ACCENT_PALETTE.length]!,
    tag: c.enrolled && c.teacher_id ? 'Core' : 'Core',
  }
}

export interface ApiMaterial {
  id: string
  course_id: string
  uploader_id: string
  uploader_name: string
  section: 'class' | 'additional'
  filename: string
  mime: string
  size: number
  folder: string
  tags: string[]
  status: 'processing' | 'ready' | 'failed'
  status_detail: string
  chunk_count: number
  page_count: number
  source_url?: string | null
  source_kind?: 'file' | 'link'
  created_at: string
}

export function mapMaterial(m: ApiMaterial): MaterialFile {
  return {
    id: m.id,
    courseId: m.course_id,
    section: m.section,
    filename: m.filename,
    mime: m.mime,
    size: m.size,
    folder: m.folder || undefined,
    tags: m.tags ?? [],
    uploaderId: m.uploader_id,
    uploaderName: m.uploader_name,
    sourceUrl: m.source_url ?? undefined,
    sourceKind: m.source_kind ?? 'file',
    status: m.status,
    createdAt: m.created_at,
    pages: m.page_count || undefined,
  }
}

export interface ApiConversation {
  id: string
  course_id: string
  user_id: string
  title: string
  created_at: string
  updated_at: string
  message_count: number
}

export function mapConversation(c: ApiConversation): Conversation {
  return {
    id: c.id,
    courseId: c.course_id,
    title: c.title,
    updatedAt: c.updated_at,
    messages: [],
  }
}

export interface ApiMessage {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  citations: ApiCitation[]
  created_at: string
}

export interface ApiCitation {
  id: string
  material_id: string
  filename: string
  page: number
  chunk_index: number
  score: number
  source_url?: string | null
  snippet: string
}

export function mapCitation(c: ApiCitation): Citation {
  return {
    id: c.id,
    filename: c.filename,
    page: c.page,
    snippet: c.snippet,
    score: c.score,
    sourceUrl: c.source_url ?? undefined,
  }
}

export function mapMessage(m: ApiMessage): ChatMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    citations: (m.citations ?? []).map(mapCitation),
    createdAt: m.created_at,
  }
}

// ─────────────────────────────────────────────────────
// Quizzes
// ─────────────────────────────────────────────────────

export interface ApiQuestion {
  id: string
  quiz_id: string
  position: number
  type: Question['type']
  body: string
  options: string[]
  correct?: (number | string)[]
  points: number
  explanation?: string
  accepts_attachment?: boolean
  has_image?: boolean
}

export function mapQuestion(q: ApiQuestion): Question {
  return {
    id: q.id,
    quizId: q.quiz_id,
    position: q.position,
    type: q.type,
    body: q.body,
    options: q.options ?? [],
    correct: q.correct,
    points: q.points,
    explanation: q.explanation,
    acceptsAttachment: !!q.accepts_attachment,
    hasImage: !!q.has_image,
  }
}

export interface ApiQuiz {
  id: string
  course_id: string
  title: string
  description: string
  duration_min: number
  start_at: string | null
  end_at: string | null
  shuffle_questions: boolean
  show_results: boolean
  allow_retake: boolean
  one_question_at_a_time: boolean
  exam_mode?: boolean
  exam_code?: string | null
  proctoring_enabled?: boolean
  status: Quiz['status']
  question_count: number
  total_points: number
  submission_count: number
  my_attempt_id: string | null
  my_score: number | null
  created_at: string
  questions?: ApiQuestion[]
}

export function mapQuiz(q: ApiQuiz): Quiz {
  return {
    id: q.id,
    courseId: q.course_id,
    title: q.title,
    description: q.description,
    durationMin: q.duration_min,
    startAt: q.start_at,
    endAt: q.end_at,
    shuffleQuestions: q.shuffle_questions,
    showResults: q.show_results,
    allowRetake: q.allow_retake,
    oneQuestionAtATime: q.one_question_at_a_time,
    examMode: !!q.exam_mode,
    examCode: q.exam_code ?? null,
    proctoringEnabled: !!q.proctoring_enabled,
    status: q.status,
    questionCount: q.question_count,
    totalPoints: q.total_points,
    submissionCount: q.submission_count,
    myAttemptId: q.my_attempt_id,
    myScore: q.my_score,
    questions: q.questions?.map(mapQuestion),
    createdAt: q.created_at,
  }
}

export interface ApiAttemptStart {
  id: string
  quiz_id: string
  started_at: string
  duration_min: number
  questions: ApiQuestion[]
}

export function mapAttemptStart(a: ApiAttemptStart): AttemptStart {
  return {
    id: a.id,
    quizId: a.quiz_id,
    startedAt: a.started_at,
    durationMin: a.duration_min,
    questions: (a.questions ?? []).map(mapQuestion),
  }
}

export interface ApiAttachment {
  id: string
  question_id: string
  filename: string
  mime: string
  size: number
  uploaded_at: string
}

export function mapAttachment(a: ApiAttachment): AttemptAttachment {
  return {
    id: a.id,
    questionId: a.question_id,
    filename: a.filename,
    mime: a.mime,
    size: a.size,
    uploadedAt: a.uploaded_at,
  }
}

export interface ApiAttemptResult {
  id: string
  quiz_id: string
  started_at: string
  submitted_at: string | null
  score: number
  max_score: number
  auto_score?: number
  manual_score?: number
  auto_max?: number
  manual_max?: number
  pending_manual?: number
  needs_manual_grading: boolean
  released?: boolean
  teacher_feedback?: string
  violations?: { type: string; at: string; extra?: Record<string, unknown> }[]
  graded: {
    question_id: string
    correct: boolean
    points: number
    max_points: number
    feedback: string
    auto: boolean
    reviewed?: boolean
    explanation: string
    student_text?: string
    student_selected?: number[]
    attachments?: ApiAttachment[]
  }[]
}

export function mapAttemptResult(a: ApiAttemptResult): AttemptResult {
  return {
    id: a.id,
    quizId: a.quiz_id,
    startedAt: a.started_at,
    submittedAt: a.submitted_at,
    score: a.score,
    maxScore: a.max_score,
    autoScore: a.auto_score ?? 0,
    manualScore: a.manual_score ?? 0,
    autoMax: a.auto_max ?? 0,
    manualMax: a.manual_max ?? 0,
    pendingManual: a.pending_manual ?? 0,
    needsManualGrading: a.needs_manual_grading,
    released: !!a.released,
    teacherFeedback: a.teacher_feedback ?? '',
    violations: (a.violations ?? []).map((v) => ({
      type: v.type,
      at: v.at,
      extra: v.extra ?? {},
    })),
    graded: (a.graded ?? []).map((g) => ({
      questionId: g.question_id,
      correct: g.correct,
      points: g.points,
      maxPoints: g.max_points,
      feedback: g.feedback,
      auto: g.auto,
      reviewed: g.reviewed ?? g.auto,
      explanation: g.explanation,
      studentText: g.student_text ?? '',
      studentSelected: g.student_selected ?? [],
      attachments: (g.attachments ?? []).map(mapAttachment),
    })),
  }
}

export interface ApiAttemptSummary {
  id: string
  quiz_id: string
  student_id: string
  student_name: string
  started_at: string
  submitted_at: string | null
  score: number
  max_score: number
  needs_manual_grading: boolean
  released: boolean
  attachment_count: number
}

export function mapAttemptSummary(s: ApiAttemptSummary): AttemptSummary {
  return {
    id: s.id,
    quizId: s.quiz_id,
    studentId: s.student_id,
    studentName: s.student_name,
    startedAt: s.started_at,
    submittedAt: s.submitted_at,
    score: s.score,
    maxScore: s.max_score,
    needsManualGrading: s.needs_manual_grading,
    released: s.released,
    attachmentCount: s.attachment_count,
  }
}

// ─────────────────────────────────────────────────────
// Assignments
// ─────────────────────────────────────────────────────

export interface ApiAssignment {
  id: string
  course_id: string
  title: string
  description: string
  deadline: string
  max_points: number
  rubric: { name: string; max_points: number; description?: string }[]
  status: Assignment['status']
  submission_count: number
  graded_count: number
  my_submission_id: string | null
  my_grade: number | null
  created_at: string
}

export function mapAssignment(a: ApiAssignment): Assignment {
  return {
    id: a.id,
    courseId: a.course_id,
    title: a.title,
    description: a.description,
    deadline: a.deadline,
    maxPoints: a.max_points,
    rubric: a.rubric ?? [],
    status: a.status,
    submissionCount: a.submission_count,
    graded: a.graded_count,
    mySubmissionId: a.my_submission_id,
    myGrade: a.my_grade,
  }
}

export interface ApiSubmission {
  id: string
  assignment_id: string
  student_id: string
  student_name: string
  text: string
  files: { filename: string; path: string; size: number }[]
  submitted_at: string
  grade: number | null
  feedback: string
  rubric_scores: { name: string; points: number }[]
  graded_at: string | null
  is_late: boolean
}

export function mapSubmission(s: ApiSubmission): Submission {
  return {
    id: s.id,
    assignmentId: s.assignment_id,
    studentId: s.student_id,
    studentName: s.student_name,
    text: s.text,
    files: s.files ?? [],
    submittedAt: s.submitted_at,
    grade: s.grade,
    feedback: s.feedback,
    rubricScores: s.rubric_scores ?? [],
    gradedAt: s.graded_at,
    isLate: s.is_late,
  }
}

// ─────────────────────────────────────────────────────
// Forum
// ─────────────────────────────────────────────────────

export interface ApiForumReply {
  id: string
  thread_id: string
  author_id: string
  author_name: string
  body: string
  upvotes: number
  accepted: boolean
  created_at: string
}

export function mapForumReply(r: ApiForumReply): ForumReply {
  return {
    id: r.id,
    threadId: r.thread_id,
    authorId: r.author_id,
    authorName: r.author_name,
    body: r.body,
    upvotes: r.upvotes,
    accepted: r.accepted,
    createdAt: r.created_at,
  }
}

export interface ApiForumThread {
  id: string
  course_id: string
  author_id: string
  author_name: string
  title: string
  body: string
  pinned: boolean
  answered: boolean
  upvotes: number
  tags: string[]
  reply_count: number
  created_at: string
  updated_at: string
}

export function mapForumThread(t: ApiForumThread): ForumThread {
  return {
    id: t.id,
    courseId: t.course_id,
    authorId: t.author_id,
    authorName: t.author_name,
    title: t.title,
    body: t.body,
    pinned: t.pinned,
    answered: t.answered,
    upvotes: t.upvotes,
    tags: t.tags ?? [],
    replies: t.reply_count,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  }
}

export interface ApiForumThreadDetail extends ApiForumThread {
  replies: ApiForumReply[]
}

export function mapForumThreadDetail(t: ApiForumThreadDetail): ForumThreadDetail {
  return {
    ...mapForumThread(t),
    replies_list: (t.replies ?? []).map(mapForumReply),
  }
}

// ─────────────────────────────────────────────────────
// Calendar / Announcement / Notification
// ─────────────────────────────────────────────────────

export interface ApiEvent {
  id: string
  course_id: string
  title: string
  description: string
  start_at: string
  end_at: string
  type: CalendarEvent['type']
  source_ref?: string | null
}

export function mapEvent(e: ApiEvent): CalendarEvent {
  return {
    id: e.id,
    courseId: e.course_id,
    title: e.title,
    description: e.description,
    startAt: e.start_at,
    endAt: e.end_at,
    type: e.type,
  }
}

export interface ApiAnnouncement {
  id: string
  course_id: string
  author_id: string
  author_name: string
  title: string
  body: string
  pinned: boolean
  created_at: string
}

export function mapAnnouncement(a: ApiAnnouncement): Announcement {
  return {
    id: a.id,
    courseId: a.course_id,
    title: a.title,
    body: a.body,
    pinned: a.pinned,
    createdAt: a.created_at,
    authorName: a.author_name,
  }
}

export interface ApiNotification {
  id: string
  type: Notification['type']
  title: string
  body: string
  course_id?: string | null
  course_name?: string | null
  payload?: Record<string, unknown>
  read: boolean
  created_at: string
}

export function mapNotification(n: ApiNotification): Notification {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    courseId: n.course_id ?? undefined,
    courseName: n.course_name ?? undefined,
    read: n.read,
    createdAt: n.created_at,
  }
}
