import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PrintableMarkdown } from '../components/PrintableMarkdown.tsx'

describe('PrintableMarkdown', () => {
  it('renders ordered lists when markdown contains numbered items', () => {
    const markdown = 'Write about:\n1. tourism benefits\n2. educational value\n3. your own idea'
    const { container } = render(<PrintableMarkdown content={markdown} />)

    const list = container.querySelector('ol')
    expect(list).not.toBeNull()
    expect(list?.querySelectorAll('li')).toHaveLength(3)
    expect(list?.firstElementChild?.textContent).toContain('tourism benefits')
  })

  it('applies emphasis styling when requested', () => {
    const { container } = render(<PrintableMarkdown content="Suggested time: 40 minutes" emphasis />)
    expect(container.querySelector('.printable-markdown--emphasis')).not.toBeNull()
  })
})
