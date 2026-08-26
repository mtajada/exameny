import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, UserPlus, School } from 'lucide-react';

interface QuickActionsProps {
  totalMembers: number;
}

export default function QuickActions({ totalMembers }: QuickActionsProps) {
  const navigate = useNavigate();

  const actions = [
    {
      title: 'Manage Members',
      description: `${totalMembers} active members in your academy.`,
      icon: Users,
      color: 'bg-blue-50 text-blue-600',
      onClick: () => navigate('/academy/dashboard#members')
    },
    {
      title: 'Add New Members',
      description: 'Invite students and teachers to join',
      icon: UserPlus,
      color: 'bg-green-50 text-green-600',
      onClick: () => navigate('/academy/dashboard#members')
    },
    {
      title: 'Manage Classes',
      description: 'Create and organize your classes',
      icon: School,
      color: 'bg-purple-50 text-purple-600',
      onClick: () => navigate('/academy/dashboard#classes')
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {actions.map((action) => {
        const IconComponent = action.icon;
        return (
          <Card key={action.title} className="transition-all hover:shadow-md cursor-pointer">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4 mb-4">
                <div className={`p-3 rounded-lg ${action.color}`}>
                  <IconComponent className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{action.title}</h3>
                  <p className="text-sm text-gray-600">{action.description}</p>
                </div>
              </div>
              <Button
                onClick={action.onClick}
                className="w-full"
                variant="outline"
              >
                Go to {action.title}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
