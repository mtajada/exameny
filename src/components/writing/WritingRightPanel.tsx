import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type FC,
    type FormEvent,
    type KeyboardEvent,
} from 'react';

import { Loader2, RotateCcw, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { AutoResizeTextarea } from '@/components/ui/auto-resize-textarea.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Card, CardContent, CardHeader } from '@/components/ui/card.tsx';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip.tsx';

type TabType = 'instructions' | 'chat';

interface ChatMessage {
    role: 'user' | 'model';
    parts: [{ text: string }];
}

interface WritingRightPanelProps {
    /** Prompt/task instructions text */
    promptText: string;
    /** Chat history */
    chatHistory: ChatMessage[];
    /** Current chat input value */
    chatInput: string;
    /** Handle chat input changes */
    onChatInputChange: (value: string) => void;
    /** Send a message */
    onSendMessage: () => void;
    /** Clear chat history */
    onClearChat: () => void;
    /** Whether AI is loading */
    isAiLoading?: boolean;
}

/**
 * Right panel for Writing exercise
 * Tabs (Instructions/Chat) for prompt display and AI assistance
 *
 * Modular • Efficient • Simple • Elegant
 */
export const WritingRightPanel: FC<WritingRightPanelProps> = ({
    promptText,
    chatHistory,
    chatInput,
    onChatInputChange,
    onSendMessage,
    onClearChat,
    isAiLoading = false,
}) => {
    const [activeTab, setActiveTab] = useState<TabType>('instructions');
    const chatScrollAreaRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll chat when new messages arrive
    useEffect(() => {
        if (chatScrollAreaRef.current) {
            const scrollViewport = chatScrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
            if (scrollViewport) {
                scrollViewport.scrollTop = scrollViewport.scrollHeight;
            }
        }
    }, [chatHistory]);

    const getTabButtonClass = useCallback((tab: TabType) => {
        const baseClass = "flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap";
        if (activeTab === tab) {
            return `${baseClass} bg-[#2563EB] text-white shadow-sm`;
        }
        return `${baseClass} text-[#4B5563] hover:bg-blue-100 hover:text-[#2563EB]`;
    }, [activeTab]);

    const handleKeyPress = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !isAiLoading && chatInput.trim()) {
            e.preventDefault();
            onSendMessage();
        }
    }, [chatInput, isAiLoading, onSendMessage]);

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!isAiLoading && chatInput.trim()) {
            onSendMessage();
        }
    };

    const hasMessages = chatHistory.length > 0;

    return (
        <Card className="h-full min-h-0 flex flex-col">
            <CardHeader className="pb-2 pt-3 flex-shrink-0">
                <div className="flex items-center justify-center gap-2 w-full">
                    <Button
                        variant="ghost"
                        className={getTabButtonClass('instructions')}
                        onClick={() => setActiveTab('instructions')}
                        title="Instructions"
                        aria-label="View exercise instructions"
                    >
                        Instructions
                    </Button>
                    <Button
                        variant="ghost"
                        className={getTabButtonClass('chat')}
                        onClick={() => setActiveTab('chat')}
                        title="Chat"
                        aria-label="Open chat with AI assistant"
                    >
                        Chat
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-hidden pt-0 min-h-0 flex flex-col pb-3">
                {/* Instructions Tab */}
                <div
                    className={`flex-1 min-h-0 ${activeTab === 'instructions' ? 'flex flex-col' : 'hidden'}`}
                    style={{ display: activeTab === 'instructions' ? 'flex' : 'none' }}
                >
                    <ScrollArea className="flex-1 w-full rounded-lg">
                        <div className="p-4 prose prose-sm sm:prose-base max-w-none leading-relaxed">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    strong: ({ ...props }) => <strong className="font-bold text-gray-900" {...props} />,
                                    p: ({ ...props }) => <p className="mb-4 last:mb-0 text-gray-800 leading-relaxed" {...props} />,
                                    ul: ({ ...props }) => <ul className="list-disc list-inside pl-5 mb-4 space-y-1" {...props} />,
                                    ol: ({ ...props }) => <ol className="list-decimal list-inside pl-5 mb-4 space-y-1" {...props} />,
                                    li: ({ ...props }) => <li className="text-gray-800" {...props} />,
                                    h1: ({ ...props }) => <h1 className="text-xl font-bold text-gray-900 mb-3 mt-4" {...props} />,
                                    h2: ({ ...props }) => <h2 className="text-lg font-bold text-gray-900 mb-2 mt-3" {...props} />,
                                    h3: ({ ...props }) => <h3 className="text-base font-bold text-gray-900 mb-2 mt-2" {...props} />,
                                }}
                            >
                                {promptText || "Loading instructions..."}
                            </ReactMarkdown>
                        </div>
                    </ScrollArea>


                </div>

                {/* Chat Tab - Matches R&UoE ChatPanel exactly */}
                <div
                    className={`flex-1 min-h-0 flex flex-col ${activeTab === 'chat' ? 'flex' : 'hidden'}`}
                    style={{ display: activeTab === 'chat' ? 'flex' : 'none' }}
                >
                    {/* EXAM COACH AI Header - matches R&UoE */}
                    <div className="px-1 pt-1 pb-2 flex-shrink-0">
                        <TooltipProvider delayDuration={150}>
                            <div className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/60 px-3 py-1.5">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                                        Exam Coach AI
                                    </span>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span
                                                className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400"
                                                role="status"
                                                aria-label="Context-aware support active"
                                            />
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom">Context-aware support</TooltipContent>
                                    </Tooltip>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {isAiLoading && (
                                        <span className="flex items-center text-primary" role="status" aria-live="polite">
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                            <span className="sr-only">Assistant replying</span>
                                        </span>
                                    )}
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 rounded-full border border-border/70 text-muted-foreground hover:border-primary/40 hover:text-primary"
                                                onClick={onClearChat}
                                                disabled={!hasMessages || isAiLoading}
                                                aria-label="Clear conversation"
                                            >
                                                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" align="end">
                                            Clear chat history
                                        </TooltipContent>
                                    </Tooltip>
                                </div>
                            </div>
                        </TooltipProvider>
                    </div>

                    {/* Chat Messages */}
                    <ScrollArea className="flex-1 min-h-0" ref={chatScrollAreaRef}>
                        <div className="flex-1 flex flex-col justify-center items-center min-h-full">
                            {chatHistory.length === 0 ? (
                                <div className="text-center text-muted-foreground text-sm py-8">
                                    <p className="text-[#2563EB]">Ask for help...</p>
                                </div>
                            ) : (
                                <div className="p-4 space-y-4 w-full">
                                    {chatHistory.map((chatMsg, index) => (
                                        <div
                                            key={`chat-message-${index}`}
                                            className={`flex ${chatMsg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                        >
                                            <div
                                                className={`max-w-[85%] p-3 rounded-lg shadow-sm text-sm leading-normal ${chatMsg.role === 'user'
                                                    ? 'bg-[#2563EB] text-white'
                                                    : 'bg-gray-100 text-gray-800'
                                                    }`}
                                            >
                                                {chatMsg.role === 'model' ? (
                                                    chatMsg.parts.map((part, partIndex) => (
                                                        <div key={`part-${partIndex}`} className="prose prose-sm max-w-none">
                                                            <ReactMarkdown
                                                                remarkPlugins={[remarkGfm]}
                                                                components={{
                                                                    strong: ({ ...props }) => <strong className="font-bold" {...props} />,
                                                                    ul: ({ ...props }) => <ul className="list-disc list-inside space-y-1" {...props} />,
                                                                    ol: ({ ...props }) => <ol className="list-decimal list-inside space-y-1" {...props} />,
                                                                }}
                                                            >
                                                                {part.text}
                                                            </ReactMarkdown>
                                                        </div>
                                                    ))
                                                ) : (
                                                    chatMsg.parts.map((part, partIndex) => (
                                                        <p key={`part-${partIndex}`} className="whitespace-pre-wrap">{part.text}</p>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {isAiLoading && (
                                        <div className="flex justify-start">
                                            <div className="max-w-[75%] p-3 rounded-lg bg-gray-100">
                                                <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </ScrollArea>

                    {/* Chat Input - matches R&UoE ChatInput exactly */}
                    <div className="px-1 pb-1 pt-1.5 flex-shrink-0">
                        <div className="mx-auto w-full">
                            <form onSubmit={handleSubmit}>
                                <div className="flex items-start gap-2.5 rounded-xl border border-border/30 bg-gradient-to-r from-background/95 to-background/90 px-3.5 py-2.5 shadow-md backdrop-blur-sm transition-all duration-200 focus-within:border-primary/50 focus-within:bg-background focus-within:shadow-lg">
                                    <AutoResizeTextarea
                                        ref={inputRef}
                                        value={chatInput}
                                        onChange={(e) => onChatInputChange(e.target.value)}
                                        onKeyDown={handleKeyPress}
                                        placeholder="Ask for help..."
                                        disabled={isAiLoading}
                                        minRows={1}
                                        maxRows={4}
                                        className="flex-1 border-0 bg-transparent text-sm focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground resize-none"
                                        autoComplete="off"
                                        aria-label="Chat input"
                                    />
                                    <Button
                                        type="submit"
                                        disabled={!chatInput.trim() || isAiLoading}
                                        size="sm"
                                        className="mt-0.5 h-8 w-8 shrink-0 rounded-full p-0 bg-[#2563EB] hover:bg-[#1d4ed8]"
                                        aria-label={isAiLoading ? "Sending message..." : "Send message"}
                                    >
                                        {isAiLoading ? (
                                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                        ) : (
                                            <Send className="h-4 w-4" aria-hidden="true" />
                                        )}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default WritingRightPanel;
