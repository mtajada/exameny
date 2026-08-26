import React, { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface BlankOption {
  id: string;
  text: string;
  isCorrect: boolean;
  feedback: string;
}

interface FillBlankPart {
  type: "text" | "blank";
  content?: string;
  blankId?: string;
  options?: BlankOption[];
}

interface FillInTheBlankExercise {
  exerciseType: "fill_in_the_blank";
  title: string;
  instruction: string;
  paragraph: FillBlankPart[]; // MODIFICADO: sentenceParts -> paragraph
  overallExplanation?: string;
}

interface Props {
  exercise: FillInTheBlankExercise;
  onGenerateNext: () => Promise<void>;
  isLoadingNext: boolean;
}

export const FillBlankDisplay: React.FC<Props> = ({
  exercise,
  onGenerateNext,
  isLoadingNext,
}) => {
  const [userAnswers, setUserAnswers] = useState<{ [blankId: string]: string }>({});
  const [isAnswered, setIsAnswered] = useState<boolean>(false);
  const [results, setResults] = useState<{ [blankId: string]: boolean | null }>({});

  const handleOptionSelect = (blankId: string, selectedOptionText: string) => {
    setUserAnswers((prev) => ({ ...prev, [blankId]: selectedOptionText }));
    if (isAnswered) {
      setResults((prev) => ({ ...prev, [blankId]: null }));
    }
  };

  const handleCheckAnswers = () => {
    const newResults: { [blankId: string]: boolean } = {};
    // MODIFICADO: exercise.sentenceParts -> exercise.paragraph
    exercise.paragraph.forEach((part) => {
      if (part.type === "blank" && part.blankId && part.options) {
        const userAnswerText = userAnswers[part.blankId];
        const chosenOption = part.options.find((opt) => opt.text === userAnswerText);
        newResults[part.blankId] = chosenOption ? chosenOption.isCorrect : false;
      }
    });
    setResults(newResults);
    setIsAnswered(true);
  };

  const getSelectedOptionForBlank = (blankId: string) => {
    // MODIFICADO: exercise.sentenceParts -> exercise.paragraph
    const part = exercise.paragraph.find((p) => p.blankId === blankId);
    if (part && part.type === "blank" && part.options) {
      const userAnswerText = userAnswers[blankId];
      return part.options.find((opt) => opt.text === userAnswerText);
    }
    return undefined;
  };

  const getCorrectOptionForBlank = (blankId: string) => {
    // MODIFICADO: exercise.sentenceParts -> exercise.paragraph
    const part = exercise.paragraph.find((p) => p.blankId === blankId);
    if (part && part.type === "blank" && part.options) {
      return part.options.find((opt) => opt.isCorrect);
    }
    return undefined;
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>{exercise.title}</CardTitle>
        <CardDescription>{exercise.instruction}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-6 flex flex-wrap items-center leading-relaxed">
          {/* MODIFICADO: exercise.sentenceParts -> exercise.paragraph */}
          {exercise.paragraph.map((part, idx) => {
            if (part.type === "text") {
              return (
                <span key={`text-${idx}`} className="inline-block text-lg mr-1">
                  {part.content}
                </span>
              );
            } else if (part.type === "blank" && part.blankId && part.options) {
              const blankId = part.blankId;
              const currentSelection = userAnswers[blankId];
              const resultForThisBlank = results[blankId];

              return (
                <span
                  key={`blank-${blankId}-${idx}`}
                  className="inline-flex flex-col items-center mx-1 align-bottom"
                >
                  <div className="flex gap-1 mb-1">
                    {part.options.map((option) => (
                      <Button
                        key={option.id}
                        variant={
                          currentSelection === option.text ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => handleOptionSelect(blankId, option.text)}
                        disabled={isAnswered}
                        className={cn(
                          "px-2 py-1 h-auto text-sm",
                          isAnswered &&
                          currentSelection === option.text &&
                          resultForThisBlank === true &&
                          "bg-[#10B981] text-white border-[#10B981]",
                          isAnswered &&
                          currentSelection === option.text &&
                          resultForThisBlank === false &&
                          "bg-[#EF4444] text-white border-[#EF4444]",
                          isAnswered &&
                          currentSelection !== option.text &&
                          option.isCorrect &&
                          "border-[#10B981] text-[#10B981]"
                        )}
                      >
                        {option.text}
                      </Button>
                    ))}
                  </div>
                </span>
              );
            }
            return null;
          })}
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            onClick={handleCheckAnswers}
            disabled={
              isAnswered ||
              // MODIFICADO: exercise.sentenceParts -> exercise.paragraph
              Object.keys(userAnswers).length <
              exercise.paragraph.filter((p) => p.type === "blank").length
            }
            className="w-full"
          >
            Check Answers
          </Button>
        </div>
        {/* Feedback Section */}
        {isAnswered && (
          <div className="mt-6 space-y-3">
            <h3 className="font-semibold text-md">Feedback:</h3>
            <ul className="list-none space-y-2 text-sm">
              {/* MODIFICADO: exercise.sentenceParts -> exercise.paragraph */}
              {exercise.paragraph.map((part) => {
                if (part.type === "blank" && part.blankId) {
                  const selectedOpt = getSelectedOptionForBlank(part.blankId);
                  const correctOpt = getCorrectOptionForBlank(part.blankId);
                  if (!selectedOpt && !correctOpt) return null;

                  // Find the index of the current item to fetch the previous text snippet
                  // MODIFICADO: exercise.sentenceParts -> exercise.paragraph (en dos lugares)
                  const currentIndex = exercise.paragraph.indexOf(part);
                  const previousTextContent = currentIndex > 0 && exercise.paragraph[currentIndex - 1].type === "text"
                    ? exercise.paragraph[currentIndex - 1].content?.slice(-30)
                    : "Start";

                  return (
                    <li key={`fb-${part.blankId}`} className="p-2 border rounded-md bg-muted/30">
                      <p className="font-medium">
                        For the blank after
                        "{previousTextContent || "Start"}..."
                      </p>
                      {selectedOpt ? (
                        <p>
                          You chose:{" "}
                          <span
                            className={cn(
                              selectedOpt.isCorrect
                                ? "text-green-600 font-semibold"
                                : "text-red-600 font-semibold"
                            )}
                          >
                            "{selectedOpt.text}"
                          </span>
                        </p>
                      ) : (
                        <p className="text-orange-600 font-semibold">
                          You did not select an option for this blank.
                        </p>
                      )}
                      {selectedOpt && <p className="mt-1">{selectedOpt.feedback}</p>}
                      {!selectedOpt?.isCorrect && correctOpt && (
                        <p className="mt-1">
                          The correct answer was:{" "}
                          <span className="text-green-600 font-semibold">
                            "{correctOpt.text}"
                          </span>
                          . {correctOpt.feedback}
                        </p>
                      )}
                    </li>
                  );
                }
                return null;
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FillBlankDisplay;
