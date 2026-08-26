import * as React from "react"
import { cn } from "@/lib/utils.ts"

export interface AutoResizeTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  minRows?: number
  maxRows?: number
}

const AutoResizeTextarea = React.forwardRef<HTMLTextAreaElement, AutoResizeTextareaProps>(
  ({ className, minRows = 1, maxRows = 8, value, onChange, ...props }, ref) => {
    const textareaRef = React.useRef<HTMLTextAreaElement>(null)
    const isResizing = React.useRef(false)

    // Combine external ref with internal ref
    React.useImperativeHandle(ref, () => textareaRef.current!)

    // Simplified auto-resize function without useCallback to prevent dependency issues
    const resizeTextarea = () => {
      const textarea = textareaRef.current
      if (!textarea || isResizing.current) return

      isResizing.current = true

      // Use requestAnimationFrame to prevent layout thrashing
      requestAnimationFrame(() => {
        try {
          // Reset height to calculate new scroll height
          textarea.style.height = 'auto'

          // Calculate the new height based on content
          const scrollHeight = textarea.scrollHeight
          const computedStyle = getComputedStyle(textarea)
          const lineHeight = parseInt(computedStyle.lineHeight) || 20
          const paddingTop = parseInt(computedStyle.paddingTop) || 0
          const paddingBottom = parseInt(computedStyle.paddingBottom) || 0
          const borderTop = parseInt(computedStyle.borderTopWidth) || 0
          const borderBottom = parseInt(computedStyle.borderBottomWidth) || 0

          const totalPadding = paddingTop + paddingBottom + borderTop + borderBottom
          const minHeight = (lineHeight * minRows) + totalPadding
          const maxHeight = (lineHeight * maxRows) + totalPadding

          // Set the new height within bounds
          const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight)
          textarea.style.height = `${newHeight}px`
        } catch (error) {
          // Graceful error handling
          if (import.meta.env.DEV) {
            console.warn('AutoResizeTextarea resize failed:')
          }
        } finally {
          isResizing.current = false
        }
      })
    }

    // Enhanced onChange handler that includes resize logic
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (onChange) {
        onChange(e)
      }
      // Resize after the change is processed
      setTimeout(resizeTextarea, 0)
    }

    // Resize when value changes (for controlled components)
    React.useEffect(() => {
      resizeTextarea()
    }, [value, minRows, maxRows]) // eslint-disable-line react-hooks/exhaustive-deps

    // Initial resize on mount with proper cleanup
    React.useEffect(() => {
      const timer = setTimeout(resizeTextarea, 0)
      return () => {
        clearTimeout(timer)
        isResizing.current = false
      }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    return (
      <textarea
        ref={textareaRef}
        className={cn(
          "flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        rows={minRows}
        value={value || ""}
        onChange={handleChange}
        {...props}
      />
    )
  }
)

AutoResizeTextarea.displayName = "AutoResizeTextarea"

export { AutoResizeTextarea }
