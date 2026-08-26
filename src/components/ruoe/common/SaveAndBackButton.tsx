import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Home } from 'lucide-react';

interface SaveAndBackButtonProps {
  hasPending: boolean;
  isSaving: boolean;
  onFlushAndBack: () => Promise<void>;
  className?: string;
}

export const SaveAndBackButton: React.FC<SaveAndBackButtonProps> = ({
  hasPending,
  isSaving,
  onFlushAndBack,
  className,
}) => {
  const disabled = isSaving || hasPending;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onFlushAndBack}
      disabled={isSaving}
      className={className}
      title="Save your progress and return to your dashboard"
      aria-label="Save and back to dashboard"
    >
      {isSaving ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Save className="h-4 w-4 mr-2" />
      )}
      {isSaving ? 'Saving…' : 'Save & Back'}
    </Button>
  );
};

export default SaveAndBackButton;
