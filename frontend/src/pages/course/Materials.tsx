import { useEffect, useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CheckCheck,
  Download,
  ExternalLink,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  Link2,
  Loader2,
  MoreHorizontal,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassInput } from '@/components/glass/GlassInput'
import {
  GlassModal,
  GlassModalContent,
  GlassModalDescription,
  GlassModalFooter,
  GlassModalHeader,
  GlassModalTitle,
} from '@/components/glass/GlassModal'
import { Badge } from '@/components/ui/Badge'
import { Label } from '@/components/ui/Label'
import { Progress } from '@/components/ui/Progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { apiError, API_URL } from '@/lib/api'
import { formatBytes, formatRelative } from '@/lib/utils'
import { useDeleteMaterial, useMaterials, useUploadMaterial } from '@/hooks/useMaterials'
import { useAuthStore } from '@/stores/authStore'
import type { Course, MaterialFile, MaterialSection } from '@/types'

export function Materials() {
  const { course } = useOutletContext<{ course: Course }>()
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.id === course.teacherId || user?.role === 'admin'

  const [q, setQ] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadSection, setUploadSection] = useState<MaterialSection>('class')

  const { data: materials = [], isLoading } = useMaterials(course.id)
  const classM = materials.filter((m) => m.section === 'class')
  const addM = materials.filter((m) => m.section === 'additional')

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 max-w-md">
          <GlassInput
            leadingIcon={<Search className="h-4 w-4" />}
            placeholder="Search by filename, tag, uploader…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <GlassButton
          onClick={() => {
            setUploadSection('class')
            setUploadOpen(true)
          }}
        >
          <Upload className="h-4 w-4" /> Upload
        </GlassButton>
      </div>

      <Tabs defaultValue="class">
        <TabsList>
          <TabsTrigger value="class">
            Class materials <span className="text-[10px] opacity-70">({classM.length})</span>
          </TabsTrigger>
          <TabsTrigger value="additional">
            Additional materials <span className="text-[10px] opacity-70">({addM.length})</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="class">
          <MaterialGrid
            files={filterFiles(classM, q)}
            loading={isLoading}
            section="class"
            currentUserId={user?.id ?? ''}
            isTeacher={isTeacher}
            onUpload={() => {
              setUploadSection('class')
              setUploadOpen(true)
            }}
          />
        </TabsContent>
        <TabsContent value="additional">
          {!isTeacher && (
            <div className="mb-3 text-[11px] text-muted-foreground px-1">
              Only teachers can upload to Additional Materials.
            </div>
          )}
          <MaterialGrid
            files={filterFiles(addM, q)}
            loading={isLoading}
            section="additional"
            currentUserId={user?.id ?? ''}
            isTeacher={isTeacher}
            onUpload={
              isTeacher
                ? () => {
                    setUploadSection('additional')
                    setUploadOpen(true)
                  }
                : undefined
            }
          />
        </TabsContent>
      </Tabs>

      <UploadModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        courseId={course.id}
        aiName={course.aiName}
        initialSection={uploadSection}
        isTeacher={isTeacher}
      />
    </div>
  )
}

function filterFiles(files: MaterialFile[], q: string) {
  if (!q) return files
  const qq = q.toLowerCase()
  return files.filter(
    (f) =>
      f.filename.toLowerCase().includes(qq) ||
      f.tags.some((t) => t.toLowerCase().includes(qq)) ||
      f.uploaderName.toLowerCase().includes(qq) ||
      (f.folder ?? '').toLowerCase().includes(qq),
  )
}

function MaterialGrid({
  files,
  loading,
  section,
  currentUserId,
  isTeacher,
  onUpload,
}: {
  files: MaterialFile[]
  loading: boolean
  section: MaterialSection
  currentUserId: string
  isTeacher: boolean
  onUpload?: () => void
}) {
  if (loading) {
    return (
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[150px] rounded-2xl skeleton" />
        ))}
      </div>
    )
  }

  if (!files.length) {
    return (
      <GlassCard padding="lg" className="text-center border-dashed border-white/10">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center mb-3">
          <Upload className="h-5 w-5" />
        </div>
        <h3 className="font-display font-semibold">No materials here yet</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
          {section === 'class'
            ? 'Upload lectures, notes, or external links. Everything gets ingested for the course AI automatically.'
            : 'Teachers can curate reference material here. Only teachers can add to this section.'}
        </p>
        {onUpload && (
          <GlassButton size="sm" className="mt-4" onClick={onUpload}>
            <Upload className="h-3.5 w-3.5" /> Upload first item
          </GlassButton>
        )}
      </GlassCard>
    )
  }

  const grouped = files.reduce<Record<string, MaterialFile[]>>((acc, file) => {
    const key = file.folder || 'Ungrouped'
    ;(acc[key] ||= []).push(file)
    return acc
  }, {})

  return (
    <div className="space-y-5">
      {Object.entries(grouped).map(([folder, items]) => (
        <div key={folder}>
          <div className="flex items-center gap-2 mb-2 px-1">
            <Folder className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-display text-sm font-semibold">{folder}</h3>
            <span className="text-[10px] text-muted-foreground">{items.length} files</span>
          </div>
          <AnimatePresence>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {items.map((file, i) => (
                <motion.div
                  key={file.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: i * 0.02 }}
                >
                  <MaterialTile file={file} canDelete={isTeacher || file.uploaderId === currentUserId} />
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        </div>
      ))}
    </div>
  )
}

function MaterialTile({ file, canDelete }: { file: MaterialFile; canDelete: boolean }) {
  const del = useDeleteMaterial()
  const isExternal = file.sourceKind === 'link' && !!file.sourceUrl

  const onDelete = () => {
    if (!confirm(`Delete ${file.filename}? This will also remove its embeddings.`)) return
    del
      .mutateAsync({ materialId: file.id, courseId: file.courseId })
      .then(() => toast.success(`Deleted ${file.filename}`))
      .catch((e) => toast.error(apiError(e, 'Delete failed')))
  }

  return (
    <GlassCard padding="md" hover className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0">
          <FileIcon mime={file.mime} sourceKind={file.sourceKind} />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate" title={file.filename}>
              {file.filename}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {formatBytes(file.size)}
              {file.pages && ` · ${file.pages} pages`} · {formatRelative(file.createdAt)} ·{' '}
              {file.uploaderName}
            </div>
          </div>
        </div>
        <button className="h-7 w-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-muted-foreground">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {file.tags.map((t) => (
          <Badge key={t} variant="default" className="text-[10px]">
            #{t}
          </Badge>
        ))}
        {isExternal && (
          <Badge variant="warning" className="text-[10px]">
            <ExternalLink className="h-2.5 w-2.5" /> External link
          </Badge>
        )}
        <StatusBadge status={file.status} />
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-white/5 mt-auto">
        {isExternal ? (
          <a
            href={file.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full px-3 h-7 text-xs text-foreground/80 hover:bg-white/10"
            title="Open the original source"
          >
            <Link2 className="h-3.5 w-3.5" /> Open source
          </a>
        ) : (
          <a
            href={`${API_URL}/uploads/${file.courseId}/${file.id}__${encodeURIComponent(file.filename)}`}
            download={file.filename}
            className="inline-flex items-center gap-1.5 rounded-full px-3 h-7 text-xs text-foreground/80 hover:bg-white/10"
            onClick={(e) => e.preventDefault()}
            title="Download not wired in Phase 2"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </a>
        )}
        {canDelete && (
          <button
            onClick={onDelete}
            disabled={del.isPending}
            className="inline-flex items-center gap-1.5 rounded-full px-3 h-7 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        )}
        <GlassButton
          asChild
          size="sm"
          variant="glass"
          className="ml-auto text-xs h-7"
          disabled={file.status !== 'ready'}
        >
          <Link to={`/app/courses/${file.courseId}/chat?material=${file.id}`}>
            <Sparkles className="h-3.5 w-3.5" /> Ask AI
          </Link>
        </GlassButton>
      </div>
    </GlassCard>
  )
}

function StatusBadge({ status }: { status: MaterialFile['status'] }) {
  if (status === 'processing') {
    return (
      <Badge variant="warning" className="ml-auto">
        <Loader2 className="h-2.5 w-2.5 animate-spin" /> ingesting
      </Badge>
    )
  }
  if (status === 'failed') {
    return (
      <Badge variant="danger" className="ml-auto">
        failed
      </Badge>
    )
  }
  return (
    <Badge variant="success" className="ml-auto">
      <CheckCheck className="h-2.5 w-2.5" /> ready
    </Badge>
  )
}

function FileIcon({ mime, sourceKind }: { mime: string; sourceKind?: MaterialFile['sourceKind'] }) {
  const cls = 'h-9 w-9 rounded-xl flex items-center justify-center shrink-0'
  if (sourceKind === 'link') {
    return (
      <span className={`${cls} bg-cyan-500/15 text-cyan-300`}>
        <ExternalLink className="h-4 w-4" />
      </span>
    )
  }
  if (mime.includes('pdf'))
    return (
      <span className={`${cls} bg-rose-500/15 text-rose-300`}>
        <FileText className="h-4 w-4" />
      </span>
    )
  if (mime.includes('presentation'))
    return (
      <span className={`${cls} bg-orange-500/15 text-orange-300`}>
        <FileSpreadsheet className="h-4 w-4" />
      </span>
    )
  if (mime.includes('markdown') || mime.includes('text'))
    return (
      <span className={`${cls} bg-cyan-500/15 text-cyan-300`}>
        <FileCode2 className="h-4 w-4" />
      </span>
    )
  if (mime.includes('image'))
    return (
      <span className={`${cls} bg-emerald-500/15 text-emerald-300`}>
        <FileImage className="h-4 w-4" />
      </span>
    )
  return (
    <span className={`${cls} bg-violet-500/15 text-violet-300`}>
      <FileText className="h-4 w-4" />
    </span>
  )
}

function UploadModal({
  open,
  onOpenChange,
  courseId,
  aiName,
  initialSection,
  isTeacher,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  courseId: string
  aiName: string
  initialSection: MaterialSection
  isTeacher: boolean
}) {
  const [section, setSection] = useState<MaterialSection>(initialSection)
  const [inputMode, setInputMode] = useState<'file' | 'link'>('file')
  const [sourceUrl, setSourceUrl] = useState('')
  const [folder, setFolder] = useState('')
  const [tags, setTags] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [progress, setProgress] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const upload = useUploadMaterial()

  useEffect(() => {
    if (open && files.length === 0 && progress === 0) {
      setSection(initialSection)
    }
  }, [open, initialSection, files.length, progress])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean)

    try {
      if (inputMode === 'link') {
        if (!sourceUrl.trim()) {
          toast.error('Paste an external link')
          return
        }
        setProgress(0)
        await upload.mutateAsync({
          courseId,
          sourceUrl: sourceUrl.trim(),
          section,
          folder: folder.trim() || undefined,
          tags: tagList,
          onProgress: setProgress,
        })
      } else {
        if (!files.length) {
          toast.error('Pick a file')
          return
        }
        for (const file of files) {
          setProgress(0)
          await upload.mutateAsync({
            courseId,
            file,
            section,
            folder: folder.trim() || undefined,
            tags: tagList,
            onProgress: setProgress,
          })
        }
      }

      toast.success(`Uploaded — ${aiName} is ingesting`)
      onOpenChange(false)
      setFiles([])
      setSourceUrl('')
      setFolder('')
      setTags('')
      setProgress(0)
    } catch (err) {
      toast.error(apiError(err, 'Upload failed'))
    }
  }

  return (
    <GlassModal open={open} onOpenChange={onOpenChange}>
      <GlassModalContent size="md">
        <GlassModalHeader>
          <GlassModalTitle>Upload material</GlassModalTitle>
          <GlassModalDescription>
            PDF, DOCX, PPTX, TXT, MD up to 40 MB each. External links are fetched and indexed for RAG.
          </GlassModalDescription>
        </GlassModalHeader>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="mb-1.5 block">Section</Label>
            <div className="flex gap-2">
              <SectionChip
                active={section === 'class'}
                label="Class materials"
                desc="Anyone in the class can upload"
                onClick={() => setSection('class')}
              />
              <SectionChip
                active={section === 'additional'}
                disabled={!isTeacher}
                label="Additional materials"
                desc={isTeacher ? 'Teacher-curated references' : 'Teachers only'}
                onClick={() => setSection('additional')}
              />
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">Source type</Label>
            <div className="flex gap-2">
              <SectionChip
                active={inputMode === 'file'}
                label="Upload file"
                desc="PDF, DOCX, PPTX, TXT, MD"
                onClick={() => setInputMode('file')}
              />
              <SectionChip
                active={inputMode === 'link'}
                label="External link"
                desc="GFG, Medium, GitHub repo, article"
                onClick={() => setInputMode('link')}
              />
            </div>
          </div>

          <div>
            {inputMode === 'file' ? (
              <>
                <Label className="mb-1.5 block">File</Label>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="w-full rounded-2xl border border-dashed border-white/15 glass p-5 text-center hover:bg-white/5 transition"
                >
                  <Upload className="h-5 w-5 mx-auto mb-1" />
                  {files.length === 0 ? (
                    <>
                      <div className="text-sm font-medium">Click to select</div>
                      <div className="text-[11px] text-muted-foreground">
                        PDF / DOCX / PPTX / TXT / MD · max 40 MB
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-left">
                      {files.map((file) => (
                        <div key={file.name} className="flex items-center justify-between py-0.5">
                          <span className="truncate">{file.name}</span>
                          <span className="text-muted-foreground text-[10px]">
                            {formatBytes(file.size)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <input
                    ref={inputRef}
                    type="file"
                    className="hidden"
                    multiple
                    accept=".pdf,.docx,.pptx,.txt,.md,.markdown"
                    onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                  />
                </button>
              </>
            ) : (
              <>
                <Label className="mb-1.5 block">External link</Label>
                <GlassInput
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://medium.com/... or https://github.com/..."
                />
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Public article and repo links are fetched, cleaned, and indexed for RAG.
                </div>
              </>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Folder (optional)</Label>
              <GlassInput
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="Week 3"
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Tags (comma-separated)</Label>
              <GlassInput
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="lecture, trees"
              />
            </div>
          </div>

          {upload.isPending && (
            <div>
              <div className="text-[10px] text-muted-foreground mb-1">Uploading… {progress}%</div>
              <Progress value={progress} />
            </div>
          )}

          <GlassModalFooter>
            <GlassButton type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </GlassButton>
            <GlassButton
              type="submit"
              disabled={
                upload.isPending || (inputMode === 'file' ? files.length === 0 : !sourceUrl.trim())
              }
            >
              {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload
            </GlassButton>
          </GlassModalFooter>
        </form>
      </GlassModalContent>
    </GlassModal>
  )
}

function SectionChip({
  active,
  disabled,
  label,
  desc,
  onClick,
}: {
  active: boolean
  disabled?: boolean
  label: string
  desc: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 rounded-xl p-3 border text-left transition ${
        active
          ? 'ring-gradient bg-white/10 border-transparent'
          : 'glass hover:bg-white/10 border-white/10'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <div className="text-sm font-semibold">{label}</div>
      <div className="text-[11px] text-muted-foreground">{desc}</div>
    </button>
  )
}