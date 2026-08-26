import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Trophy,
  Target,
  CheckCircle,
  XOctagon,
  AlertCircle,
  Star,
  Award,
  ListOrdered
} from 'lucide-react';
import { ScoreDisplayProps } from '@/types/ruoe';

export const ScoreDisplay: React.FC<ScoreDisplayProps> = ({
  score,
  maxScore,
  scorePoints,
  maxScorePoints,
  pointsPerQuestion,
  questionsCorrect,
  totalQuestions
}) => {
  // Calculate performance metrics
  const performanceMetrics = useMemo(() => {
    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    const questionsIncorrect = totalQuestions - questionsCorrect;
    const accuracyRate = totalQuestions > 0 ? Math.round((questionsCorrect / totalQuestions) * 100) : 0;

    // Determine performance level
    let performanceLevel = '';
    let performanceColor = '';
    let performanceIcon: React.ReactNode = null;

    if (percentage >= 90) {
      performanceLevel = 'Excellent';
      performanceColor = 'text-green-600';
      performanceIcon = <Trophy className="h-5 w-5 text-yellow-500" />;
    } else if (percentage >= 80) {
      performanceLevel = 'Very Good';
      performanceColor = 'text-green-600';
      performanceIcon = <Award className="h-5 w-5 text-green-500" />;
    } else if (percentage >= 70) {
      performanceLevel = 'Good';
      performanceColor = 'text-blue-600';
      performanceIcon = <Star className="h-5 w-5 text-blue-500" />;
    } else if (percentage >= 60) {
      performanceLevel = 'Fair';
      performanceColor = 'text-yellow-600';
      performanceIcon = <Target className="h-5 w-5 text-yellow-500" />;
    } else {
      performanceLevel = 'Needs Improvement';
      performanceColor = 'text-red-600';
      performanceIcon = <AlertCircle className="h-5 w-5 text-red-500" />;
    }

    return {
      percentage,
      questionsIncorrect,
      accuracyRate,
      performanceLevel,
      performanceColor,
      performanceIcon
    };
  }, [score, maxScore, questionsCorrect, totalQuestions]);

  // Accent colors for hero and progress
  const getAccent = () => {
    const { percentage } = performanceMetrics;
    if (percentage >= 80) return { text: 'text-green-600' };
    if (percentage >= 60) return { text: 'text-yellow-600' };
    return { text: 'text-red-600' };
  };

  const accent = getAccent();

  return (
    <Card className="border border-gray-200">
      <CardContent className="space-y-6 p-6">
        <div className="text-center">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Your Performance</div>
          <div className={`mt-1 text-5xl font-extrabold ${accent.text}`}>{performanceMetrics.percentage}%</div>
          <div className="mt-3">
            <Progress value={performanceMetrics.percentage} className="h-2.5" />
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            independent English score: <span className="font-semibold text-foreground">{scorePoints}</span>
            <span className="text-foreground/60"> / {maxScorePoints}</span>
            <span className="ml-1">• {pointsPerQuestion === 1 ? '1 point per question' : `${pointsPerQuestion} points/question`}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-white border border-gray-200">
            <div className="p-2 rounded-full bg-green-100">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Correct</div>
              <div className="text-lg font-semibold text-green-600">{questionsCorrect}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-white border border-gray-200">
            <div className="p-2 rounded-full bg-red-100">
              <XOctagon className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Incorrect</div>
              <div className="text-lg font-semibold text-red-600">{performanceMetrics.questionsIncorrect}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-white border border-gray-200">
            <div className="p-2 rounded-full bg-purple-100">
              <ListOrdered className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="text-lg font-semibold text-purple-600">{totalQuestions}</div>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            {performanceMetrics.performanceIcon}
            <span>
              {performanceMetrics.percentage >= 80 && 'Great work! Review any mistakes to solidify learning.'}
              {performanceMetrics.percentage >= 60 && performanceMetrics.percentage < 80 && 'Nice effort. Check the incorrect answers and try again.'}
              {performanceMetrics.percentage < 60 && 'Keep going! Review explanations and practice similar items.'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
