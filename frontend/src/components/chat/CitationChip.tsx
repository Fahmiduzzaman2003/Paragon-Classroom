import { motion } from 'framer-motion'
import { FileText } from 'lucide-react'
import { useState } from 'react'
import type { Citation } from '@/types'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/Popover'

interface Props {
  citation: Citation
  index: number
}

export function CitationChip({ citation, index }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <motion.button
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * index }}
          className="group inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] hover:bg-white/10 transition"
        >
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[linear-gradient(135deg,#815AFF,#00C8FF)] text-[9px] font-semibold text-white">
            {index + 1}
          </span>
          <FileText className="h-3 w-3 text-muted-foreground" />
          <span className="truncate max-w-[14rem]">{citation.filename}</span>
          <span className="text-muted-foreground">· p.{citation.page}</span>
        </motion.button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wider">
          Source excerpt · similarity {Math.round(citation.score * 100)}%
        </div>
        <div className="text-xs font-medium mb-2">
          {citation.filename} <span className="text-muted-foreground font-normal">page {citation.page}</span>
        </div>
        <blockquote className="text-xs text-muted-foreground border-l-2 border-[#00C8FF] pl-3 py-1 leading-relaxed">
          {citation.snippet}
        </blockquote>
      </PopoverContent>
    </Popover>
  )
}
