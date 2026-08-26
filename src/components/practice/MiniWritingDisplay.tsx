import React, { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";

interface MiniWritingExercise {
  exerciseType: "mini_writing";
  title: string;
  instruction: string;
  miniPrompt: string;
  focusAreaFeedbackGuide?: string;
}

interface Props {
  exercise: MiniWritingExercise;
  onGenerateNext: () => Promise<void>;
  isLoadingNext: boolean;
}

export const MiniWritingDisplay: React.FC<Props> = ({
  exercise,
}) => {
  const [studentText, setStudentText] = useState<string>("");

  return (
    <Card className="max-w-xl mx-auto">
      <CardHeader>
        <CardTitle>{exercise.title}</CardTitle>
        <CardDescription>{exercise.instruction}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="font-medium mb-2">{exercise.miniPrompt}</div>
          <Textarea
            aria-label="Your answer"
            value={studentText}
            onChange={(e) => setStudentText(e.target.value)}
            rows={5}
            placeholder="Write your answer here..."
            className="mb-2"
          />
          {/* Self-check section (focusAreaFeedbackGuide) removed */}
        </div>
      </CardContent>
    </Card>
  );
};

export default MiniWritingDisplay;
