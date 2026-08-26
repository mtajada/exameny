import React, { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SentenceTransformationExercise {
  exerciseType: "sentence_transformation";
  title: string;
  instruction: string;
  originalSentence: string;
  transformationWord: string;
  promptedSentenceStart: string;
  promptedSentenceEnd: string;
  correctAnswers: string[];
  explanation: string;
}

interface Props {
  exercise: SentenceTransformationExercise;
  onGenerateNext: () => Promise<void>;
  isLoadingNext: boolean;
}

export const SentenceTransformationDisplay: React.FC<Props> = ({
  exercise,
  onGenerateNext,
  isLoadingNext,
}) => {
  const [userAnswer, setUserAnswer] = useState<string>("");
  const [showFeedback, setShowFeedback] = useState<boolean>(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  const handleCheckAnswer = () => {
    const userAnswerTrimmedLower = userAnswer.trim().toLowerCase();
    const correctMatch = exercise.correctAnswers.some(
      (ans) => ans.trim().toLowerCase() === userAnswerTrimmedLower
    );
    setIsCorrect(correctMatch);
    setShowFeedback(true);
  };

  return (
    <Card className="max-w-xl mx-auto">
      <CardHeader>
        <CardTitle>{exercise.title}</CardTitle>
        <CardDescription>{exercise.instruction}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="text-base mb-1">
            <span className="font-medium">Original sentence:</span> {exercise.originalSentence}
          </div>
          <div className="mb-2">
            <span className="font-medium">Word to use: </span>
            <Badge variant="outline">{exercise.transformationWord}</Badge>
          </div>
          <div className="flex items-center flex-wrap gap-2">
            <span>{exercise.promptedSentenceStart}</span>
            <Input
              aria-label="Transformed sentence answer"
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              disabled={showFeedback}
              className={cn(
                "mx-1 inline-block w-auto",
                showFeedback && isCorrect === true
                  ? "border-green-500 bg-green-50"
                  : showFeedback && isCorrect === false
                  ? "border-red-500 bg-red-50"
                  : ""
              )}
              placeholder="..."
            />
            <span>{exercise.promptedSentenceEnd}</span>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            onClick={handleCheckAnswer}
            disabled={showFeedback || !userAnswer.trim()}
            className="w-full"
          >
            Check Answer
          </Button>
        </div>
        {/* Feedback Section */}
        {showFeedback && (
          <div className="mt-6">
  <div className="font-semibold mb-2">
    {isCorrect ? (
      <span className="text-green-700">Correct!</span>
    ) : (
      <span className="text-red-700">Incorrect.</span>
    )}
  </div>
  <div className="bg-muted/30 border rounded-md p-3">
    <h3 className="font-semibold text-md mb-1">Explanation</h3>
    <div className="text-sm mb-1">
      <span className="font-medium">Model answer: </span>
      {exercise.correctAnswers[0]}
    </div>
    <div className="text-sm text-muted-foreground">
      {exercise.explanation}
    </div>
  </div>
</div>
        )}
      </CardContent>
    </Card>
  );
};

export default SentenceTransformationDisplay;
