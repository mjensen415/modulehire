import { Node, mergeAttributes } from '@tiptap/core'
import Document from '@tiptap/extension-document'

// One resume line. Its provenance — the block id, the module it was written from, and the text
// generation produced — lives on the node as attributes, so it travels with the text through
// every edit and paste instead of being re-attached by position afterwards.
export const ResumeBullet = Node.create({
  name: 'resumeBullet',
  group: 'block',
  content: 'text*',
  marks: '',
  defining: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: el => el.getAttribute('data-block-id'),
        renderHTML: attrs => ({ 'data-block-id': attrs.id }),
      },
      module_id: {
        default: null,
        parseHTML: el => el.getAttribute('data-module-id'),
        renderHTML: attrs => (attrs.module_id ? { 'data-module-id': attrs.module_id } : {}),
      },
      original: {
        default: '',
        parseHTML: el => el.getAttribute('data-original') ?? '',
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'p[data-resume-bullet]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['p', mergeAttributes(HTMLAttributes, { 'data-resume-bullet': '' }), 0]
  },
})

// The block editor holds exactly one line.
export const SingleBulletDocument = Document.extend({ content: 'resumeBullet' })
