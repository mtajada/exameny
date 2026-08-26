import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Lightbulb, Target } from 'lucide-react'

export interface TipItem {
  icon: string
  text: string
}

interface TipsCarouselProps {
  tips: TipItem[]
  activeIndex: number
  title: string
  fadeDurationMs?: number
}

const DEFAULT_FADE_DURATION_MS = 300

const TipsCarousel = ({ tips, activeIndex, title, fadeDurationMs = DEFAULT_FADE_DURATION_MS }: TipsCarouselProps) => {
  const hasTips = tips.length > 0
  const [displayedTip, setDisplayedTip] = useState<TipItem | null>(() => (hasTips ? tips[0] : null))
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [maxBodyHeight, setMaxBodyHeight] = useState(0)
  const measurementRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!hasTips) {
      setDisplayedTip(null)
      return
    }

    const safeIndex = activeIndex % tips.length
    const nextTip = tips[safeIndex]
    const isSameTip = displayedTip?.icon === nextTip.icon && displayedTip?.text === nextTip.text

    if (isSameTip) {
      return
    }

    setIsTransitioning(true)
    const timeout = window.setTimeout(() => {
      setDisplayedTip(nextTip)
      setIsTransitioning(false)
    }, fadeDurationMs)

    return () => window.clearTimeout(timeout)
  }, [activeIndex, fadeDurationMs, hasTips, tips, displayedTip])

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return

    const measure = () => {
      if (!measurementRef.current) return
      const items = Array.from(
        measurementRef.current.querySelectorAll<HTMLElement>('[data-tip-item]'),
      )
      const nextMax = items.reduce((acc, element) => Math.max(acc, element.getBoundingClientRect().height), 0)
      setMaxBodyHeight(nextMax)
    }

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [tips])

  if (!displayedTip) {
    return null
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600">
          <Lightbulb className="h-5 w-5" />
        </div>
        <h3 className="flex items-center justify-center gap-2 text-base font-semibold text-blue-900">
          <Target className="h-4 w-4" />
          {title}
        </h3>
        <div
          className="relative w-full"
          style={maxBodyHeight > 0 ? { minHeight: `${maxBodyHeight}px` } : undefined}
          aria-live="polite"
        >
          <div
            className={`flex items-start justify-center gap-3 text-blue-800 transition-opacity duration-300 ease-out ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}
          >
            <span className="text-lg" aria-hidden>
              {displayedTip.icon}
            </span>
            <span className="text-sm leading-relaxed">{displayedTip.text}</span>
          </div>
          <div
            ref={measurementRef}
            className="pointer-events-none absolute inset-x-0 top-0 flex w-full flex-col gap-3 opacity-0"
          >
            {tips.map((tip, index) => (
              <div
                key={`${tip.icon}-${index}`}
                data-tip-item
                className="flex items-start justify-center gap-3 text-blue-800"
              >
                <span className="text-lg" aria-hidden>
                  {tip.icon}
                </span>
                <span className="text-sm leading-relaxed">{tip.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default TipsCarousel
