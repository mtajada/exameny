import type { Components, ExtraProps } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface PrintableMarkdownProps {
  content: string
  emphasis?: boolean
}

const REMARK_PLUGINS = [remarkGfm]

type CodeProps = JSX.IntrinsicElements['code'] & ExtraProps & { inline?: boolean }

const stripClassName = <T extends { className?: string }>(props: T): Omit<T, 'className'> => {
  const { className: _className, ...rest } = props
  return rest
}

const MARKDOWN_COMPONENTS: Components = {
  p: ({ node, ...props }) => (
    <p className="printable-paragraph" {...stripClassName(props)} />
  ),
  ol: ({ node, ...props }) => (
    <ol className="printable-markdown__list printable-markdown__list--ordered" {...stripClassName(props)} />
  ),
  ul: ({ node, ...props }) => (
    <ul className="printable-markdown__list printable-markdown__list--unordered" {...stripClassName(props)} />
  ),
  li: ({ node, ...props }) => (
    <li className="printable-markdown__list-item" {...stripClassName(props)} />
  ),
  blockquote: ({ node, ...props }) => (
    <blockquote className="printable-markdown__blockquote" {...stripClassName(props)} />
  ),
  code: (rawProps) => {
    const { inline, node, ...props } = rawProps as CodeProps

    if (inline) {
      return <code className="printable-markdown__code" {...stripClassName(props)} />
    }
    return (
      <pre className="printable-markdown__pre">
        <code {...stripClassName(props)} />
      </pre>
    )
  },
  a: ({ node, ...props }) => (
    <a className="printable-markdown__link" {...stripClassName(props)} />
  ),
  strong: ({ node, ...props }) => (
    <strong className="printable-markdown__strong" {...stripClassName(props)} />
  ),
  em: ({ node, ...props }) => (
    <em className="printable-markdown__em" {...stripClassName(props)} />
  ),
}

export const PrintableMarkdown = ({ content, emphasis = false }: PrintableMarkdownProps) => (
  <div className={`printable-markdown${emphasis ? ' printable-markdown--emphasis' : ''}`}>
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      components={MARKDOWN_COMPONENTS}
      skipHtml
    >
      {content}
    </ReactMarkdown>
  </div>
)
