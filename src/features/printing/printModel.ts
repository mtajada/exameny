import type {
  BuildRuoEDocumentParams,
  BuildWritingDocumentParams,
  PrintableDocument,
} from './types.ts'
import { buildWritingDocument } from './builders/writing.ts'
import { buildRuoEDocument } from './builders/ruoe.ts'

export type {
  PrintableDocument,
  PrintableDocumentMetadata,
  PrintableDocumentSettings,
  PrintablePage,
  PrintablePageRole,
  PrintableOrientation,
  PrintableSection,
  PrintableTextSection,
  PrintablePassageSection,
  PrintableQuestionSection,
  PrintableQuestion,
  PrintableQuestionOption,
  PrintableOptionsSection,
  PrintableOptionItem,
  PrintableTableSection,
  PrintableTableColumn,
  PrintableTableRow,
  PrintableTableCell,
  PrintableMultipleTextsSection,
  PrintableSubText,
  PrintableSpacerSection,
  ExerciseDataShape,
} from './types.ts'

export { buildWritingDocument, buildRuoEDocument }

export const buildPrintableDocument = (
  params: BuildWritingDocumentParams | (BuildRuoEDocumentParams & { variant: 'ruoe' }),
): PrintableDocument => {
  if ('exerciseData' in params) {
    // RUoE variant
    return buildRuoEDocument(params)
  }

  return buildWritingDocument(params)
}
