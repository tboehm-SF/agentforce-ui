import { useState, useRef, useCallback } from 'react';
import type { Message, Session } from '../types';
import {
  createServerSession,
  sendServerMessageStreaming,
  deleteServerSession,
} from '../api/agentforceServer';

/**
 * Stateful chat hook — always routes through the Express server proxy.
 * The server holds SF credentials; no auth needed client-side.
 */
export function useAgentChat({ agentApiName }: { agentApiName: string; }) {
  const [messages,     setMessages]     = useState<Message[]>([]);
  const [isLoading,    setIsLoading]    = useState(false);
  const [isStreaming,  setIsStreaming]  = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [streamingText,setStreamingText] = useState('');

  const sessionRef      = useRef<Session | null>(null);
  const streamBufferRef = useRef('');

  const ensureSession = useCallback(async (): Promise<Session> => {
    if (sessionRef.current) return sessionRef.current;
    const session = await createServerSession(agentApiName);
    sessionRef.current = session;
    return session;
  }, [agentApiName]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;
    setError(null);

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', content: text, timestamp: new Date() },
    ]);
    setIsLoading(true);

    try {
      const session = await ensureSession();
      setIsLoading(false);
      setIsStreaming(true);
      streamBufferRef.current = '';
      setStreamingText('');

      await sendServerMessageStreaming(
        session.sessionId,
        text,
        (chunk) => {
          streamBufferRef.current += chunk;
          setStreamingText(streamBufferRef.current);
        },
        (fullText) => {
          setMessages((prev) => [
            ...prev,
            {
              id:        crypto.randomUUID(),
              role:      'agent',
              content:   fullText || streamBufferRef.current,
              timestamp: new Date(),
            },
          ]);
          setIsStreaming(false);
          setStreamingText('');
          streamBufferRef.current = '';
        },
        (err) => {
          setError(err.message);
          setIsStreaming(false);
          setIsLoading(false);
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsLoading(false);
      setIsStreaming(false);
    }
  }, [ensureSession, isLoading]);

  const clearChat = useCallback(async () => {
    if (sessionRef.current) {
      await deleteServerSession(sessionRef.current.sessionId).catch(() => {});
      sessionRef.current = null;
    }
    setMessages([]);
    setStreamingText('');
    setError(null);
  }, []);

  return { messages, sendMessage, clearChat, isLoading, isStreaming, streamingText, error };
}
