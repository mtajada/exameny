import { ChangeEvent, useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { Loader2, AlertCircle, Camera } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { cn } from '@/lib/utils.ts'

interface TaskPromptUploaderProps {
  onTextTranscribed: (text: string) => void
  disabled?: boolean
  examName?: string
  levelName?: string
  taskTypeName?: string
  className?: string
}

type TranscribeResponse = {
  transcribedText?: string
  error?: string
}

const MAX_IMAGE_SIZE_MB = 7
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Unexpected file reader result'))
        return
      }
      const base64 = result.split(',')[1]
      if (base64) resolve(base64)
      else reject(new Error('Error converting image to Base64'))
    }
    reader.onerror = () => reject(new Error('Error reading image file'))
    reader.readAsDataURL(file)
  })
}

const TaskPromptUploader = ({
  onTextTranscribed,
  disabled,
  examName,
  levelName,
  taskTypeName,
  className,
}: TaskPromptUploaderProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleButtonClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleImageChange = useCallback(async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    setError(null)
    const file = event.target.files?.[0] || null
    event.target.value = ''

    if (!file) return

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      setError('Unsupported file type. Please select a JPG, PNG, or WEBP image.')
      return
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setError(`The image is too large (max. ${MAX_IMAGE_SIZE_MB}MB).`)
      return
    }

    setIsLoading(true)
    try {
      const imageData = await readFileAsBase64(file)

      const { data, error } = await supabase.functions.invoke<TranscribeResponse>('transcribe-image-prompt', {
        body: {
          imageData,
          mimeType: file.type,
          examName,
          levelName,
          taskTypeName,
        },
      })

      if (error) throw new Error(error.message || 'Failed to transcribe the image.')
      const { transcribedText } = data ?? {}
      if (typeof transcribedText !== 'string') {
        throw new Error(data?.error || 'No transcribed text received.')
      }

      // Empty string is a valid sentinel for "nothing to transcribe".
      onTextTranscribed(transcribedText)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to transcribe the image.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [examName, levelName, taskTypeName, onTextTranscribed])

  return (
    <div className={cn('my-4', className)}>
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleImageChange}
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        hidden
        aria-hidden="true"
      />
      <Button
        type="button"
        onClick={handleButtonClick}
        disabled={isLoading || disabled}
        variant="outline"
        className="justify-center w-full px-4 py-2 h-11 sm:h-10 sm:w-auto"
      >
        {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Camera className="mr-2 h-5 w-5" />}
        Import Prompt from Image
      </Button>
      {error && (
        <p className="mt-2 flex items-center text-sm text-red-600">
          <AlertCircle className="mr-1 h-4 w-4" />
          {error}
        </p>
      )}
    </div>
  )
}

export default TaskPromptUploader
