'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import Text from '@tiptap/extension-text'
import { UndoRedo, Placeholder } from '@tiptap/extensions'
import { ResumeBullet, SingleBulletDocument } from './ResumeBulletNode'
import type { Block } from '@/lib/resume-doc'

type Props = {
  block: Block
  placeholder?: string
  style?: React.CSSProperties
  /** Every keystroke, with the block as the node now holds it (provenance from node attrs). */
  onChange: (block: Block) => void
  /** Enter, Esc or blur. */
  onFinish: () => void
  /** ⌘. — move focus to the floating toolbar. */
  onOpenToolbar?: () => void
  /** "/" typed at the start of an empty line — open "Ask AI". */
  onSlash?: () => void
}

// The editor for the one block being edited. Only the clicked block mounts one; the rest of
// the page is static text, so a click edits exactly one line.
export default function BlockEditor({ block, placeholder, style, onChange, onFinish, onOpenToolbar, onSlash }: Props) {
  const callbacks = useRef({ onChange, onFinish, onOpenToolbar, onSlash })
  useEffect(() => { callbacks.current = { onChange, onFinish, onOpenToolbar, onSlash } })

  const keys = useMemo(() => Extension.create({
    name: 'resumeBlockKeys',
    addKeyboardShortcuts() {
      return {
        Enter: () => { callbacks.current.onFinish(); return true },
        'Shift-Enter': () => true, // one line per block
        Escape: () => { callbacks.current.onFinish(); return true },
        'Mod-.': () => { callbacks.current.onOpenToolbar?.(); return true },
        '/': ({ editor }) => {
          if (!editor.state.doc.textContent && callbacks.current.onSlash) { callbacks.current.onSlash(); return true }
          return false
        },
      }
    },
  }), [])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      SingleBulletDocument,
      ResumeBullet,
      Text,
      UndoRedo,
      Placeholder.configure({ placeholder: placeholder ?? 'Type a line, or / to ask AI' }),
      keys,
    ],
    content: {
      type: 'doc',
      content: [{
        type: 'resumeBullet',
        attrs: { id: block.id, module_id: block.module_id, original: block.original },
        content: block.text ? [{ type: 'text', text: block.text }] : [],
      }],
    },
    autofocus: 'end',
    editorProps: {
      attributes: { class: 'resume-block-editor', spellcheck: 'true' },
      // Keep it one line: pasted paragraphs become spaces, and only plain text comes in, so the
      // node (and its provenance attrs) is never replaced by pasted structure.
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData('text/plain') ?? ''
        view.dispatch(view.state.tr.insertText(text.replace(/\s*\n+\s*/g, ' ')))
        return true
      },
    },
    onUpdate: ({ editor }) => {
      const node = editor.state.doc.firstChild
      if (!node) return
      callbacks.current.onChange({
        id: node.attrs.id,
        module_id: node.attrs.module_id,
        original: node.attrs.original,
        text: node.textContent,
      })
    },
    onBlur: ({ event }) => {
      // Clicks inside the toolbar keep the block open.
      const next = (event as FocusEvent).relatedTarget as HTMLElement | null
      if (next?.closest('[data-resume-toolbar]')) return
      callbacks.current.onFinish()
    },
  })

  // Text replaced from outside while editing (AI rewrite, Original, a suggestion): sync it in
  // as one undoable step.
  useEffect(() => {
    if (!editor) return
    const current = editor.state.doc.firstChild?.textContent ?? ''
    if (current !== block.text) {
      editor.commands.setContent({
        type: 'doc',
        content: [{
          type: 'resumeBullet',
          attrs: { id: block.id, module_id: block.module_id, original: block.original },
          content: block.text ? [{ type: 'text', text: block.text }] : [],
        }],
      }, { emitUpdate: false })
      editor.commands.focus('end')
    }
  }, [editor, block.text, block.id, block.module_id, block.original])

  return <EditorContent editor={editor} style={style} />
}
