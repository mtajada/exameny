import type { ChangeEvent, FC } from 'react';

import { Clock, Loader2, Save, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';

interface WritingEditorPanelProps {
    /** Current draft text */
    value: string;
    /** Handle text changes */
    onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
    /** Current word count */
    wordCount: number;
    /** Suggested time in minutes */
    suggestedTimeMinutes?: number;
    /** Formatted timer value (e.g. "05:30") */
    formattedTime?: string;
    /** Whether timer is syncing */
    isTimerSyncing?: boolean;
    /** Placeholder text */
    placeholder?: string;
    /** Save and exit handler */
    onSaveAndExit?: () => void;
    /** Whether save is in progress */
    isSaving?: boolean;
    /** Evaluate handler */
    onEvaluate?: () => void;
    /** Whether evaluation is in progress */
    isEvaluating?: boolean;
}

/**
 * Left panel for Writing exercise
 * Header: Title + Evaluate + Save & Back
 * Footer: Timer / Suggested time | Words count
 *
 * Modular • Efficient • Simple • Elegant
 */
export const WritingEditorPanel: FC<WritingEditorPanelProps> = ({
    value,
    onChange,
    wordCount,
    suggestedTimeMinutes,
    formattedTime,
    isTimerSyncing = false,
    placeholder = 'Start writing here...',
    onSaveAndExit,
    isSaving = false,
    onEvaluate,
    isEvaluating = false,
}) => {
    return (
        <Card className="h-full min-h-0 flex flex-col">
            <CardHeader className="pb-3 flex-shrink-0">
                <div className="flex justify-between items-center">
                    <CardTitle className="text-lg font-semibold">Writing Practice</CardTitle>
                    <div className="flex items-center gap-2">
                        {onSaveAndExit && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onSaveAndExit}
                                disabled={isSaving}
                                title="Save draft and return to dashboard"
                            >
                                {isSaving ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Save className="mr-2 h-4 w-4" />
                                )}
                                Save & Back
                            </Button>
                        )}
                        {onEvaluate && (
                            <Button
                                onClick={onEvaluate}
                                disabled={isEvaluating}
                                size="sm"
                                className="bg-[#2563EB] hover:bg-[#1d4ed8]"
                            >
                                {isEvaluating ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Evaluating...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="mr-2 h-4 w-4" />
                                        Evaluate
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                </div>
            </CardHeader>

            <CardContent className="flex-1 min-h-0 flex flex-col pt-0 pb-3">
                <div className="flex-1 min-h-0 flex flex-col border border-border rounded-lg overflow-hidden">
                    <Textarea
                        value={value}
                        onChange={onChange}
                        placeholder={placeholder}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        data-gramm="false"
                        data-gramm_editor="false"
                        data-enable-grammarly="false"
                        data-lt-active="false"
                        className="flex-1 resize-none border-0 rounded-none p-5 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-white text-gray-800 min-h-0"
                        style={{
                            fontSize: '16px',
                            lineHeight: '1.8',
                            letterSpacing: '-0.01em',
                            fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif',
                        }}
                        aria-label="Main writing area"
                    />
                    {/* Minimalist footer with timer and word count */}
                    <div className="border-t border-border/50 px-4 py-2.5 flex items-center justify-between text-xs text-muted-foreground/80 flex-shrink-0">
                        <div className="flex items-center gap-2">
                            {formattedTime && (
                                <>
                                    <Clock className="h-3.5 w-3.5 opacity-60" />
                                    <span className="font-medium tabular-nums text-foreground/70">{formattedTime}</span>
                                    {isTimerSyncing && (
                                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                    )}
                                    {suggestedTimeMinutes && suggestedTimeMinutes > 0 && (
                                        <>
                                            <span className="opacity-40">•</span>
                                            <span className="opacity-60">{suggestedTimeMinutes} min</span>
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="opacity-60">Words</span>
                            <span className="font-semibold tabular-nums text-foreground/70">{wordCount}</span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default WritingEditorPanel;
