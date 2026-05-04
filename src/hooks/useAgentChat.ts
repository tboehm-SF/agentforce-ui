import { useState, useRef, useCallback } from 'react';
import type { Message, Session } from '../types';
import type { SalesforceConfig } from '../types';
import { createSession, sendMessageStreaming, endSession } from '../api/agentforce';
import {
  createServerSession,
  sendServerMessageStreaming,
  deleteServerSession,
} from '../api/agentforceServer';

/**
 * When VITE_SHOWCASE_MODE=true the app routes all API calls through the
 * Express server (no SF token in the browser). Otherwise it talks to SF directly.
 */
const SHOWCASE = import.meta.env.VITE_SHOWCASE_MODE === 'true';

interface UseAgentChatOptions {
  config?: SalesforceConfig; // not needed in showcase mode
  agentApiName: string;
}

export function useAgentChat({ config, agentApiName }: UseAgentChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');

  const sessionRef = useRef<Session | null>(null);
  const streamBufferRef = useRef('');

  const ensureSession = useCallback(async (): Promise<Session> => {
    if (sessionRef.current) return sessionRef.current;
    const session = SHOWCASE
      ? await createServerSession(agentApiName)
      : await createSession(config!, agentApiName);
    sessionRef.current = session;
    return session;
  }, [config, agentApiName]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;
      setError(null);

      const userMsg: Message = {
        id:        crypto.randomUUID(),
        role:      'user',
        content:   text,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const session = await ensureSession();
        setIsLoading(false);
        setIsStreaming(true);
        streamBufferRef.current = '';
        setStreamingText('');

        const onChunk = (chunk: string) => {
          streamBufferRef.current += chunk;
          setStreamingText(streamBufferRef.current);
        };

        const onDone = (fullText: string) => {
          const agentMsg: Message = {
            id:        crypto.randomUUID(),
            role:      'agent',
            content:   fullText || streamBufferRef.current,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, agentMsg]);
          setIsStreaming(false);
          setStreamingText('');
          streamBufferRef.current = '';
        };

        const onError = (err: Error) => {
          setError(err.message);
          setIsStreaming(false);
          setIsLoading(false);
        };

        if (SHOWCASE) {
          await sendServerMessageStreaming(session.sessionId, text, onChunk, onDone, onError);
        } else {
          await sendMessageStreaming(config!, agentApiName, session.sessionId, text, onChunk, onDone, onError);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setIsLoading(false);
        setIsStreaming(false);
      }
    },
    [config, agentApiName, ensureSession, isLoading]
  );

  const clearChat = useCallback(async () => {
    if (sessionRef.current) {
      if (SHOWCASE) {
        await deleteServerSession(sessionRef.current.sessionId).catch(() => {});
      } else {
        await endSession(config!, agentApiName, sessionRef.current.sessionId).catch(() => {});
      }
      sessionRef.current = null;
    }
    setMessages([]);
    setStreamingText('');
    setError(null);
  }, [config, agentApiName]);

  return { messages, sendMessage, clearChat, isLoading, isStreaming, streamingText, error };
}
