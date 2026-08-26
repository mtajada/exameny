import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getRuoELayoutKey, isReadingLayout } from '@/config/ruoeFunctionMap';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal, BookOpen, Type, Newspaper, Star, Mail, FileText, Edit3 } from 'lucide-react';

// Define the structure for the task type data
type TaskType = {
  id: number; // Corresponds to exam_task_type_id
  name: string;
  description: string | null;
  task_code: string; // Added to include task_code from database
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isTaskType = (value: unknown): value is TaskType => {
  if (!isPlainRecord(value)) {
    return false;
  }
  return typeof value.id === 'number'
    && typeof value.name === 'string'
    && typeof value.task_code === 'string'
    && (value.description === null || typeof value.description === 'string');
};

function SelectAiTaskTypePage() {
  const navigate = useNavigate();
  const { user, activeMembershipId, userPreferences } = useAuth();
  const [searchParams] = useSearchParams();

  // Check if this is R&UoE mode
  const isRuoEMode = searchParams.get('type') === 'ruoe';

  const [availableTaskTypes, setAvailableTaskTypes] = useState<TaskType[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const targetExamId = userPreferences?.targetExamId ?? null;
  const targetLevelId = userPreferences?.targetLevelId ?? null;

  const isPetExam = isRuoEMode &&
    targetExamId === 1 &&
    targetLevelId === 1;

  const writingMicrocopy = useMemo<Record<string, string>>(() => ({
    'essay': 'Develop a balanced argument with a clear position and supporting ideas.',
    'article': 'Inform or entertain a general audience with an engaging tone and structure.',
    'review': 'Evaluate a book, film, or event with opinion and recommendations.',
    'report': 'Present information objectively with headings and clear recommendations.',
    'letter': 'Address the recipient appropriately; adapt tone and register to the purpose.',
    'email': 'Address the recipient appropriately; adapt tone and register to the purpose.',
  }), []);

  useEffect(() => {
    const fetchData = async () => {
      if (!user?.id) {
        setError("User not authenticated.");
        setIsLoading(false);
        return;
      }

      if (activeMembershipId == null) {
        setError("Could not determine your academy membership.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      setAvailableTaskTypes(null);

      try {
        if (targetExamId == null || targetLevelId == null) {
          throw new Error('Could not load your exam and level preferences. Please complete your profile setup.');
        }

        // Fetch Task Types based on user preferences (global goals live in user_preferences)
        let taskTypesQuery = supabase
          .from('exam_task_types')
          .select('id, name, description, task_code')
          .eq('exam_type_id', targetExamId)
          .eq('level_id', targetLevelId);

        // Filter task types based on mode
        if (isRuoEMode) {
          // R&UoE only
          taskTypesQuery = taskTypesQuery.or('task_code.like.%UOE%,task_code.like.%READ%');
        } else {
          // Writing only
          taskTypesQuery = taskTypesQuery.not('task_code', 'like', '%UOE%').not('task_code', 'like', '%READ%');
        }

        const { data: taskTypesData, error: taskTypesError } = await taskTypesQuery.order('name');

        if (taskTypesError) {
          // console.error("Error fetching task types:", taskTypesError);
          throw new Error(`Could not load task types: ${taskTypesError.message}`);
        }

        // console.log('Task types fetched:', taskTypesData);
        const taskTypes = Array.isArray(taskTypesData)
          ? taskTypesData.filter(isTaskType)
          : [];
        setAvailableTaskTypes(taskTypes);

      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
        // console.error('Error in fetchData:', error);
        setError(message);
        setAvailableTaskTypes([]); // Set empty array on error to prevent incorrect rendering
      } finally {
        setIsLoading(false);
        // console.log('Fetching complete.');
      }
    };

    fetchData();
  }, [user, isRuoEMode, activeMembershipId, targetExamId, targetLevelId]); // Re-run if auth, preferences, membership, or mode changes

  // --- Navigation Handler (Step 7) --- //
  const handleTaskTypeSelect = async (selectedTaskTypeId: number) => {
    if (targetExamId == null || targetLevelId == null) {
      console.error('Attempted to navigate without target exam/level.');
      setError('Internal error: Exam and level preferences not found to continue.');
      return; // Prevent navigation without necessary data
    }

    // Find the selected task type to get additional context
    const selectedTaskType = availableTaskTypes?.find(taskType => taskType.id === selectedTaskTypeId);

    if (isRuoEMode) {
      // For R&UoE mode, navigate to dedicated generation page with loading screen
      navigate('/generate-ruoe-exercise', {
        state: {
          taskTypeId: selectedTaskTypeId,
          examId: targetExamId,
          levelId: targetLevelId,
          taskCode: selectedTaskType?.task_code,
          taskName: selectedTaskType?.name
        }
      });
    } else {
      // For writing mode, use existing navigation
      navigate('/generate-ai-prompt', {
        state: {
          taskTypeId: selectedTaskTypeId,
          examId: targetExamId,
          levelId: targetLevelId,
          taskCode: selectedTaskType?.task_code,
          taskName: selectedTaskType?.name,
          taskDescription: selectedTaskType?.description,
        }
      });
    }
  };

  const readingTaskTypes = useMemo(() => {
    return (availableTaskTypes || [])
      .filter((tt) => {
        if (!tt.task_code) return false;
        try {
          return isReadingLayout(getRuoELayoutKey(tt.task_code));
        } catch {
          return false;
        }
      })
      .sort((a, b) => a.task_code.localeCompare(b.task_code));
  }, [availableTaskTypes]);

  const uoeTaskTypes = useMemo(() => {
    return (availableTaskTypes || [])
      .filter((tt) => {
        if (!tt.task_code) return false;
        try {
          const layout = getRuoELayoutKey(tt.task_code);
          return !isReadingLayout(layout);
        } catch {
          return false;
        }
      })
      .sort((a, b) => a.task_code.localeCompare(b.task_code));
  }, [availableTaskTypes]);

  const formatRuoeDisplayName = useCallback((name: string | null | undefined) => {
    if (!name) return '';
    const cleaned = name.replace(/^(?:R&UoE\s+)/i, '').trimStart();
    return cleaned.length > 0 ? cleaned : name;
  }, []);

  const ruoeNameOverrides = useMemo<Record<string, string>>(() => {
    if (!isPetExam) return {};
    return {
      B1_LANG_MC_CLOZE: 'Part 5: Use of English – Multiple-choice cloze',
      B1_LANG_OPEN_CLOZE: 'Part 6: Use of English – Open cloze',
    };
  }, [isPetExam]);

  const readingHeading = isPetExam ? 'Reading (Parts 1–4)' : 'Reading';
  const useOfEnglishHeading = isPetExam ? 'Use of English (Parts 5–6)' : 'Use of English';

  const ruoeSections = isPetExam
    ? [
        {
          key: 'reading' as const,
          heading: readingHeading,
          Icon: BookOpen,
          items: readingTaskTypes,
          ariaLabelSuffix: 'Reading',
          fallbackDescription: 'Reading comprehension tasks aligned with your exam level.',
        },
        {
          key: 'uoe' as const,
          heading: useOfEnglishHeading,
          Icon: Type,
          items: uoeTaskTypes,
          ariaLabelSuffix: 'Use of English',
          fallbackDescription: 'Grammar and vocabulary tasks to strengthen accuracy and range.',
        },
      ]
    : [
        {
          key: 'uoe' as const,
          heading: useOfEnglishHeading,
          Icon: Type,
          items: uoeTaskTypes,
          ariaLabelSuffix: 'Use of English',
          fallbackDescription: 'Grammar and vocabulary tasks to strengthen accuracy and range.',
        },
        {
          key: 'reading' as const,
          heading: readingHeading,
          Icon: BookOpen,
          items: readingTaskTypes,
          ariaLabelSuffix: 'Reading',
          fallbackDescription: 'Reading comprehension tasks aligned with your exam level.',
        },
      ];

  // --- Render logic (Step 6) --- //
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full md:col-span-2" />
        </div>
      );
    }

    if (error) {
      return (
        <Alert variant="destructive">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      );
    }

    if (!availableTaskTypes || availableTaskTypes.length === 0) {
      return (
        <Alert>
          <Terminal className="h-4 w-4" />
          <AlertTitle>Not Available</AlertTitle>
          <AlertDescription>
            {isRuoEMode
              ? `No Reading & Use of English task types are available to generate with AI based on your current exam (${targetExamId}) and level (${targetLevelId}) combination.`
              : `No specific task types are available to generate with AI based on your current exam (${targetExamId}) and level (${targetLevelId}) combination.`
            }
          </AlertDescription>
        </Alert>
      );
    }

    // Render Task Type Cards
    if (isRuoEMode) {
      return (
        <div className="space-y-8">
          {ruoeSections.map((section) => {
            const { key, heading, Icon, items, ariaLabelSuffix, fallbackDescription } = section;
            if (!items.length) return null;

            return (
              <section key={key} aria-labelledby={`${key}-section`}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <h2 id={`${key}-section`} className="text-xl font-semibold">{heading}</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map((taskType) => {
                    const displayName = formatRuoeDisplayName(
                      ruoeNameOverrides[taskType.task_code] ?? taskType.name,
                    );
                    return (
                      <Card
                        key={taskType.id}
                        className="cursor-pointer hover:shadow-lg hover:border-primary transition-all"
                        onClick={() => handleTaskTypeSelect(taskType.id)}
                        aria-label={`Select ${displayName} (${ariaLabelSuffix})`}
                      >
                        <CardHeader>
                          <CardTitle>{displayName}</CardTitle>
                          <CardDescription className="pt-1">
                            {taskType.description || fallbackDescription}
                          </CardDescription>
                        </CardHeader>
                      </Card>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      );
    }

    // Writing mode with microcopy and subtle icons
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(availableTaskTypes || []).map((taskType) => {
          const nameKey = taskType.name.toLowerCase();
          let icon = <FileText className="h-4 w-4" aria-hidden="true" />;
          if (nameKey.includes('article')) icon = <Newspaper className="h-4 w-4" aria-hidden="true" />;
          else if (nameKey.includes('essay')) icon = <Edit3 className="h-4 w-4" aria-hidden="true" />;
          else if (nameKey.includes('review')) icon = <Star className="h-4 w-4" aria-hidden="true" />;
          else if (nameKey.includes('report')) icon = <FileText className="h-4 w-4" aria-hidden="true" />;
          else if (nameKey.includes('letter') || nameKey.includes('email')) icon = <Mail className="h-4 w-4" aria-hidden="true" />;

          const micro = Object.entries(writingMicrocopy).find(([k]) => nameKey.includes(k))?.[1]
            || taskType.description
            || 'Practice a writing task with clear structure and time guidance.';

          return (
            <Card
              key={taskType.id}
              className="cursor-pointer hover:shadow-lg hover:border-primary transition-all"
              onClick={() => handleTaskTypeSelect(taskType.id)}
              aria-label={`Select ${taskType.name}`}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">{icon}{taskType.name}</CardTitle>
                <CardDescription className="pt-1">
                  {micro}
                </CardDescription>
              </CardHeader>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="container mx-auto p-4 py-8 max-w-5xl">
      <h1 className="text-4xl font-bold text-gray-900 mb-8 text-center">
        {isRuoEMode ? 'Select Reading & Use of English Exercise Type' : 'Select the AI Task Type'}
      </h1>
      {renderContent()}
    </div>
  );
}

export default SelectAiTaskTypePage;
