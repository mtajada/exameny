import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Academy = {
  id: number;
  name: string;
  role: 'teacher' | 'student';
  status: 'active' | 'inactive';
};

const storageKey = 'test-harness-active-academy';

const academies: Academy[] = [
  { id: 201, name: 'Grammar Lab', role: 'teacher', status: 'active' },
  { id: 202, name: 'Writing Guild', role: 'teacher', status: 'active' },
];

export const MultiAcademyHarness = () => {
  const [activeAcademyId, setActiveAcademyId] = useState<number | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      const parsed = Number.parseInt(stored, 10);
      if (Number.isFinite(parsed)) {
        setActiveAcademyId(parsed);
      }
    }
  }, []);

  const handleSelect = (academyId: number) => {
    setActiveAcademyId(academyId);
    window.localStorage.setItem(storageKey, String(academyId));
  };

  return (
    <div className="space-y-4">
      <Card className="border border-dashed">
        <CardHeader>
          <CardTitle>Multi-academy selector</CardTitle>
          <CardDescription>
            This simulates list_user_academies / set_active_academy. Selection persists through localStorage to mirror
            user_preferences.active_academy_id.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p data-testid="active-academy-indicator" className="text-sm font-medium">
            Active academy id: {activeAcademyId ?? 'none'}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {academies.map((academy) => (
          <Card
            key={academy.id}
            data-testid={`academy-card-${academy.id}`}
            data-active={academy.id === activeAcademyId}
            className={`transition ${
              academy.id === activeAcademyId ? 'border-primary shadow-lg' : 'border-muted'
            }`}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{academy.name}</CardTitle>
                <Badge variant={academy.status === 'active' ? 'default' : 'secondary'}>{academy.role}</Badge>
              </div>
              <CardDescription>Status: {academy.status}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant={academy.id === activeAcademyId ? 'default' : 'outline'}
                className="w-full"
                onClick={() => handleSelect(academy.id)}
              >
                {academy.id === activeAcademyId ? 'Selected' : `Switch to ${academy.name}`}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
