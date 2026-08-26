import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, AlarmClock, GraduationCap, PenSquare } from 'lucide-react';
import {
  TaskGenerationScreen,
  useTaskAutoProgress,
  getTaskGenerationCopy,
  getWritingTips,
} from '@/features/task-generation';

interface GeneratedPromptResponse {
  promptText: string;
  suggestedTimeMinutes: number;
}

interface PromptContext {
  taskTypeId: number;
  examId: number;
  levelId: number;
  taskCode?: string | null;
  taskName?: string | null;
  taskDescription?: string | null;
  examCode?: string | null;
  levelCode?: string | null;
}

const TIP_ROTATION_INTERVAL_MS = 3500;

function GenerateAiPromptPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const hasFetched = useRef<boolean>(false);

  const [generatedPrompt, setGeneratedPrompt] = useState<GeneratedPromptResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [contextData, setContextData] = useState<PromptContext | null>(null);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);

  const hasGenerated = useRef(false);

  const { progress, setProgress, reset } = useTaskAutoProgress({ isActive: isLoading, preset: 'writingFast' });
  const copy = useMemo(
    () => getTaskGenerationCopy({ skill: 'writing', taskName: contextData?.taskName ?? contextData?.taskDescription }),
    [contextData?.taskName, contextData?.taskDescription],
  );
  const tips = useMemo(
    () =>
      getWritingTips({
        taskCode: contextData?.taskCode,
        examCode: contextData?.examCode,
        levelCode: contextData?.levelCode,
      }),
    [contextData?.taskCode, contextData?.examCode, contextData?.levelCode],
  );

  const wordCountLabel = useMemo(() => {
    if (!generatedPrompt?.promptText) return null;
    const rangeMatch = generatedPrompt.promptText.match(/(\d{2,3})\s*[-–]\s*(\d{2,3})\s+words/i);
    if (rangeMatch) {
      return `${rangeMatch[1]}–${rangeMatch[2]} words`;
    }
    const singleMatch = generatedPrompt.promptText.match(/(\d{2,3})\s+words/i);
    if (singleMatch) {
      return `${singleMatch[1]} words`;
    }
    return null;
  }, [generatedPrompt?.promptText]);

  const invokeGeneratePrompt = useCallback(async () => {
    if (!contextData) return;

    reset();
    setIsLoading(true);
    setError(null);
    setGeneratedPrompt(null);
    try {
      const { data, error: funcError } = await supabase.functions.invoke('generate-writing-exercise', {
        body: {
          taskTypeId: contextData.taskTypeId,
          examId: contextData.examId,
          levelId: contextData.levelId,
        },
      });

      if (funcError) {
        if (funcError.message.includes('Function timed out')) {
          throw new Error("The task generation is taking too long (timeout). Please try again later.");
        } else if (funcError.message.includes('Request failed with status code 500')) {
          throw new Error("There was an internal server error while generating the task. Please try again.");
        } else if (funcError.message.includes('Request failed with status code 400')) {
          throw new Error("There was a problem with the data sent to generate the task (Error 400).");
        } else if (funcError.message.includes('Request failed with status code 404')) {
          throw new Error("The generation function or requested data was not found (Error 404).");
        }
        throw new Error(`Error invoking function: ${funcError.message}`);
      }

      if (!data || typeof data.promptText !== 'string' || typeof data.suggestedTimeMinutes !== 'number') {
        console.error('Invalid data structure returned from edge function:');
        throw new Error("The generation function returned an unexpected response.");
      }

      setGeneratedPrompt(data as GeneratedPromptResponse);
      setProgress(100);

    } catch (error: unknown) {
      console.error("Error invoking edge function or processing response:");
      const displayError = error instanceof Error ? error.message : "Could not generate the task. Please try again.";
      setError(displayError);
      setGeneratedPrompt(null);
      reset();
    } finally {
      setIsLoading(false);
    }
  }, [contextData, reset, setProgress]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    const promptContext = location.state as PromptContext | null;

    if (!promptContext?.taskTypeId || !promptContext?.examId || !promptContext?.levelId) {
      setError("Required information not found. Please select the task type again.");
      setIsLoading(false);
      return;
    }

    setContextData({
      taskTypeId: promptContext.taskTypeId,
      examId: promptContext.examId,
      levelId: promptContext.levelId,
      taskCode: promptContext.taskCode ?? null,
      taskName: promptContext.taskName ?? null,
      taskDescription: promptContext.taskDescription ?? null,
      examCode: promptContext.examCode ?? null,
      levelCode: promptContext.levelCode ?? null,
    });
  }, [location.state]);

  useEffect(() => {
    if (!contextData || hasGenerated.current) return;
    hasGenerated.current = true;
    void invokeGeneratePrompt();
  }, [contextData, invokeGeneratePrompt]);

  useEffect(() => {
    if (!contextData) return;

    const needsMetadata = !contextData.taskCode || !contextData.taskName || !contextData.examCode || !contextData.levelCode;
    if (!needsMetadata) return;

    let isMounted = true;

    const enrichMetadata = async () => {
      try {
        const { data, error: metadataError } = await supabase
          .from('exam_task_types')
          .select(`
            task_code,
            name,
            description,
            exam_types!inner(code),
            levels!inner(code)
          `)
          .eq('id', contextData.taskTypeId)
          .maybeSingle();

        if (metadataError || !data) {
          console.warn('[GenerateAiPromptPage] Could not load writing task metadata');
          return;
        }

        const examType = Array.isArray(data.exam_types) ? data.exam_types[0] : data.exam_types;
        const level = Array.isArray(data.levels) ? data.levels[0] : data.levels;

        if (!isMounted) return;

        setContextData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            taskCode: data.task_code ?? prev.taskCode ?? null,
            taskName: data.name ?? prev.taskName ?? null,
            taskDescription: data.description ?? prev.taskDescription ?? null,
            examCode: (examType as { code?: string } | null | undefined)?.code ?? prev.examCode ?? null,
            levelCode: (level as { code?: string } | null | undefined)?.code ?? prev.levelCode ?? null,
          };
        });
      } catch (metadataException) {
        console.warn('[GenerateAiPromptPage] Failed to enrich writing task metadata');
      }
    };

    void enrichMetadata();

    return () => {
      isMounted = false;
    };
  }, [contextData]);

  useEffect(() => {
    if (tips.length <= 1) return undefined;
    const interval = window.setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % tips.length);
    }, TIP_ROTATION_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [tips]);

  useEffect(() => {
    setCurrentTipIndex(0);
  }, [tips]);

  const handleRetry = () => {
    if (!contextData) {
      setError("Cannot retrieve data to retry. Please select the task again.");
      return;
    }
    void invokeGeneratePrompt();
  };

  const handleStartWriting = () => {
    if (!generatedPrompt || !contextData) {
      setError("Internal error: Missing data to start writing.");
      return;
    }
    navigate('/editor', {
      state: {
        aiGeneratedPromptText: generatedPrompt.promptText,
        suggestedTimeMinutes: generatedPrompt.suggestedTimeMinutes,
        taskTypeId: contextData.taskTypeId,
        examId: contextData.examId,
        levelId: contextData.levelId
      }
    });
  };
  const metadataChips = useMemo(() => {
    const chips: Array<{ id: string; icon?: JSX.Element; label: string }> = [];

    if (contextData?.examCode) {
      chips.push({
        id: 'exam',
        icon: <GraduationCap className="h-3.5 w-3.5" aria-hidden />,
        label: contextData.examCode.replace(/_/g, ' '),
      });
    }

    if (contextData?.levelCode) {
      chips.push({
        id: 'level',
        label: `Level ${contextData.levelCode}`,
      });
    }

    if (wordCountLabel) {
      chips.push({
        id: 'word-count',
        label: wordCountLabel,
      });
    }

    if (generatedPrompt) {
      chips.push({
        id: 'time',
        icon: <AlarmClock className="h-3.5 w-3.5" aria-hidden />,
        label: `${generatedPrompt.suggestedTimeMinutes} min`,
      });
    }

    return chips;
  }, [contextData, wordCountLabel, generatedPrompt]);

  const renderError = () => (
    <Alert variant="destructive" className="mx-auto w-full max-w-2xl">
      <AlertCircle className="h-5 w-5" />
      <AlertTitle className="text-base font-semibold">Error Generating Task</AlertTitle>
      <AlertDescription className="mt-2 text-sm">
        {error}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button onClick={handleRetry} variant="destructive" size="sm" className="w-full sm:w-auto">
            Try again
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate('/select-ai-task-type')}
            size="sm"
            className="w-full sm:w-auto"
          >
            Choose another task
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );

  if (isLoading) {
    return (
      <TaskGenerationScreen
        title={copy.title}
        subtitle={copy.subtitle}
        statusText={copy.statusLabel}
        isLoading={true}
        progress={progress}
        tips={tips}
        tipsTitle={copy.tipsTitle}
        activeTipIndex={currentTipIndex}
        supportingCopy={copy.supportingCopy}
        monitorCopy={copy.monitorCopy}
      />
    );
  }

  if (error) {
    return (
      <div className="container mx-auto flex min-h-[calc(100vh-10rem)] items-start justify-center px-4 py-12">
        {renderError()}
      </div>
    );
  }

  if (!generatedPrompt) {
    return (
      <div className="container mx-auto flex min-h-[calc(100vh-10rem)] items-start justify-center px-4 py-12">
        <Alert className="w-full max-w-2xl">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No prompt available</AlertTitle>
          <AlertDescription>
            We could not display the generated task. Please try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto flex min-h-[calc(100vh-10rem)] items-start justify-center px-4 py-12">
      <Card className="mx-auto w-full max-w-3xl overflow-hidden shadow-sm" aria-labelledby="ai-writing-task-title">
        <CardHeader className="flex flex-col gap-4 border-b bg-slate-50 p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <PenSquare className="h-5 w-5" aria-hidden />
            </span>
            <div className="space-y-1">
              <CardTitle id="ai-writing-task-title" className="text-xl font-semibold">
                {contextData?.taskName ?? 'Your AI-generated task'}
              </CardTitle>
              <CardDescription>
                Read the instructions carefully and plan before you start writing.
              </CardDescription>
            </div>
          </div>

          {metadataChips.length ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {metadataChips.map(({ id, icon, label }) => (
                <Badge
                  key={id}
                  variant="outline"
                  className="flex items-center gap-2 rounded-full border-border/50 bg-white/80 px-3 py-1 text-xs font-medium text-slate-600"
                >
                  {icon}
                  <span className="whitespace-nowrap">{label}</span>
                </Badge>
              ))}
            </div>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-6 p-6">
          <div className="prose prose-slate max-w-none text-base leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {generatedPrompt.promptText}
            </ReactMarkdown>
          </div>
        </CardContent>

        <CardFooter className="border-t bg-slate-50/80 p-6">
          <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-center sm:gap-3">
            <Button onClick={handleStartWriting} size="lg" className="w-full sm:w-auto">
              Start Writing
            </Button>
            <Button variant="outline" size="lg" className="w-full sm:w-auto" onClick={handleRetry}>
              Generate another prompt
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="w-full sm:w-auto"
              onClick={() => navigate('/select-ai-task-type')}
            >
              Choose another task
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

export default GenerateAiPromptPage;
