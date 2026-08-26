import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Clock, Target, CheckCircle, HelpCircle } from 'lucide-react';
import { getTaskInstructions } from '@/config/ruoe-task-instructions';

interface TaskInstructionsPanelProps {
  taskCode: string;
  userAnswers: Record<number, string>;
  questionsLength: number;
  isEvaluated: boolean;
}

export const TaskInstructionsPanel: React.FC<TaskInstructionsPanelProps> = ({
  taskCode,
  userAnswers,
  questionsLength,
  isEvaluated,
}) => {
  const instructions = getTaskInstructions(taskCode);

  const answeredCount = Object.keys(userAnswers).filter(
    (key) => userAnswers[parseInt(key)]?.trim()
  ).length;

  return (
    <div className="space-y-4 h-full overflow-y-auto">
      <div className="border-l-4 border-blue-500 pl-4">
        <h3 className="font-semibold text-blue-900 mb-1">{instructions.title}</h3>
        <p className="text-sm text-blue-700">{instructions.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Clock className="h-4 w-4" />
          <span>{instructions.timeLimit}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Target className="h-4 w-4" />
          <span>{instructions.questions}</span>
        </div>
      </div>

      <div>
        <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-600" />
          Steps to follow:
        </h4>
        <ol className="text-sm text-gray-600 space-y-1">
          {instructions.steps.map((step: string, index: number) => (
            <li key={index} className="flex items-start gap-2">
              <span className="text-blue-600 font-medium">{index + 1}.</span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      <div>
        <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-amber-600" />
          Tips for success:
        </h4>
        <ul className="text-sm text-gray-600 space-y-1">
          {instructions.tips.map((tip: string, index: number) => (
            <li key={index} className="flex items-start gap-2">
              <span className="text-amber-600">•</span>
              {tip}
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-gray-50 p-3 rounded-lg">
        <h4 className="font-semibold text-gray-800 mb-2">Current Progress:</h4>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Questions answered:</span>
            <Badge variant="outline">
              {answeredCount}/{questionsLength}
            </Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Status:</span>
            <Badge variant={isEvaluated ? 'default' : 'secondary'}>
              {isEvaluated ? 'Evaluated' : 'In Progress'}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
};
