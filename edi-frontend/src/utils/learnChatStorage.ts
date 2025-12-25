/**
 * Learn Mode Chat Storage System
 * Isolated storage for learn mode conversations, separate from work mode chats
 */

export interface LearnChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isAnalyzing?: boolean;
}

export interface LearnChat {
  id: string;
  workspaceId: string;
  messages: LearnChatMessage[];
  created_at: string;
  updated_at: string;
}

const LEARN_CHAT_STORAGE_KEY = 'edi_learn_chats';
const LEARN_ACTIVE_CHAT_KEY = 'edi_learn_active_chat';

/**
 * Generate unique learn chat ID
 */
export function generateLearnChatId(): string {
  return `learn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get all learn chats from storage
 */
export function getLearnChats(): LearnChat[] {
  try {
    const stored = localStorage.getItem(LEARN_CHAT_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to load learn chats:', error);
    return [];
  }
}

/**
 * Save learn chat to storage
 */
export function saveLearnChat(chat: LearnChat): void {
  try {
    const chats = getLearnChats();
    const existingIndex = chats.findIndex(c => c.id === chat.id);

    if (existingIndex >= 0) {
      chats[existingIndex] = { ...chat, updated_at: new Date().toISOString() };
    } else {
      chats.push({ ...chat, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }

    localStorage.setItem(LEARN_CHAT_STORAGE_KEY, JSON.stringify(chats));
  } catch (error) {
    console.error('Failed to save learn chat:', error);
  }
}

/**
 * Get specific learn chat by ID
 */
export function getLearnChat(chatId: string): LearnChat | null {
  const chats = getLearnChats();
  return chats.find(chat => chat.id === chatId) || null;
}

/**
 * Delete learn chat
 */
export function deleteLearnChat(chatId: string): void {
  try {
    const chats = getLearnChats();
    const filtered = chats.filter(chat => chat.id !== chatId);
    localStorage.setItem(LEARN_CHAT_STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to delete learn chat:', error);
  }
}

/**
 * Get learn chats for specific workspace
 */
export function getLearnChatsForWorkspace(workspaceId: string): LearnChat[] {
  return getLearnChats()
    .filter(chat => chat.workspaceId === workspaceId)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

/**
 * Save learn chat messages
 */
export function saveLearnChatMessages(chatId: string, messages: LearnChatMessage[]): void {
  const chat = getLearnChat(chatId);
  if (chat) {
    chat.messages = messages;
    saveLearnChat(chat);
  }
}

/**
 * Create new learn chat
 */
export function createLearnChat(workspaceId: string): LearnChat {
  const newChat: LearnChat = {
    id: generateLearnChatId(),
    workspaceId,
    messages: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  saveLearnChat(newChat);
  return newChat;
}

/**
 * Set active learn chat
 */
export function setActiveLearnChat(chatId: string): void {
  try {
    localStorage.setItem(LEARN_ACTIVE_CHAT_KEY, chatId);
  } catch (error) {
    console.error('Failed to set active learn chat:', error);
  }
}

/**
 * Get active learn chat ID
 */
export function getActiveLearnChatId(): string | null {
  try {
    return localStorage.getItem(LEARN_ACTIVE_CHAT_KEY);
  } catch (error) {
    console.error('Failed to get active learn chat:', error);
    return null;
  }
}

/**
 * Clear all learn chat data (for testing/reset)
 */
export function clearAllLearnChats(): void {
  try {
    localStorage.removeItem(LEARN_CHAT_STORAGE_KEY);
    localStorage.removeItem(LEARN_ACTIVE_CHAT_KEY);
  } catch (error) {
    console.error('Failed to clear learn chats:', error);
  }
}