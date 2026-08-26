import React, { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface McqOption {
  id: string;
  text: string;
  isCorrect: boolean;
  feedback: string;
}

interface MultipleChoiceExercise {
  exerciseType: "multiple_choice";
  title: string;
  instruction: string;
  context?: string; // Optional context paragraph that provides background for the question
  question: string;
  options: McqOption[];
  overallExplanation?: string;
}

interface Props {
  exercise: MultipleChoiceExercise;
  onGenerateNext: () => Promise<void>;
  isLoadingNext: boolean;
}

export const MultipleChoiceDisplay: React.FC<Props> = ({
  exercise,
  onGenerateNext,
  isLoadingNext,
}) => {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState<boolean>(false);

  const handleCheckAnswer = () => {
    setIsAnswered(true);
  };

  return (
    <Card className="max-w-xl mx-auto">
      <CardHeader>
        <CardTitle>{exercise.title}</CardTitle>
        <CardDescription>{exercise.instruction}</CardDescription>
      </CardHeader>
      <CardContent>
        {exercise.context && (
          <div className="mb-4 p-4 bg-muted/30 rounded-md">
            <p className="text-sm text-muted-foreground mb-2 italic">Context:</p>
            <p className="text-sm">{exercise.context}</p>
          </div>
        )}
        <div className="mb-4">
          <h4 className="font-semibold mb-2">{exercise.question}</h4>
        </div>
        <RadioGroup
          value={selectedOptionId ?? ""}
          onValueChange={setSelectedOptionId}
          disabled={isAnswered}
          className="space-y-2"
        >
          {exercise.options.map((option) => (
            <div
              key={option.id}
              className={cn(
                "flex items-center gap-2 p-2 rounded border",
                isAnswered
                  ? option.isCorrect
                    ? "border-green-500 bg-green-50"
                    : option.id === selectedOptionId
                      ? "border-red-500 bg-red-50"
                      : "border-muted"
                  : "border-muted"
              )}
            >
              <RadioGroupItem
                value={option.id}
                id={option.id}
                disabled={isAnswered}
              />
              <Label htmlFor={option.id} className="flex-1 cursor-pointer">
                {option.text}
              </Label>
              {isAnswered && option.id === selectedOptionId && (
                <span>
                  {option.isCorrect ? (
                    <Badge variant="default" className="ml-2">Correct!</Badge>
                  ) : (
                    <Badge variant="destructive" className="ml-2">Incorrect</Badge>
                  )}
                </span>
              )}
              {isAnswered && option.isCorrect && (
                <span className="ml-2" title="Correct answer">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-green-600 inline"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </span>
              )}
              {isAnswered && !option.isCorrect && option.id === selectedOptionId && (
                <span className="ml-2" title="Incorrect answer">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-red-600 inline"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </span>
              )}
            </div>
          ))}
        </RadioGroup>
        <div className="mt-4 flex gap-2">
          <Button
            onClick={handleCheckAnswer}
            disabled={!selectedOptionId || isAnswered}
            className="w-full"
          >
            Check Answer
          </Button>
        </div>
        {/* Feedback Section */}
        {isAnswered && (
          <div className="mt-6 space-y-2">
            <div className="font-semibold">Feedback:</div>
            {exercise.options.map((option) => (
              <div
                key={option.id}
                className={cn(
                  "p-2 rounded",
                  option.isCorrect
                    ? "bg-green-50 border-l-4 border-green-500"
                    : option.id === selectedOptionId
                      ? "bg-red-50 border-l-4 border-red-500"
                      : "bg-muted/10"
                )}
              >
                <span className="font-medium">{option.text}</span>
                <div className="ml-4 text-sm text-muted-foreground">
                  {option.feedback}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MultipleChoiceDisplay;
