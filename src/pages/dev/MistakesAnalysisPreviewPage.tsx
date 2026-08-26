import { MistakesAnalysisCard } from '@/components/evaluation/MistakesAnalysisCard'

const MistakesAnalysisPreviewPage = () => {
  return (
    <div className="min-h-screen bg-muted/40 py-12">
      <div className="container mx-auto max-w-4xl space-y-6 px-4">
        <header className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Development preview</p>
          <h1 className="text-3xl font-semibold text-foreground">Mistakes Analysis — Dense Example</h1>
          <p className="text-muted-foreground">
            This page is available only in development and showcases the Mistakes Analysis card populated with multiple
            mistakes per category.
          </p>
        </header>
        <MistakesAnalysisCard submissionId="debug-preview" debugPreset="dense" />
      </div>
    </div>
  )
}

export default MistakesAnalysisPreviewPage
