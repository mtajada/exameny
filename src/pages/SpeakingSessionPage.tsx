import { ArrowLeft, Loader2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SpeakingRehearsal } from '@/features/speaking/SpeakingRehearsal';
import { useSaveSpeakingTranscript } from '@/features/speaking/useSaveSpeakingTranscript';
import { useSpeakingSession } from '@/features/speaking/useSpeakingSession';

export default function SpeakingSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const session = useSpeakingSession(sessionId);
  const saver = useSaveSpeakingTranscript(false);

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-5 py-8">
      <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" to="/speaking">
        <ArrowLeft className="h-4 w-4" /> Back to speaking practice
      </Link>

      {session.isLoading && (
        <Card>
          <CardContent className="flex items-center gap-3 py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading speaking session…
          </CardContent>
        </Card>
      )}

      {session.error && (
        <Alert variant="destructive">
          <AlertTitle>Speaking session unavailable</AlertTitle>
          <AlertDescription>{session.error}</AlertDescription>
        </Alert>
      )}

      {!session.isLoading && !session.error && session.status !== 'active' && (
        <Card>
          <CardHeader>
            <CardTitle>This rehearsal is already closed</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-muted-foreground">
            Completed and aborted sessions are read-only. Start a new rehearsal to practise again.
          </CardContent>
        </Card>
      )}

      {session.selection && session.status === 'active' && sessionId && (
        <SpeakingRehearsal
          isSaving={saver.isSaving}
          onComplete={(transcript) => saver.saveTranscript(sessionId, transcript)}
          saveError={saver.error}
          selection={session.selection}
        />
      )}
    </div>
  );
}
