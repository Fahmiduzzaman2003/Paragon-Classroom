import { useRef, useState } from 'react'
import type { ChatMessage, Citation } from '@/types'

const canned: Array<{ match: RegExp; content: string; citations: Citation[] }> = [
  {
    match: /(binary\s+tree|bst|tree)/i,
    content: `A **binary tree** is a hierarchical structure where each node has at most two children: a \`left\` and a \`right\`.
A **binary search tree (BST)** adds an invariant: for every node \`n\`, all keys in the left subtree are less than \`n.key\`, and all keys in the right subtree are greater.

Core operations and their worst-case costs on a BST of height \`h\`:

- \`search(k)\` → $O(h)$
- \`insert(k)\` → $O(h)$
- \`delete(k)\` → $O(h)$

In a **balanced** BST (red-black, AVL), \`h = O(log n)\`, giving logarithmic operations.
In a degenerate BST (e.g. inserting sorted keys), \`h = O(n)\`.

\`\`\`python
class Node:
    __slots__ = ("key", "left", "right")
    def __init__(self, key):
        self.key, self.left, self.right = key, None, None

def bst_search(root, k):
    while root and root.key != k:
        root = root.left if k < root.key else root.right
    return root
\`\`\`

> Proof sketch that in-order traversal of a BST yields sorted output: induction on the tree — the left subtree is visited in sorted order, then \`n\`, then the right subtree — and the invariant ensures \`left < n < right\`.`,
    citations: [
      {
        id: 'cit-a',
        filename: 'Lecture_03_Binary_Trees.pdf',
        page: 12,
        snippet:
          'A binary search tree is a binary tree satisfying the BST property: for every node, its left subtree contains keys strictly less than the node key...',
        score: 0.93,
      },
      {
        id: 'cit-b',
        filename: 'CLRS_Ch12_Binary_Search_Trees.pdf',
        page: 34,
        snippet:
          'Search, insert, and delete on a BST of height h run in O(h) time. Balancing keeps h = O(log n)...',
        score: 0.87,
      },
    ],
  },
  {
    match: /(red.?black|avl|balanced)/i,
    content: `**Short answer:** prefer a **red-black tree** when *writes dominate*, an **AVL tree** when *reads dominate*.

- AVL is more strictly balanced: height $\\leq 1.44 \\log_2(n+2)$. Lookups are faster in practice.
- Red-black allows looser balance: height $\\leq 2 \\log_2(n+1)$, but amortized rotations per update are $O(1)$, versus up to $O(\\log n)$ for AVL.

**When to pick which:**

| Workload | Pick | Why |
|---|---|---|
| Mostly lookups (e.g. symbol table) | **AVL** | Tighter height ⇒ faster search |
| Mixed / write-heavy (e.g. \`std::map\`, Java \`TreeMap\`) | **Red-black** | Cheaper rebalancing |
| Ordered statistics | Either + subtree sizes | Both support augmentation |

The lecture notes include a benchmark table showing ~22% faster inserts for RB under 70%-write workloads.`,
    citations: [
      {
        id: 'cit-c',
        filename: 'Lecture_03_Binary_Trees.pdf',
        page: 28,
        snippet:
          'Red-black trees sacrifice strict balance for cheaper rebalancing cost. The amortized number of rotations per update is O(1).',
        score: 0.91,
      },
      {
        id: 'cit-d',
        filename: 'CLRS_Ch12_Binary_Search_Trees.pdf',
        page: 41,
        snippet:
          'AVL maintains |h(left) − h(right)| ≤ 1, giving a strictly tighter height bound than red-black trees.',
        score: 0.84,
      },
      {
        id: 'cit-e',
        filename: 'Tutorial_Red_Black_Trees.pdf',
        page: 6,
        snippet:
          'Benchmark (N=10⁶, 70% inserts, 30% lookups): red-black 1.22× faster end-to-end; AVL 1.08× faster for pure lookups.',
        score: 0.79,
      },
    ],
  },
  {
    match: /(hash|amortized|table)/i,
    content: `**Amortized analysis of dynamic hash table resizing** (doubling strategy):

Let \`c_i\` be the actual cost of the \`i\`-th insert. Define a potential function:

$$ \\Phi(D_i) = 2 \\cdot \\text{num}_i - \\text{size}_i $$

Then the amortized cost is

$$ \\hat{c}_i = c_i + \\Phi(D_i) - \\Phi(D_{i-1}) = 3 $$

for every insert — i.e. each operation is $O(1)$ amortized despite occasional $O(n)$ resizes.

**Key intuition:** each insert "pre-pays" 3 coins: 1 for itself, 1 reserved to eventually copy itself during a resize, 1 reserved to copy an existing element.`,
    citations: [
      {
        id: 'cit-f',
        filename: 'Lecture_03_Binary_Trees.pdf',
        page: 52,
        snippet:
          'Using the potential method Φ(D) = 2·num − size, the amortized cost of TABLE-INSERT is at most 3.',
        score: 0.88,
      },
    ],
  },
]

export function useMockChatStream(aiName: string) {
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<{ cancelled: boolean } | null>(null)

  const stream = async (
    prompt: string,
    onUpdate: (partial: ChatMessage) => void,
    onComplete: (final: ChatMessage) => void,
  ) => {
    setStreaming(true)
    abortRef.current = { cancelled: false }

    const match = canned.find((c) => c.match.test(prompt))
    const fullContent = match
      ? match.content
      : `Let me reason from the course materials ${aiName} has ingested.\n\nI don't see a strong match for that exact question in what's indexed so far — but here's my best interpretation:\n\n> "${prompt.slice(0, 160)}"\n\nIf you'd like, upload a relevant PDF to **Class Materials** and I'll ingest it within a minute, then we can revisit this.`
    const citations = match?.citations ?? []

    const id = `msg-${Date.now()}`
    const createdAt = new Date().toISOString()

    const msg: ChatMessage = {
      id,
      role: 'assistant',
      content: '',
      citations: [],
      createdAt,
      streaming: true,
    }
    onUpdate(msg)

    const tokens = tokenize(fullContent)
    let buf = ''
    for (let i = 0; i < tokens.length; i++) {
      if (abortRef.current?.cancelled) break
      buf += tokens[i]
      onUpdate({ ...msg, content: buf })
      await new Promise((r) =>
        setTimeout(r, Math.min(60, 8 + Math.random() * 30 + (tokens[i]?.length ?? 1) * 2)),
      )
    }

    const final: ChatMessage = {
      ...msg,
      content: buf,
      citations,
      streaming: false,
    }
    onUpdate(final)
    onComplete(final)
    setStreaming(false)
  }

  const cancel = () => {
    if (abortRef.current) abortRef.current.cancelled = true
    setStreaming(false)
  }

  return { stream, cancel, streaming }
}

function tokenize(s: string): string[] {
  // Split by runs of word chars / whitespace / punctuation to simulate token streaming
  return s.match(/(\s+|[\w`*_>#\-\/]+|[^\w\s])/g) ?? [s]
}
