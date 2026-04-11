import { createContext, useContext } from 'react';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';

type EditorActorRef = ActorRefFrom<typeof editorMachine>;

// eslint-disable-next-line react-refresh/only-export-components
export const EditorContext = createContext<EditorActorRef | null>(null);

export function EditorProvider({
  actorRef,
  children,
}: {
  actorRef: EditorActorRef;
  children: React.ReactNode;
}) {
  return <EditorContext.Provider value={actorRef}>{children}</EditorContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useEditorActor(): EditorActorRef {
  const actorRef = useContext(EditorContext);
  if (!actorRef) {
    throw new Error('useEditorActor must be used within EditorProvider');
  }
  return actorRef;
}
