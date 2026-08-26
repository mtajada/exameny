import { type ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Loader2, Brain } from 'lucide-react'
import TipsCarousel, { type TipItem } from './TipsCarousel'

interface TaskGenerationScreenProps {
  logoSrc?: string
  logoAlt?: string
  appName?: string
  title: string
  statusText: string
  isLoading: boolean
  progress: number
  tips: TipItem[]
  tipsTitle: string
  activeTipIndex: number
  subtitle?: string
  supportingCopy?: ReactNode
  monitorCopy?: string
  poweredByCopy?: string
  footerIcon?: ReactNode
  className?: string
}

const DEFAULT_APP_NAME = 'EXAMENY'
const DEFAULT_MONITOR_COPY = 'AI usage is monitored. Please keep the tab open until the exercise is ready.'
const DEFAULT_POWERED_BY = 'Powered by Exameny'

const TaskGenerationScreen = ({
  logoSrc = '/favicon.svg',
  logoAlt = 'Exameny Logo',
  appName = DEFAULT_APP_NAME,
  title,
  statusText,
  isLoading,
  progress,
  tips,
  tipsTitle,
  activeTipIndex,
  subtitle,
  supportingCopy,
  monitorCopy = DEFAULT_MONITOR_COPY,
  poweredByCopy = DEFAULT_POWERED_BY,
  footerIcon = <Brain className="h-3 w-3" />,
  className,
}: TaskGenerationScreenProps) => {
  return (
    <div className={`container mx-auto max-w-2xl min-h-screen flex items-center justify-center p-4 py-8 ${className ?? ''}`}>
      <Card className="w-full">
        <CardHeader className="pb-4 text-center">
          <div className="mx-auto mb-4 flex items-center justify-center">
            <img src={logoSrc} alt={logoAlt} className="h-12 w-12 object-contain" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">{appName}</CardTitle>
          <CardDescription className="mt-2 flex items-center justify-center gap-2 text-base">
            <Loader2 className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{title}</span>
          </CardDescription>
          {subtitle ? (
            <p className="mt-2 text-sm text-gray-600">{subtitle}</p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>{statusText}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" aria-label="Generation progress" />
          </div>

          {supportingCopy ? (
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              {supportingCopy}
            </div>
          ) : null}

          <TipsCarousel tips={tips} activeIndex={activeTipIndex} title={tipsTitle} />

          <p className="mt-3 text-center text-xs text-blue-700">{monitorCopy}</p>
          <div className="pt-4 text-center">
            <p className="flex items-center justify-center gap-1 text-xs text-gray-500">
              {footerIcon}
              {poweredByCopy}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default TaskGenerationScreen
