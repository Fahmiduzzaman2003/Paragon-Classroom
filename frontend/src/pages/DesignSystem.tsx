import { GlassCard } from '@/components/glass/GlassCard'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput, GlassTextarea } from '@/components/glass/GlassInput'
import {
  GlassModal,
  GlassModalContent,
  GlassModalDescription,
  GlassModalFooter,
  GlassModalHeader,
  GlassModalTitle,
  GlassModalTrigger,
} from '@/components/glass/GlassModal'
import { Avatar, AvatarFallback } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { Switch } from '@/components/ui/Switch'
import { Label } from '@/components/ui/Label'
import { Separator } from '@/components/ui/Separator'
import { Mail, Sparkles, Search } from 'lucide-react'
import { toast } from 'sonner'

export function DesignSystem() {
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold">Design system</h1>
        <p className="text-sm text-muted-foreground mt-1">
          The glassmorphism foundation used across Paragon. Copy a component, keep the language.
        </p>
      </header>

      <Section title="Color & gradient">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['Primary', '#815AFF'],
            ['Magenta', '#FF46BE'],
            ['Cyan', '#00C8FF'],
            ['Mint', '#78FFD2'],
          ].map(([name, hex]) => (
            <div key={name} className="rounded-2xl glass p-3">
              <div
                className="h-16 rounded-xl"
                style={{ background: hex }}
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs font-semibold">{name}</span>
                <span className="text-[10px] font-mono text-muted-foreground">{hex}</span>
              </div>
            </div>
          ))}
          <div className="md:col-span-4 rounded-2xl p-6 text-center text-white font-display text-xl font-semibold bg-[linear-gradient(120deg,#815AFF_0%,#FF46BE_55%,#00C8FF_100%)]">
            Hero gradient
          </div>
        </div>
      </Section>

      <Section title="Glass surfaces">
        <div className="grid md:grid-cols-3 gap-3">
          <GlassCard padding="md">
            <div className="text-xs text-muted-foreground">.glass</div>
            <div className="font-display font-semibold mt-1">Base panel</div>
          </GlassCard>
          <GlassCard strong padding="md">
            <div className="text-xs text-muted-foreground">.glass-strong</div>
            <div className="font-display font-semibold mt-1">Elevated panel</div>
          </GlassCard>
          <GlassCard hover padding="md">
            <div className="text-xs text-muted-foreground">.glass + hover</div>
            <div className="font-display font-semibold mt-1">Interactive panel</div>
          </GlassCard>
        </div>
      </Section>

      <Section title="Typography">
        <GlassPanel className="p-5">
          <div className="font-display text-4xl font-semibold">Space Grotesk display</div>
          <div className="font-sans text-base mt-2">Inter body — the quick brown fox jumps over the lazy dog.</div>
          <div className="font-mono text-sm text-muted-foreground mt-2">
            JetBrains Mono: <span className="text-foreground">const rgb = (r, g, b) =&gt; [r, g, b]</span>
          </div>
          <div className="mt-3 text-gradient font-display text-2xl font-semibold">Gradient text</div>
        </GlassPanel>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-3 items-center">
          <GlassButton>Primary</GlassButton>
          <GlassButton variant="glass">Glass</GlassButton>
          <GlassButton variant="ghost">Ghost</GlassButton>
          <GlassButton variant="outline">Outline</GlassButton>
          <GlassButton variant="destructive">Destructive</GlassButton>
          <GlassButton size="sm">
            <Sparkles className="h-3.5 w-3.5" /> Small
          </GlassButton>
          <GlassButton size="lg">
            <Sparkles className="h-4 w-4" /> Large
          </GlassButton>
        </div>
      </Section>

      <Section title="Inputs">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="mb-1.5 block">Text input</Label>
            <GlassInput placeholder="you@university.edu" leadingIcon={<Mail className="h-4 w-4" />} />
          </div>
          <div>
            <Label className="mb-1.5 block">Search input</Label>
            <GlassInput placeholder="Search…" leadingIcon={<Search className="h-4 w-4" />} />
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-1.5 block">Textarea</Label>
            <GlassTextarea rows={3} placeholder="Say something interesting…" />
          </div>
          <div className="flex items-center gap-3">
            <Switch defaultChecked />
            <Label>Switch</Label>
          </div>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="primary">Primary</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="danger">Danger</Badge>
          <Badge variant="info">Info</Badge>
          <Badge variant="muted">Muted</Badge>
        </div>
      </Section>

      <Section title="Progress">
        <div className="space-y-3 max-w-md">
          <Progress value={25} />
          <Progress value={60} />
          <Progress value={92} />
        </div>
      </Section>

      <Section title="Skeletons">
        <div className="space-y-2 max-w-md">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-28 w-full" />
        </div>
      </Section>

      <Section title="Tabs">
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a">Overview</TabsTrigger>
            <TabsTrigger value="b">Materials</TabsTrigger>
            <TabsTrigger value="c">Chat</TabsTrigger>
          </TabsList>
          <TabsContent value="a">
            <GlassCard padding="md">Overview content</GlassCard>
          </TabsContent>
          <TabsContent value="b">
            <GlassCard padding="md">Materials content</GlassCard>
          </TabsContent>
          <TabsContent value="c">
            <GlassCard padding="md">Chat content</GlassCard>
          </TabsContent>
        </Tabs>
      </Section>

      <Section title="Avatars">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>FU</AvatarFallback>
          </Avatar>
          <Avatar className="h-12 w-12">
            <AvatarFallback>AR</AvatarFallback>
          </Avatar>
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-lg">DS</AvatarFallback>
          </Avatar>
        </div>
      </Section>

      <Section title="Modal & toasts">
        <div className="flex gap-3">
          <GlassModal>
            <GlassModalTrigger asChild>
              <GlassButton variant="glass">Open modal</GlassButton>
            </GlassModalTrigger>
            <GlassModalContent size="md">
              <GlassModalHeader>
                <GlassModalTitle>Rename material</GlassModalTitle>
                <GlassModalDescription>
                  This will re-embed the file and DS AI will re-index it.
                </GlassModalDescription>
              </GlassModalHeader>
              <GlassInput defaultValue="Lecture_03_Binary_Trees.pdf" />
              <GlassModalFooter>
                <GlassButton variant="ghost">Cancel</GlassButton>
                <GlassButton>Confirm</GlassButton>
              </GlassModalFooter>
            </GlassModalContent>
          </GlassModal>
          <GlassButton variant="glass" onClick={() => toast.success('Material ingested — DS AI is ready')}>
            Success toast
          </GlassButton>
          <GlassButton variant="glass" onClick={() => toast.error('Upload failed — file too large')}>
            Error toast
          </GlassButton>
        </div>
      </Section>

      <Separator />
      <p className="text-xs text-muted-foreground text-center py-4">
        All tokens defined in <span className="font-mono">src/styles/globals.css</span>.
      </p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        {title}
      </h2>
      {children}
    </section>
  )
}
