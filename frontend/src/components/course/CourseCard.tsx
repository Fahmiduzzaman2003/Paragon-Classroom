import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Sparkles, Users } from 'lucide-react'
import { Progress } from '@/components/ui/Progress'
import { Badge } from '@/components/ui/Badge'
import type { Course } from '@/types'

interface Props {
  course: Course
  index?: number
}

export function CourseCard({ course, index = 0 }: Props) {
  const [a, b, c] = course.gradient
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: 'easeOut' }}
      whileHover={{ y: -4 }}
      className="group"
    >
      <Link
        to={`/app/courses/${course.id}`}
        className="relative block rounded-3xl overflow-hidden glass-hover"
      >
        {/* Top media / gradient header with AI badge prominent */}
        <div
          className="relative h-36 overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${a} 0%, ${b} 55%, ${c} 100%)`,
          }}
        >
          {/* Orb */}
          <div
            className="absolute -top-10 -right-10 h-36 w-36 rounded-full blur-2xl opacity-60"
            style={{ background: c }}
          />
          <div
            className="absolute -bottom-10 -left-8 h-32 w-32 rounded-full blur-2xl opacity-50"
            style={{ background: a }}
          />

          {/* Grid overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:32px_32px]" />

          {/* AI badge — THE key visual for this spec */}
          <div className="absolute top-3 left-3 right-3 flex items-start justify-between">
            <div className="flex items-center gap-2 rounded-full bg-black/30 backdrop-blur-md border border-white/20 px-2.5 py-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inset-0 rounded-full bg-emerald-400 animate-pulse" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
              </span>
              <Sparkles className="h-3 w-3 text-white" />
              <span className="text-[11px] font-semibold text-white">{course.aiName}</span>
            </div>
            <Badge variant="default" className="bg-black/30 border-white/20 text-white">
              {course.tag}
            </Badge>
          </div>

          {/* Course code */}
          <div className="absolute bottom-3 left-3 rounded-full bg-black/30 backdrop-blur-md border border-white/20 px-2 py-0.5 text-[10px] font-mono text-white/90">
            {course.code}
          </div>

          {/* Unread dot */}
          {course.unread > 0 && (
            <div className="absolute bottom-3 right-3 h-6 min-w-6 px-1.5 rounded-full bg-white text-[11px] font-semibold text-black flex items-center justify-center shadow-md">
              {course.unread} new
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-4 glass border-t-0 rounded-b-3xl">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-display text-base font-semibold leading-tight truncate">
                {course.name}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {course.semester} · {course.teacherName}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition shrink-0 mt-1" />
          </div>

          <p className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
            {course.description}
          </p>

          <div className="mt-4">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
              <span>Course progress</span>
              <span className="font-semibold text-foreground">{course.progress}%</span>
            </div>
            <Progress value={course.progress} />
          </div>

          <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" /> {course.studentCount} students
            </span>
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> {course.aiName} · trained on materials
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
