import type {
  PrintableDocument,
  PrintableDocumentMetadata,
  PrintablePage,
  PrintableSection,
  PrintableQuestion,
  PrintableQuestionSection,
  PrintableQuestionOption,
  PrintableOptionItem,
  PrintableTableColumn,
  PrintableParagraph,
} from '../types.ts'
import '../styles/print.css'
import { PrintableMarkdown } from './PrintableMarkdown.tsx'

const formatTaskSectionLabel = (metadata: PrintableDocumentMetadata): string => {
  const code = metadata.taskCode?.trim()
  if (!code) {
    return metadata.taskName?.trim() ?? metadata.examName?.trim() ?? ''
  }

  const normalized = code.toUpperCase()
  const segments = normalized.split('_')
  const findNumericSegment = (pattern: RegExp) => {
    const match = segments.find((segment) => pattern.test(segment))
    if (!match) return null
    const value = Number(match.replace(pattern, '$1'))
    return Number.isNaN(value) ? null : value
  }

  const partNumber = findNumericSegment(/^P(\d+)$/)
  const taskNumber = findNumericSegment(/^T(\d+)$/)
  const hasReadingOrUseOfEnglish = segments.some((segment) => segment === 'READ' || segment === 'UOE')
  const hasWritingKeyword = segments.some((segment) => segment === 'WRITE' || segment === 'WRITING')

  if (hasReadingOrUseOfEnglish) {
    if (partNumber !== null) {
      return `Reading and Use of English - Part ${partNumber}`
    }
    return 'Reading and Use of English'
  }

  if (hasWritingKeyword) {
    if (partNumber !== null) {
      return `Writing - Part ${partNumber}`
    }
    if (taskNumber !== null) {
      return `Writing - Task ${taskNumber}`
    }
    return 'Writing'
  }

  if (partNumber !== null) {
    return `Writing - Part ${partNumber}`
  }

  if (taskNumber !== null) {
    return `Writing - Task ${taskNumber}`
  }

  if (metadata.taskName?.trim()) {
    return `Writing - ${metadata.taskName.trim()}`
  }

  return metadata.examName?.trim() ?? code
}

interface PrintableExerciseDocumentProps {
  document: PrintableDocument
  includeAnswerKey: boolean
  mode: 'preview' | 'print'
}

export const PrintableExerciseDocument = ({ document, includeAnswerKey, mode }: PrintableExerciseDocumentProps) => {
  const filteredPages = document.pages.filter((page) => includeAnswerKey || page.role !== 'answer-key')

  const renderedPages: Array<JSX.Element> = []

  filteredPages.forEach((page, index) => {
    const isAnswerKey = page.role === 'answer-key'
    const previousPage = filteredPages[index - 1]
    if (mode === 'preview' && isAnswerKey && previousPage && previousPage.role !== 'answer-key') {
      renderedPages.push(
        <div key={`${page.id}-break`} className="printable-page-break printable-page-break--between-pages" aria-hidden="true" />,
      )
    }

    renderedPages.push(
      <PrintablePageView
        key={page.id}
        page={page}
        metadata={document.metadata}
        mode={mode}
      />,
    )
  })

  return (
    <div className={`printable-document printable-document--${mode}`}>
      {renderedPages}
    </div>
  )
}

interface PrintablePageViewProps {
  page: PrintablePage
  metadata: PrintableDocumentMetadata
  mode: 'preview' | 'print'
}

const PrintablePageView = ({ page, metadata, mode }: PrintablePageViewProps) => {
  const isStudentPage = page.role === 'student'
  const localeDate = new Date().toLocaleDateString()
  const headerLabel = metadata.taskName?.trim() || metadata.examName || metadata.taskCode
  const examLabel = metadata.examName?.trim() || metadata.taskName || metadata.taskCode
  const sectionLabel = formatTaskSectionLabel(metadata)

  return (
    <article
      className={`printable-page printable-page--${mode}`}
      data-orientation={page.orientation}
      data-role={page.role}
    >
      <header className="printable-page__header">
        <div className="printable-page__brand">
          <img src="/exameny-logo.svg" alt="Exameny" className="printable-page__logo" />
          <div>
            <p className="printable-page__header-label">{headerLabel}</p>
          </div>
        </div>
        <div className="printable-page__task">
          <p className="printable-page__task-name">{examLabel}</p>
          {sectionLabel && <p className="printable-page__task-code">{sectionLabel}</p>}
        </div>
      </header>

      {isStudentPage && (
        <section className="printable-page__student-fields">
          <div className="printable-page__field">
            <span>Student Name</span>
            <span className="printable-page__line" aria-hidden />
          </div>
          <div className="printable-page__field">
            <span>Date</span>
            <span className="printable-page__line" aria-hidden>{localeDate}</span>
          </div>
        </section>
      )}

      <main className="printable-page__content">
        {page.sections.map((section, index) => (
          <PrintableSectionRenderer
            key={`${page.id}-${index}`}
            section={section}
          />
        ))}
      </main>
    </article>
  )
}

const PrintableParagraphRenderer = ({ paragraph }: { paragraph: PrintableParagraph }) => {
  const format = paragraph.format ?? 'plain'

  if (format === 'markdown') {
    return <PrintableMarkdown content={paragraph.text} emphasis={Boolean(paragraph.emphasis)} />
  }

  const className = paragraph.emphasis ? 'printable-paragraph printable-paragraph--emphasis' : 'printable-paragraph'
  return <p className={className}>{paragraph.text}</p>
}

const PrintableSectionRenderer = ({
  section,
}: {
  section: PrintableSection
}) => {
  switch (section.type) {
    case 'text':
      return (
        <section className={`printable-section printable-section--text printable-section--${section.style ?? 'default'}`}>
          {section.heading && <h2 className="printable-section__heading">{section.heading}</h2>}
          {section.paragraphs.map((paragraph, index) => (
            <PrintableParagraphRenderer key={index} paragraph={paragraph} />
          ))}
        </section>
      )
    case 'passage':
      return (
        <section className="printable-section printable-section--passage">
          {section.heading && <h2 className="printable-section__heading">{section.heading}</h2>}
          {section.paragraphs.map((paragraph, index) => (
            <PrintableParagraphRenderer key={index} paragraph={paragraph} />
          ))}
        </section>
      )
    case 'questions':
      return <PrintableQuestionSectionView section={section} />
    case 'options':
      return (
        <section className="printable-section printable-section--options">
          {section.heading && <h2 className="printable-section__heading">{section.heading}</h2>}
          {section.note && <p className="printable-paragraph printable-paragraph--instructions">{section.note}</p>}
          <div className={`printable-options printable-options--cols-${section.columns ?? 1}`}>
            {section.items.map((item) => (
              <div key={item.label} className="printable-option">
                <span className="printable-option__label">{item.label}</span>
                <span className="printable-option__text">{item.text}</span>
              </div>
            ))}
          </div>
        </section>
      )
    case 'table':
      return (
        <section className="printable-section printable-section--table" data-variant={section.variant ?? 'default'}>
          {section.heading && <h2 className="printable-section__heading">{section.heading}</h2>}
          <table className={`printable-table printable-table--${section.variant ?? 'default'}`}>
            <thead>
              <tr>
                {section.columns.map((column) => (
                  <th key={column.id} className={`printable-table__cell printable-table__cell--head printable-table__cell--${column.align ?? 'left'}`}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.cells.map((cell, cellIndex) => (
                    <td key={cellIndex} className={`printable-table__cell printable-table__cell--${section.columns[cellIndex]?.align ?? 'left'} ${cell.emphasis ? 'printable-table__cell--emphasis' : ''}`}>
                      {cell.value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {section.caption && <p className="printable-table__caption">{section.caption}</p>}
        </section>
      )
    case 'multi-text':
      return (
        <section className="printable-section printable-section--multi-text">
          {section.heading && <h2 className="printable-section__heading">{section.heading}</h2>}
          <div className="printable-multi-text-grid">
            {section.texts.map((text) => (
              <article key={text.label} className="printable-multi-text">
                <header className="printable-multi-text__header">
                  <span className="printable-multi-text__label">{text.label}</span>
                  {text.title && <h3 className="printable-multi-text__title">{text.title}</h3>}
                </header>
                {text.paragraphs.map((paragraph, index) => (
                  <PrintableParagraphRenderer key={index} paragraph={paragraph} />
                ))}
              </article>
            ))}
          </div>
        </section>
      )
    case 'spacer':
      return <div className={`printable-spacer printable-spacer--${section.size}`} />
    case 'page-break':
      return <div className="printable-page-break" aria-hidden="true" />
    default:
      return null
  }
}

const PrintableQuestionSectionView = ({ section }: { section: PrintableQuestionSection }) => {
  const variant = section.variant ?? 'default'

  const content = renderQuestionLists(section.questions, section.layout ?? 'single-column', variant)

  return (
    <section
      className="printable-section printable-section--questions"
      data-variant={variant}
    >
      {section.heading && <h2 className="printable-section__heading">{section.heading}</h2>}
      {section.instructions && <p className="printable-paragraph printable-paragraph--instructions">{section.instructions}</p>}
      {content}
    </section>
  )
}

const renderQuestionLists = (
  questions: PrintableQuestion[],
  layout: 'single-column' | 'two-column',
  variant: 'default' | 'solution',
) => {
  const renderList = (items: PrintableQuestion[], start: number | undefined, key: string) => (
    <ol
      key={key}
      className={`printable-question-list${layout === 'two-column' ? ' printable-question-list--two-column' : ''}`}
      data-variant={variant}
      start={start}
    >
      {items.map((question) => (
        <li key={question.number} className="printable-question">
          <div className="printable-question__container">
            <PrintableQuestionView question={question} variant={variant} />
          </div>
        </li>
      ))}
    </ol>
  )

  if (layout !== 'two-column') {
    return renderList(questions, undefined, 'single-column')
  }

  const columnCount = 2
  const columnSize = Math.ceil(questions.length / columnCount) || 1
  const columns = Array.from({ length: columnCount }, (_, columnIndex) => {
    const sliceStart = columnIndex * columnSize
    const sliceEnd = sliceStart + columnSize
    return questions.slice(sliceStart, sliceEnd)
  }).filter((column) => column.length > 0)

  return (
    <div className="printable-question-columns">
      {columns.map((column, index) => {
        const start = column[0]?.number
        return renderList(column, start, `column-${index}`)
      })}
    </div>
  )
}

const PrintableQuestionView = ({ question, variant }: { question: PrintableQuestion; variant: 'default' | 'solution' }) => {
  const isSolution = variant === 'solution'
  const answerText = Array.isArray(question.answer) ? question.answer.join(', ') : question.answer
  const solutionLabel = question.answerLabel
  const isKeywordTransformation = Boolean(
    question.keyWord &&
    question.transformationSentence &&
    (question.originalSentence || question.prompt),
  )
  const responseLabel = !isSolution ? question.responseLabel : null
  const responseVariant = question.responseVariant ?? 'single-line'

  return (
    <div className="printable-question__body" data-variant={variant}>
      {isKeywordTransformation ? (
        <>
          <p className="printable-paragraph">
            <span className="printable-question__number">{question.number}.</span>{' '}
            {question.originalSentence || question.prompt}
          </p>
          {question.keyWord && (
            <p className="printable-paragraph printable-paragraph--keyword">Key word: {question.keyWord}</p>
          )}
          {question.transformationSentence && (
            <p className="printable-paragraph printable-paragraph--context printable-paragraph--transformation">
              {question.transformationSentence}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="printable-paragraph">
            <span className="printable-question__number">{question.number}.</span> {question.prompt}
          </p>
          {question.keyWord && (
            <p className="printable-paragraph printable-paragraph--keyword">Key word: {question.keyWord}</p>
          )}
          {question.originalSentence && (
            <p className="printable-paragraph printable-paragraph--context">{question.originalSentence}</p>
          )}
          {question.transformationSentence && (
            <p className="printable-paragraph printable-paragraph--context">{question.transformationSentence}</p>
          )}
        </>
      )}
      {question.options && question.options.length > 0 && (
        <ul className="printable-option-list" data-variant={variant}>
          {question.options.map((option) => {
            const isCorrect = Boolean(isSolution && option.isCorrect)
            return (
              <li
                key={option.label}
                className={`printable-option-list__item${isCorrect ? ' printable-option-list__item--correct' : ''}`}
                data-correct={isCorrect ? 'true' : undefined}
              >
                {isCorrect && (
                  <span className="printable-option__marker" aria-hidden="true">
                    ✓
                  </span>
                )}
                <span className="printable-option__label">{option.label}</span>
                <span className="printable-option__text">{option.text}</span>
              </li>
            )
          })}
        </ul>
      )}
      {!isSolution && responseLabel && (
        <div
          className={`printable-question__response printable-question__response--${responseVariant}`}
          aria-label={responseLabel}
        >
          <span className="printable-question__response-label">{responseLabel}</span>
          <span className="printable-question__response-line" aria-hidden />
        </div>
      )}
      {isSolution && (answerText || solutionLabel) && (
        <p className="printable-paragraph printable-paragraph--solution">
          Correct answer:{' '}
          {solutionLabel ? (
            <span className="printable-solution__value">
              {solutionLabel}
              {answerText ? ` — ${answerText}` : ''}
            </span>
          ) : (
            <span className="printable-solution__value">{answerText}</span>
          )}
        </p>
      )}
      {isSolution && answerText && (
        <p
          className="printable-paragraph printable-paragraph--hidden-answer"
          data-answer={answerText}
        />
      )}
    </div>
  )
}
