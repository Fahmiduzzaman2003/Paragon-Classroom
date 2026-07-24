import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { mapMaterial, type ApiMaterial } from '@/lib/mappers'
import type { MaterialFile } from '@/types'

export function useMaterials(courseId: string | undefined) {
  return useQuery<MaterialFile[]>({
    queryKey: ['materials', courseId],
    enabled: !!courseId,
    // Poll while any material is still processing so the UI flips to "ready"
    // after ingestion finishes, without needing a websocket.
    refetchInterval: (q) => {
      const data = q.state.data as MaterialFile[] | undefined
      if (!data) return 5000
      return data.some((m) => m.status === 'processing') ? 3000 : false
    },
    queryFn: async () => {
      const { data } = await api.get<ApiMaterial[]>(`/courses/${courseId}/materials`)
      return data.map(mapMaterial)
    },
  })
}

interface UploadInput {
  courseId: string
  file?: File
  sourceUrl?: string
  section: 'class' | 'additional'
  folder?: string
  tags?: string[]
  onProgress?: (pct: number) => void
}

// Client-side pre-checks (fast feedback). The backend re-validates every rule
// authoritatively (magic bytes, exact size, per-user quota) — this is UX, not security.
export const MAX_UPLOAD_MB = 40
const ALLOWED_EXTS = ['.pdf', '.docx', '.pptx', '.txt', '.md', '.markdown']

export function validateUploadFile(file: File): string | null {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  if (!ALLOWED_EXTS.includes(ext)) {
    return 'Unsupported file type — PDF, DOCX, PPTX, TXT, or MD only.'
  }
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    return `File is too large — keep it under ${MAX_UPLOAD_MB} MB.`
  }
  return null
}

export function useUploadMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ courseId, file, sourceUrl, section, folder, tags, onProgress }: UploadInput) => {
      if (file) {
        const err = validateUploadFile(file)
        if (err) throw new Error(err)
      }
      const fd = new FormData()
      if (file) fd.append('file', file)
      if (sourceUrl) fd.append('source_url', sourceUrl)
      fd.append('section', section)
      if (folder) fd.append('folder', folder)
      fd.append('tags', JSON.stringify(tags ?? []))
      const { data } = await api.post<ApiMaterial>(`/courses/${courseId}/materials`, fd, {
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
        },
      })
      return mapMaterial(data)
    },
    onSuccess: (_m, vars) => {
      qc.invalidateQueries({ queryKey: ['materials', vars.courseId] })
      qc.invalidateQueries({ queryKey: ['course', vars.courseId] })
    },
  })
}

export function useDeleteMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ materialId }: { materialId: string; courseId: string }) => {
      await api.delete(`/materials/${materialId}`)
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['materials', vars.courseId] })
    },
  })
}
