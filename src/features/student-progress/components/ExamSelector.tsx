import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.tsx'

export type ExamOption = { value: string; label: string; maxScore: number }

interface ExamSelectorProps {
  options: ExamOption[]
  value: string | null
  onChange: (value: string) => void
  disabled?: boolean
}

export function ExamSelector({ options, value, onChange, disabled }: ExamSelectorProps) {
  if (!options || options.length === 0) return null

  return (
    <div className="mx-auto w-full max-w-sm">
      <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="bg-white/80 backdrop-blur-sm">
          <SelectValue placeholder="Select exam" />
        </SelectTrigger>
        <SelectContent className="rounded-md border-gray-100 bg-white shadow-md">
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-sm">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export default ExamSelector
