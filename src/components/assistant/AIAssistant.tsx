
import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, MessageSquare, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  id: number;
  text: string;
  fromUser: boolean;
}

interface AIAssistantProps {
  className?: string;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ className }) => {
  const [activeTab, setActiveTab] = useState("chat");
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, text: "Hi! I'm your writing assistant. I'm here to help you with your English drafts. What would you like to work on?", fromUser: false }
  ]);

  const handleSendMessage = () => {
    if (inputValue.trim() === "") return;

    // Agregar mensaje del usuario
    const newMessage = {
      id: Date.now(),
      text: inputValue,
      fromUser: true
    };

    setMessages(prev => [...prev, newMessage]);
    setInputValue("");

    // Simulate the assistant response (a real implementation would call the API here)
    setTimeout(() => {
      const assistantResponse = {
        id: Date.now() + 1,
        text: 'Processing your request... In the full experience you would receive tailored guidance based on your text and prompt.',
        fromUser: false
      };
      setMessages(prev => [...prev, assistantResponse]);
    }, 1000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className={cn("flex flex-col border rounded-lg overflow-hidden bg-card h-full", className)}>
      <Tabs defaultValue="chat" value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="border-b">
          <TabsList className="w-full justify-start h-12 px-2 bg-muted/30">
            <TabsTrigger value="chat" className="flex items-center gap-2 data-[state=active]:bg-background">
              <MessageSquare className="h-4 w-4" />
              <span>Chat</span>
            </TabsTrigger>
            <TabsTrigger value="research" className="flex items-center gap-2 data-[state=active]:bg-background">
              <BookOpen className="h-4 w-4" />
              <span>Research</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="chat" className="flex-1 flex flex-col p-0 mt-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map(message => (
              <div
                key={message.id}
                className={cn(
                  "p-3 rounded-lg max-w-[85%]",
                  message.fromUser
                    ? "bg-primary text-primary-foreground ml-auto"
                    : "bg-muted mr-auto"
                )}
              >
                {message.text}
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="p-2 border-t">
            <div className="flex items-end gap-2">
              <Textarea
                placeholder="Type your message..."
                className="min-h-24 resize-none"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <Button
                size="icon"
                onClick={handleSendMessage}
                disabled={inputValue.trim() === ""}
              >
                <Send className="h-4 w-4" />
                <span className="sr-only">Send message</span>
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="research" className="flex-1 flex flex-col p-4 mt-0">
          <h3 className="font-semibold mb-2">Document Information</h3>
          <div className="border rounded-lg p-3 mb-4 bg-muted/30">
            <h4 className="text-sm font-medium mb-1">CURRENT DOCUMENT</h4>
            <div className="text-sm">
              <span className="inline-block px-2 py-1 rounded bg-muted mb-2">oil</span>
            </div>

            <h4 className="text-sm font-medium mb-1 mt-4">SELECTED PASSAGE</h4>
            <p className="text-sm text-muted-foreground">
              The global oil industry is a ma...
            </p>
          </div>

            <div className="text-sm text-muted-foreground">
              In the full release this panel will highlight related insights, study resources, and research sources tied to your text.
            </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AIAssistant;
