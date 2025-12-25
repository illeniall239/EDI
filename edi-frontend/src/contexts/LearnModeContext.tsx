'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';
import type { LearningProgress } from '@/types';
import { fetchLearnProgress, fetchLearnDatasets, fetchPracticeChallenge, sendLearnQuery } from '@/utils/api';
import type { LearnQueryResponse } from '@/types';
import {
  LearnChat,
  LearnChatMessage,
  createLearnChat,
  getLearnChatsForWorkspace,
  saveLearnChatMessages,
  getActiveLearnChatId,
  setActiveLearnChat,
  getLearnChat
} from '@/utils/learnChatStorage';

type Difficulty = 'beginner' | 'intermediate' | 'advanced';

interface LearnModeState {
  workspaceId?: string;
  progress: LearningProgress[];
  selectedConcept: string | null;
  datasets: any[];
  activeChallenge: any | null;
  tutorResponse: LearnQueryResponse | null;
  loading: boolean;
  error: string | null;
  // Learn Chat System
  activeLearnChat: LearnChat | null;
  learnMessages: LearnChatMessage[];
  learnChats: LearnChat[];
}

interface LearnModeActions {
  initialize: (workspaceId: string) => Promise<void>;
  refreshProgress: () => Promise<void>;
  selectConcept: (conceptId: string | null) => void;
  getPracticeChallenge: (conceptId: string, difficulty?: Difficulty) => Promise<void>;
  askTutor: (question: string, sheetContext?: any) => Promise<LearnQueryResponse | null>;
  clearTutor: () => void;
  // Learn Chat Actions
  startNewLearnConversation: () => void;
  clearLearnConversation: () => void;
}

const LearnModeContext = createContext<(LearnModeState & LearnModeActions) | undefined>(undefined);

export function LearnModeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LearnModeState>({
    progress: [],
    selectedConcept: null,
    datasets: [],
    activeChallenge: null,
    tutorResponse: null,
    loading: false,
    error: null,
    // Learn Chat System
    activeLearnChat: null,
    learnMessages: [],
    learnChats: [],
  });

  const initialize = async (workspaceId: string) => {
    setState((s) => ({ ...s, workspaceId, loading: true, error: null }));
    try {
      const [progress, datasets] = await Promise.all([
        fetchLearnProgress(workspaceId).catch(() => []),
        fetchLearnDatasets().catch(() => []),
      ]);

      // Initialize learn chat system
      const learnChats = getLearnChatsForWorkspace(workspaceId);
      let activeLearnChat: LearnChat | null = null;
      let learnMessages: LearnChatMessage[] = [];

      // Try to restore active learn chat
      const activeLearnChatId = getActiveLearnChatId();
      if (activeLearnChatId) {
        const existingChat = getLearnChat(activeLearnChatId);
        if (existingChat && existingChat.workspaceId === workspaceId) {
          activeLearnChat = existingChat;
          learnMessages = existingChat.messages;
        }
      }

      // If no active chat found, create a new one for this workspace
      if (!activeLearnChat) {
        activeLearnChat = createLearnChat(workspaceId);
        setActiveLearnChat(activeLearnChat.id);
      }

      setState((s) => ({
        ...s,
        progress,
        datasets,
        learnChats,
        activeLearnChat,
        learnMessages,
        loading: false
      }));
    } catch (e: any) {
      setState((s) => ({ ...s, loading: false, error: e?.message || 'Failed to initialize learn mode' }));
    }
  };

  const refreshProgress = async () => {
    if (!state.workspaceId) return;
    try {
      const progress = await fetchLearnProgress(state.workspaceId);
      setState((s) => ({ ...s, progress }));
    } catch (e: any) {
      setState((s) => ({ ...s, error: e?.message || 'Failed to refresh progress' }));
    }
  };

  const selectConcept = (conceptId: string | null) => {
    setState((s) => ({ ...s, selectedConcept: conceptId }));
  };

  const getPracticeChallenge = async (conceptId: string, difficulty: Difficulty = 'beginner') => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const challenge = await fetchPracticeChallenge({ conceptId, difficulty });
      setState((s) => ({ ...s, activeChallenge: challenge, loading: false }));
    } catch (e: any) {
      setState((s) => ({ ...s, loading: false, error: e?.message || 'Failed to get challenge' }));
    }
  };

  const askTutor = async (question: string, sheetContext?: any): Promise<LearnQueryResponse | null> => {
    if (!state.workspaceId || !state.activeLearnChat) return null;

    try {
      // Add user message to conversation
      const userMessage: LearnChatMessage = {
        role: 'user',
        content: question,
        timestamp: Date.now()
      };

      const updatedMessages = [...state.learnMessages, userMessage];

      // Update state with user message
      setState((s) => ({ ...s, learnMessages: updatedMessages }));

      // Save conversation to storage
      saveLearnChatMessages(state.activeLearnChat.id, updatedMessages);

      // Send to API with conversation context and sheet context
      console.log('🔍 [LearnMode] Sending query with conversation history:', {
        question,
        conversationHistoryLength: updatedMessages.length,
        conversationHistory: updatedMessages.slice(-10),
        chatId: state.activeLearnChat.id,
        hasSheetContext: !!sheetContext
      });

      const res = await sendLearnQuery({
        question,
        workspaceId: state.workspaceId,
        chatId: state.activeLearnChat.id,
        userProgress: state.progress,
        sheetContext: sheetContext || {},
        conversationHistory: updatedMessages.slice(-10) // Last 10 messages for context
      });

      // Add assistant response to conversation
      const assistantMessage: LearnChatMessage = {
        role: 'assistant',
        content: res.response,
        timestamp: Date.now()
      };

      const finalMessages = [...updatedMessages, assistantMessage];

      // Update state with assistant response
      setState((s) => ({
        ...s,
        tutorResponse: res,
        learnMessages: finalMessages
      }));

      // Save final conversation to storage
      saveLearnChatMessages(state.activeLearnChat.id, finalMessages);

      return res;
    } catch (e: any) {
      setState((s) => ({ ...s, error: e?.message || 'Tutor request failed' }));
      return null;
    }
  };

  const clearTutor = () => setState((s) => ({ ...s, tutorResponse: null }));

  const startNewLearnConversation = () => {
    if (!state.workspaceId) return;

    // Create new learn chat
    const newChat = createLearnChat(state.workspaceId);
    setActiveLearnChat(newChat.id);

    // Update state
    setState((s) => ({
      ...s,
      activeLearnChat: newChat,
      learnMessages: [],
      learnChats: [newChat, ...s.learnChats],
      tutorResponse: null
    }));
  };

  const clearLearnConversation = () => {
    if (!state.activeLearnChat) return;

    // Clear messages but keep the chat
    const clearedChat = { ...state.activeLearnChat, messages: [] };
    saveLearnChatMessages(clearedChat.id, []);

    setState((s) => ({
      ...s,
      learnMessages: [],
      tutorResponse: null
    }));
  };

  const value = useMemo(() => ({
    ...state,
    initialize,
    refreshProgress,
    selectConcept,
    getPracticeChallenge,
    askTutor,
    clearTutor,
    startNewLearnConversation,
    clearLearnConversation,
  }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [state]);

  return (
    <LearnModeContext.Provider value={value}>
      {children}
    </LearnModeContext.Provider>
  );
}

export function useLearnMode() {
  const ctx = useContext(LearnModeContext);
  if (!ctx) throw new Error('useLearnMode must be used within LearnModeProvider');
  return ctx;
}


