import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Users, GraduationCap, School, UserCheck } from 'lucide-react';

interface Metrics {
  totalMembers: number;
  activeStudents: number;
  activeTeachers: number;
  totalClasses: number;
}

interface DashboardMetricsProps {
  metrics: Metrics;
  isLoading?: boolean;
}

export default function DashboardMetrics({ metrics, isLoading = false }: DashboardMetricsProps) {
  const metricCards = [
    {
      title: 'Total Members',
      value: metrics.totalMembers,
      icon: Users,
      color: 'text-blue-600'
    },
    {
      title: 'Active Students',
      value: metrics.activeStudents,
      icon: GraduationCap,
      color: 'text-green-600'
    },
    {
      title: 'Active Teachers',
      value: metrics.activeTeachers,
      icon: UserCheck,
      color: 'text-purple-600'
    },
    {
      title: 'Total Classes',
      value: metrics.totalClasses,
      icon: School,
      color: 'text-orange-600'
    }
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metricCards.map((_, index) => (
          <Card key={index}>
            <CardContent className="p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {metricCards.map((card) => {
        const IconComponent = card.icon;
        return (
          <Card key={card.title}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{card.title}</p>
                  <p className="text-3xl font-bold text-gray-900">{card.value}</p>
                </div>
                <IconComponent className={`h-8 w-8 ${card.color}`} />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
