'use client';

import React from 'react';
import { Plus, RefreshCw, Save, Check, Zap } from 'lucide-react';
import { isUniverEnabled, toggleSpreadsheetEngine } from '@/config/spreadsheetConfig';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { sendQuery, cancelOperation, resetState, createNewChat, loadChats, saveChatMessages, loadChatMessages, uploadFile, sendLearnQuery, saveWorkspaceData, analyzeWorkspaceInsights, smartFormatWorkspace, quickDataEntryWorkspace } from '@/utils/api';
import { commandService } from '@/services/commandService';
import { llmCommandClassifier, CommandClassification } from '@/services/llmCommandClassifier';
// NEW: Universal Query Router for intelligent routing
import { universalQueryRouter, ProcessorType, UniversalQueryType } from '@/services/universalQueryRouter';
import { ChatMessage, Chat, ClarificationResponse } from '@/types';
import { TypeAnimation } from 'react-type-animation';
import Image from 'next/image';
import { API_BASE_URL } from '@/config';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useLearnMode } from '@/contexts/LearnModeContext';
import AIPrompt from '@/components/AIPrompt';
import { UniverAdapter } from '@/utils/univerAdapter';
import { findDuplicateRows, parseColumnSpec } from '@/utils/duplicateDetector';

interface ChatSidebarProps {
    isDataLoaded: boolean;
    data?: Array<any>;
    isExpanded: boolean;
    onToggle: () => void;
    // Voice functionality
    isListening?: boolean;
    isProcessingCommand?: boolean;
    onStartVoiceRecognition?: () => void;
    onStopVoiceRecognition?: () => void;
    // File upload functionality
    onFileUpload?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    // Backend initialization for workspace loading
    filename?: string;
    isFromSavedWorkspace?: boolean;
    minimal?: boolean; // NEW: learn-focused minimal UI
    mode?: 'work' | 'learn'; // Mode for conditional rendering
    concept?: string; // Current learning concept
    currentSelection?: string; // Current cell selection
    getCurrentData?: () => any[]; // Get current live spreadsheet data
    univerAdapter?: UniverAdapter | null; // Univer spreadsheet adapter for command execution
}

export default function ChatSidebar({
    isDataLoaded,
    data,
    isExpanded,
    onToggle,
    isListening = false,
    isProcessingCommand = false,
    onStartVoiceRecognition,
    onStopVoiceRecognition,
    onFileUpload,
    filename,
    isFromSavedWorkspace = false,
    minimal = false,
    mode = 'work',
    concept = '',
    currentSelection = '',
    getCurrentData,
    univerAdapter = null
}: ChatSidebarProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [queryMode, setQueryMode] = useState<'simple' | 'complex'>('simple');
    const [isLoadingChat, setIsLoadingChat] = useState(false);
    const [isBackendInitialized, setIsBackendInitialized] = useState(!isFromSavedWorkspace);
    
    // NEW: Multiple chat state management
    const [chats, setChats] = useState<Chat[]>([]);
    const [activeChat, setActiveChat] = useState<Chat | null>(null);
    const [isCreatingChat, setIsCreatingChat] = useState(false);

    // Learning guidance state
    const [learningTips, setLearningTips] = useState<Array<{
      id: string;
      title: string;
      description: string;
      example?: string;
      completed?: boolean;
    }>>([]);
    const [currentTipIndex, setCurrentTipIndex] = useState(0);

    // Helpers to format A1 ranges
    const columnIndexToLetter = useCallback((index: number): string => {
      let result = '';
      let i = index;
      while (i >= 0) {
        result = String.fromCharCode((i % 26) + 65) + result;
        i = Math.floor(i / 26) - 1;
      }
      return result;
    }, []);

    const columnNameToLetter = useCallback((name: string, columns: string[]): string => {
      const idx = columns.indexOf(name);
      return idx >= 0 ? columnIndexToLetter(idx) : name;
    }, [columnIndexToLetter]);

    // Analyze sheet data and generate contextual learning tips
    const generateLearningTips = useCallback((concept: string, sheetData: any[]) => {
      if (!sheetData || sheetData.length === 0) {
        return [{
          id: 'no_data',
          title: 'No Data Found',
          description: 'Your sheet appears to be empty. Try uploading some data to get started.',
          completed: false
        }];
      }

      const firstRow = sheetData[0];
      const columns = Object.keys(firstRow || {});
      const numericColumns = columns.filter(col => {
        const values = sheetData.slice(1).map(row => row[col]).filter(val => val !== null && val !== undefined);
        return values.some(val => typeof val === 'number' || !isNaN(Number(val)));
      });
      // Assuming row 1 is headers, data begins at row 2
      const lastRow = sheetData.length + 1;

      switch (concept.toLowerCase()) {
        case 'basic_functions':
        case 'sum':
          if (numericColumns.length === 0) {
            return [{
              id: 'no_numeric',
              title: 'No Numeric Columns Found',
              description: `I don't see any columns with numbers. Found columns: ${columns.join(', ')}.`,
              completed: false
            }];
          }

          return [
            {
              id: 'select_range',
              title: 'Select Your Data Range',
              description: `I see ${numericColumns.length} numeric column${numericColumns.length > 1 ? 's' : ''}: ${numericColumns.join(', ')}. Try selecting one of these columns.`,
              example: `Select cells in the "${numericColumns[0]}" column`,
              completed: false
            },
            {
              id: 'enter_formula',
              title: 'Enter the SUM Formula',
              description: `Type =SUM( in the formula bar and select the range you want to sum from the "${numericColumns[0]}" column.`,
              example: `=SUM(${columnNameToLetter(numericColumns[0], columns)}2:${columnNameToLetter(numericColumns[0], columns)}${lastRow})`,
              completed: false
            },
            {
              id: 'complete_formula',
              title: 'Complete and Press Enter',
              description: `Close the parentheses and press Enter to calculate the sum of your "${numericColumns[0]}" data.`,
              completed: false
            }
          ];

        case 'average':
          if (numericColumns.length === 0) {
            return [{
              id: 'no_numeric_avg',
              title: 'No Numeric Data Available',
              description: `I need numeric columns to calculate averages. Found columns: ${columns.join(', ')}.`,
              completed: false
            }];
          }

          return [
            {
              id: 'select_avg_range',
              title: 'Select Data for Averaging',
              description: `I found ${numericColumns.length} numeric column${numericColumns.length > 1 ? 's' : ''}: ${numericColumns.join(', ')}. Choose one to calculate the average.`,
              example: `Select "${numericColumns[0]}" column data`,
              completed: false
            },
            {
              id: 'enter_average',
              title: 'Enter AVERAGE Formula',
              description: `Type =AVERAGE( to calculate the mean of your "${numericColumns[0]}" selection.`,
              example: `=AVERAGE(${columnNameToLetter(numericColumns[0], columns)}2:${columnNameToLetter(numericColumns[0], columns)}${lastRow})`,
              completed: false
            }
          ];

        case 'vlookup':
          const textColumns = columns.filter(col => {
            const values = sheetData.slice(1).map(row => row[col]).filter(val => val !== null && val !== undefined);
            return values.some(val => typeof val === 'string' && isNaN(Number(val)));
          });

          if (textColumns.length === 0) {
            return [{
              id: 'no_lookup',
              title: 'Need Lookup Columns',
              description: `VLOOKUP requires columns to search in. I found: ${columns.join(', ')}.`,
              completed: false
            }];
          }

          return [
            {
              id: 'select_lookup_value',
              title: 'Choose Lookup Value',
              description: `I see ${textColumns.length} text column${textColumns.length > 1 ? 's' : ''}: ${textColumns.join(', ')}. Pick a value to look up.`,
              example: `Select a value from "${textColumns[0]}" column`,
              completed: false
            },
            {
              id: 'select_table_array',
              title: 'Select Table Array',
              description: `Select the range containing both lookup values and results. Include columns like: ${columns.join(', ')}.`,
              example: `Select A2:${columnIndexToLetter(columns.length - 1)}${lastRow}`,
              completed: false
            },
            {
              id: 'specify_column_index',
              title: 'Choose Result Column',
              description: `Enter which column number contains the result you want from your selected range.`,
              example: 'Use 3 to get data from the 3rd column',
              completed: false
            }
          ];

        default:
          return [{
            id: 'default',
            title: 'Ready to Learn!',
            description: `I can see your sheet has ${columns.length} column${columns.length > 1 ? 's' : ''}: ${columns.join(', ')}. Try selecting some cells and entering a formula.`,
            completed: false
          }];
      }
    }, [columnNameToLetter, columnIndexToLetter]);

    // Modal state for expanded image view
    const [expandedImage, setExpandedImage] = useState<string | null>(null);

    // Save state management for learn mode
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    
    const messagesEndRef = useRef<HTMLDivElement>(null);
    
    // Handle modal body scroll blocking and interaction prevention
    useEffect(() => {
        if (expandedImage) {
            // Add modal-open class to body to prevent all interactions
            document.body.classList.add('modal-open');
            
            // Add event listener to close on Escape
            const handleEscape = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    setExpandedImage(null);
                }
            };
            
            document.addEventListener('keydown', handleEscape);
            
            return () => {
                document.body.classList.remove('modal-open');
                document.removeEventListener('keydown', handleEscape);
            };
        }
    }, [expandedImage]);
    const { currentWorkspace } = useWorkspace();
    let learnContext: any = undefined;
    try { // safe hook call only inside component
        learnContext = (useLearnMode as any)();
    } catch {}

    // Generate learning tips when concept or data changes
    useEffect(() => {
      if (mode === 'learn' && concept && data) {
        const tips = generateLearningTips(concept, data);
        setLearningTips(tips);
        setCurrentTipIndex(0);
      }
    }, [mode, concept, data, generateLearningTips]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // Handle learning mode message sending
    // NOTE: This function appears to be unused - commenting out to fix linter warnings
    // If needed in future, uncomment and integrate properly
    /*
    const handleSendMessage = async () => {
        if (!input.trim() || isProcessing) return;

        const messageToSend = input.trim();
        setInput('');

        try {
            setIsProcessing(true);

            // Add user message to chat
            const userMessage: ChatMessage = {
                id: Date.now().toString(),
                type: 'user',
                content: messageToSend,
                timestamp: new Date()
            };

            setMessages(prev => [...prev, userMessage]);

            // Send to learning API
            // Build richer sheet context with headers and A1 mapping for backend
            const headers = data && data.length > 0 ? Object.keys(data[0]) : [];
            const columnMap: Record<string, string> = {};
            headers.forEach((h, idx) => {
                columnMap[h] = columnIndexToLetter(idx);
            });

            // Use LearnModeContext's askTutor for proper conversation history management
            if (learnContext && learnContext.askTutor) {
                const sheetContext = {
                    data: data,
                    headers,
                    columnMap,
                    currentSelection: currentSelection
                };
                const response = await learnContext.askTutor(messageToSend, sheetContext);

                if (response) {
                    // Add AI response to chat
                    const aiMessage: ChatMessage = {
                        id: (Date.now() + 1).toString(),
                        type: 'assistant',
                        content: response.response || '',
                        timestamp: new Date()
                    };

                    setMessages(prev => [...prev, aiMessage]);
                }
            } else {
                // Fallback for when learnContext is not available
                const isFirst = messages.length === 0;

                const response = await sendLearnQuery({
                    question: messageToSend,
                    workspaceId: currentWorkspace?.id || 'default',
                    isFirstMessage: isFirst,
                    sheetContext: {
                        data: data,
                        headers,
                        columnMap,
                        currentSelection: currentSelection
                    },
                    conversationHistory: messages.map(msg => ({
                        role: msg.type === 'user' ? 'user' : 'assistant',
                        content: msg.content,
                        timestamp: msg.timestamp instanceof Date
                            ? msg.timestamp.getTime()
                            : typeof msg.timestamp === 'number'
                                ? msg.timestamp
                                : Date.now()
                    }))
                });

                if (response.success) {
                    // Add AI response to chat
                    const aiMessage: ChatMessage = {
                        id: (Date.now() + 1).toString(),
                        type: 'assistant',
                        content: (response as any).data?.response || (response as any).data || response.response || '',
                        timestamp: new Date()
                    };

                    setMessages(prev => [...prev, aiMessage]);
                } else {
                    // Add error message
                    const errorMessage: ChatMessage = {
                        id: (Date.now() + 1).toString(),
                        type: 'assistant',
                        content: `Sorry, I encountered an error: ${(response as any).error || 'Unknown error'}`,
                        timestamp: new Date()
                    };

                    setMessages(prev => [...prev, errorMessage]);
                }
            }
        } catch (error) {
            const errorMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                type: 'assistant',
                content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : String(error)}`,
                timestamp: new Date()
            };

            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsProcessing(false);
        }
    };
    */

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Debug: Track when messages change and log their isTyping state
    useEffect(() => {
        console.log('🔍 DEBUG - Messages state changed. Current messages with typing status:', 
            messages.map((msg, i) => ({
                index: i,
                role: msg.role,
                hasIsTyping: 'isTyping' in msg,
                isTypingValue: msg.isTyping,
                content: msg.content?.substring(0, 30) + '...'
            }))
        );
    }, [messages]);

    useEffect(() => {
        if (isDataLoaded) {
            setIsProcessing(false);
        }
    }, [isDataLoaded]);


    // Note: Removed old loadWorkspaceChatHistory useEffect to prevent race condition
    // Chat loading is now handled by the loadWorkspaceChats function in the useEffect below

    // Helper function to save chat messages to active chat
    const saveChatMessagesToActiveChat = async (newMessages: ChatMessage[]) => {
        if (activeChat?.id) {
            try {
                await saveChatMessages(activeChat.id, newMessages);
                
                // Update the chat in the chats list with new messages
                setChats(prev => 
                    prev.map(chat => 
                        chat.id === activeChat.id 
                            ? { ...chat, messages: newMessages, updated_at: new Date().toISOString() }
                            : chat
                    )
                );
            } catch (error) {
                console.error('❌ Failed to save chat messages:', error);
                // Don't show error to user, this is auto-save
            }
        }
    };

    // Initialize backend with saved workspace data
    const initializeBackend = async () => {
        if (!data || !filename || !currentWorkspace?.id || isBackendInitialized) {
            return;
        }

        try {
            // LEARN MINIMAL ROUTE: use teaching endpoint
            if (minimal && currentWorkspace?.id) {
                // Gather light sheet context: selection + headers preview (no full data dump)
                const sheetContext: any = {};

                // ⚠️ REMOVED: Luckysheet-based sheet context gathering
                // TODO: Implement with Univer if learn mode needs selection context
                // For now, learn mode works without selection context
                try {
                    // Placeholder for future Univer implementation
                    // Could use univerAdapter.getSelection() if implemented
                } catch {}

                // Use LearnModeContext for proper conversation history
                const latestUserMessage =
                    [...messages].reverse().find(msg => (msg.role || (msg.type === 'user' ? 'user' : 'assistant')) === 'user')?.content
                    ?? 'Explain this data';
                let learnResult;
                if (learnContext && learnContext.askTutor) {
                    learnResult = await learnContext.askTutor(latestUserMessage, sheetContext);
                } else {
                    // Fallback with conversation history
                    learnResult = await sendLearnQuery({
                        question: latestUserMessage,
                        workspaceId: currentWorkspace.id,
                        userProgress: learnContext?.progress || [],
                        sheetContext,
                        conversationHistory: messages.map(msg => ({
                            role: msg.role || (msg.type === 'user' ? 'user' : 'assistant'),
                            content: msg.content,
                            timestamp: msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now()
                        }))
                    });
                }
                const teaching = [
                    learnResult.response,
                    (learnResult.guiding_questions || learnResult.guidingQuestions)?.length ? '\n\nGuiding questions:\n- ' + (learnResult.guiding_questions || learnResult.guidingQuestions).join('\n- ') : ''
                ].join('');
                setMessages(prev => {
                    const newMessages = prev.filter(msg => !msg.isAnalyzing);
                    const assistantMessage: ChatMessage = {
                        id: (Date.now() + 1).toString(),
                        role: 'assistant',
                        type: 'assistant',
                        content: teaching,
                        timestamp: new Date()
                    };
                    const updated = [...newMessages, assistantMessage];
                    saveChatMessagesToActiveChat(updated);
                    return updated;
                });
                setIsProcessing(false);
                return;
            }
            console.log('🔄 Initializing backend for saved workspace...');
            
            // Convert data array to CSV string
            const headers = Object.keys(data[0]).join(',');
            const rows = data.map(row => 
                Object.values(row).map(val => 
                    typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val
                ).join(',')
            );
            const csvContent = [headers, ...rows].join('\n');
            
            // Create CSV file
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const file = new File([blob], filename || 'workspace_data.csv', { type: 'text/csv' });
            
            // Upload to backend to initialize data handler
            await uploadFile(file, currentWorkspace.id);
            setIsBackendInitialized(true);
            console.log('✅ Backend initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize backend:', error);
            throw error;
        }
    };

    // LLM-guided conditional formatting handler
    const handleLLMConditionalFormatting = async (classification: CommandClassification): Promise<boolean> => {
        console.log('🎨 [CF Handler] Processing conditional formatting command');
        console.log('📋 Classification:', classification);

        try {
            // Check if Univer is available
            if (!univerAdapter || !univerAdapter.isReady()) {
                throw new Error('Univer is not available');
            }

            const action = classification.action;
            const params = classification.parameters || {};

            let success = false;
            let message = '';
            let range: string | undefined = typeof params.range === 'string'
                ? params.range
                : typeof params.column === 'string'
                    ? params.column
                    : undefined;

            // If column specified (like "column A"), convert to range (like "A:A")
            if (range && /^[A-Z]$/i.test(range)) {
                range = `${range.toUpperCase()}:${range.toUpperCase()}`;
            }

            // Handle different CF actions
            switch (action) {
                case 'highlight_duplicates':
                    console.log('[CF Handler] Creating duplicate values rule');
                    success = univerAdapter.createDuplicateValuesRule(range);
                    message = success
                        ? `✅ Duplicate values highlighted${range ? ` in ${range}` : ''}`
                        : '❌ Failed to create duplicate values rule';
                    break;

                case 'highlight_greater_than': {
                    const gtValueRaw = params.value ?? params.threshold;
                    const gtValue = typeof gtValueRaw === 'number'
                        ? gtValueRaw
                        : typeof gtValueRaw === 'string'
                            ? parseFloat(gtValueRaw)
                            : undefined;
                    if (gtValue === undefined || Number.isNaN(gtValue)) {
                        throw new Error('Missing value/threshold for greater than rule');
                    }
                    console.log(`[CF Handler] Creating greater than rule: > ${gtValue}`);
                    success = univerAdapter.createGreaterThanRule(range || 'A:Z', gtValue);
                    message = success
                        ? `✅ Cells greater than ${gtValueRaw} highlighted`
                        : '❌ Failed to create greater than rule';
                    break;
                }

                case 'highlight_less_than': {
                    const ltValueRaw = params.value ?? params.threshold;
                    const ltValue = typeof ltValueRaw === 'number'
                        ? ltValueRaw
                        : typeof ltValueRaw === 'string'
                            ? parseFloat(ltValueRaw)
                            : undefined;
                    if (ltValue === undefined || Number.isNaN(ltValue)) {
                        throw new Error('Missing value/threshold for less than rule');
                    }
                    console.log(`[CF Handler] Creating less than rule: < ${ltValue}`);
                    success = univerAdapter.createLessThanRule(range || 'A:Z', ltValue);
                    message = success
                        ? `✅ Cells less than ${ltValueRaw} highlighted`
                        : '❌ Failed to create less than rule';
                    break;
                }

                case 'highlight_equals': {
                    const eqValueRaw = params.value;
                    const eqValue = typeof eqValueRaw === 'number'
                        ? eqValueRaw
                        : typeof eqValueRaw === 'string'
                            ? parseFloat(eqValueRaw)
                            : undefined;
                    if (eqValue === undefined || Number.isNaN(eqValue)) {
                        throw new Error('Missing value for equals rule');
                    }
                    console.log(`[CF Handler] Creating equals rule: = ${eqValue}`);
                    success = univerAdapter.createEqualsRule(range || 'A:Z', eqValue);
                    message = success
                        ? `✅ Cells equal to ${eqValueRaw} highlighted`
                        : '❌ Failed to create equals rule';
                    break;
                }

                case 'highlight_contains': {
                    const text = typeof params.text === 'string'
                        ? params.text
                        : typeof params.value === 'string'
                            ? params.value
                            : '';
                    if (!text) {
                        throw new Error('Missing text for contains rule');
                    }
                    console.log(`[CF Handler] Creating text contains rule: contains "${text}"`);
                    success = univerAdapter.createTextContainsRule(range || 'A:Z', text);
                    message = success
                        ? `✅ Cells containing "${text}" highlighted`
                        : '❌ Failed to create text contains rule';
                    break;
                }

                case 'highlight_unique':
                    console.log('[CF Handler] Creating unique values rule');
                    success = univerAdapter.createUniqueValuesRule(range);
                    message = success
                        ? `✅ Unique values highlighted${range ? ` in ${range}` : ''}`
                        : '❌ Failed to create unique values rule';
                    break;

                case 'clear_conditional_formatting':
                    console.log('[CF Handler] Clearing all CF rules');
                    success = univerAdapter.clearConditionalFormatRules();
                    message = success
                        ? '✅ All conditional formatting rules cleared'
                        : '❌ Failed to clear conditional formatting rules';
                    break;

                default:
                    throw new Error(`Unsupported CF action: ${action}`);
            }

            // Update UI with result
            setMessages(prev => {
                const newMessages = prev.filter(m => !m.isAnalyzing);
                const updatedMessages = [...newMessages, {
                    role: 'assistant' as const,
                    content: message,
                    isTyping: true
                }];
                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });

            setIsProcessing(false);
            return success;

        } catch (error) {
            console.error('[CF Handler] Error:', error);
            setMessages(prev => {
                const newMessages = prev.filter(m => !m.isAnalyzing);
                const updatedMessages = [...newMessages, {
                    role: 'assistant' as const,
                    content: `❌ Conditional formatting error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    isTyping: true
                }];
                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });
            setIsProcessing(false);
            return false;
        }
    };

    // Hyperlink operation handler
    const handleHyperlinkOperation = async (
        classification: CommandClassification
    ): Promise<boolean> => {
        console.log('🔗 [Hyperlink Handler] Processing hyperlink command');
        console.log('📋 Classification:', classification);

        try {
            if (!univerAdapter || !univerAdapter.isReady()) {
                throw new Error('Univer is not available');
            }

            const { action, target, parameters } = classification;
            let success = false;
            let message = '';

            // Parse cell reference (e.g., "A1" → row: 0, col: 0)
            const cellMatch = target.identifier.match(/([A-Z]+)(\d+)/i);
            if (!cellMatch) {
                throw new Error(`Invalid cell reference: ${target.identifier}`);
            }

            const col = cellMatch[1].toUpperCase().charCodeAt(0) - 65; // A=0, B=1, etc.
            const row = parseInt(cellMatch[2]) - 1; // Convert to 0-based

            switch (action) {
                case 'add_hyperlink':
                    const url = typeof parameters?.url === 'string' ? parameters.url.trim() : '';
                    if (!url) {
                        message = '❌ No URL provided';
                        break;
                    }

                    success = univerAdapter.setHyperlink(row, col, url);
                    message = success
                        ? `✅ Hyperlink added to ${target.identifier}: ${url}`
                        : `❌ Failed to add hyperlink to ${target.identifier}`;
                    break;

                case 'add_hyperlink_with_label':
                    const urlWithLabel = typeof parameters?.url === 'string' ? parameters.url.trim() : '';
                    const label = typeof parameters?.label === 'string' ? parameters.label.trim() : '';

                    if (!urlWithLabel || !label) {
                        message = '❌ URL or label missing';
                        break;
                    }

                    success = univerAdapter.setHyperlink(row, col, urlWithLabel, label);
                    message = success
                        ? `✅ Hyperlink "${label}" added to ${target.identifier}: ${urlWithLabel}`
                        : `❌ Failed to add hyperlink to ${target.identifier}`;
                    break;

                case 'remove_hyperlink':
                    success = univerAdapter.removeHyperlink(row, col);
                    message = success
                        ? `✅ Hyperlink removed from ${target.identifier}`
                        : `❌ Failed to remove hyperlink from ${target.identifier}`;
                    break;

                case 'get_hyperlink':
                    const existingUrl = univerAdapter.getHyperlink(row, col);
                    if (existingUrl) {
                        message = `🔗 Hyperlink at ${target.identifier}: ${existingUrl}`;
                        success = true;
                    } else {
                        message = `ℹ️ No hyperlink found at ${target.identifier}`;
                        success = true; // Not an error, just no link
                    }
                    break;

                default:
                    console.log('⚠️ Unhandled hyperlink action:', action);
                    return false;
            }

            // Update UI with result
            setMessages(prev => {
                const newMessages = prev.filter(m => !m.isAnalyzing);
                const updatedMessages = [...newMessages, {
                    role: 'assistant' as const,
                    content: message,
                    isTyping: true
                }];
                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });

            setIsProcessing(false);
            return success;

        } catch (error) {
            console.error('❌ Hyperlink handler failed:', error);

            setMessages(prev => {
                const newMessages = prev.filter(m => !m.isAnalyzing);
                const updatedMessages = [...newMessages, {
                    role: 'assistant' as const,
                    content: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    isTyping: true
                }];
                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });

            setIsProcessing(false);
            return false;
        }
    };

    // Data validation handler
    const handleDataValidation = async (
        classification: CommandClassification
    ): Promise<boolean> => {
        console.log('✅ [Validation Handler] Processing data validation command');

        try {
            if (!univerAdapter || !univerAdapter.isReady()) {
                throw new Error('Univer is not available');
            }

            const { action, target, parameters } = classification;
            let success = false;
            let message = '';

            // Parse range (e.g., "A1:A10" or "B5")
            const parseRange = (rangeStr: string) => {
                const parts = rangeStr.split(':');
                const start = parts[0].match(/([A-Z]+)(\d+)/i);
                const end = parts[1]?.match(/([A-Z]+)(\d+)/i) || start;

                if (!start || !end) return null;

                const startCol = start[1].toUpperCase().charCodeAt(0) - 65;
                const startRow = parseInt(start[2]) - 1;
                const endCol = end[1].toUpperCase().charCodeAt(0) - 65;
                const endRow = parseInt(end[2]) - 1;

                return {
                    startRow,
                    startCol,
                    numRows: endRow - startRow + 1,
                    numCols: endCol - startCol + 1
                };
            };

            const range = parseRange(target.identifier);
            if (!range) {
                throw new Error(`Invalid range: ${target.identifier}`);
            }

            switch (action) {
                case 'add_dropdown_validation':
                    // Parse values (comma-separated)
                    const valuesStr = typeof parameters?.values === 'string' ? parameters.values.trim() : '';
                    if (!valuesStr) {
                        message = '❌ No dropdown values provided';
                        break;
                    }

                    const values = valuesStr
                        .split(',')
                        .map((v: string) => v.trim())
                        .filter((v: string) => v.length > 0);

                    if (values.length === 0) {
                        message = '❌ No valid dropdown values';
                        break;
                    }

                    const dropdownRule = univerAdapter.createDropdownValidation(values);
                    if (!dropdownRule) {
                        message = '❌ Failed to create dropdown rule';
                        break;
                    }

                    success = univerAdapter.setDataValidation(
                        range.startRow,
                        range.startCol,
                        range.numRows,
                        range.numCols,
                        dropdownRule
                    );

                    message = success
                        ? `✅ Dropdown validation added to ${target.identifier} with values: ${values.join(', ')}`
                        : `❌ Failed to add dropdown validation`;
                    break;

                case 'add_number_range_validation':
                    const minRaw = parameters?.min;
                    const maxRaw = parameters?.max;
                    const min = typeof minRaw === 'number'
                        ? minRaw
                        : typeof minRaw === 'string'
                            ? parseFloat(minRaw)
                            : NaN;
                    const max = typeof maxRaw === 'number'
                        ? maxRaw
                        : typeof maxRaw === 'string'
                            ? parseFloat(maxRaw)
                            : NaN;

                    if (isNaN(min) || isNaN(max)) {
                        message = '❌ Invalid number range';
                        break;
                    }

                    const numberRule = univerAdapter.createNumberRangeValidation(
                        min,
                        max,
                        `Enter a number between ${min} and ${max}`
                    );

                    if (!numberRule) {
                        message = '❌ Failed to create number range rule';
                        break;
                    }

                    success = univerAdapter.setDataValidation(
                        range.startRow,
                        range.startCol,
                        range.numRows,
                        range.numCols,
                        numberRule
                    );

                    message = success
                        ? `✅ Number validation added to ${target.identifier} (${min} - ${max})`
                        : `❌ Failed to add number validation`;
                    break;

                case 'add_date_validation':
                    const dateRule = univerAdapter.createDateValidation('Enter a valid date');

                    if (!dateRule) {
                        message = '❌ Failed to create date rule';
                        break;
                    }

                    success = univerAdapter.setDataValidation(
                        range.startRow,
                        range.startCol,
                        range.numRows,
                        range.numCols,
                        dateRule
                    );

                    message = success
                        ? `✅ Date validation added to ${target.identifier}`
                        : `❌ Failed to add date validation`;
                    break;

                case 'remove_validation':
                    success = univerAdapter.removeDataValidation(
                        range.startRow,
                        range.startCol,
                        range.numRows,
                        range.numCols
                    );

                    message = success
                        ? `✅ Validation removed from ${target.identifier}`
                        : `❌ Failed to remove validation`;
                    break;

                default:
                    console.log('⚠️ Unhandled validation action:', action);
                    return false;
            }

            // Update UI
            setMessages(prev => {
                const newMessages = prev.filter(m => !m.isAnalyzing);
                const updatedMessages = [...newMessages, {
                    role: 'assistant' as const,
                    content: message,
                    isTyping: true
                }];
                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });

            setIsProcessing(false);
            return success;

        } catch (error) {
            console.error('❌ Validation handler failed:', error);

            setMessages(prev => {
                const newMessages = prev.filter(m => !m.isAnalyzing);
                const updatedMessages = [...newMessages, {
                    role: 'assistant' as const,
                    content: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    isTyping: true
                }];
                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });

            setIsProcessing(false);
            return false;
        }
    };

    // Comment/note handler
    const handleCommentOperation = async (
        classification: CommandClassification
    ): Promise<boolean> => {
        console.log('💬 [Comment Handler] Processing comment operation');

        try {
            if (!univerAdapter || !univerAdapter.isReady()) {
                throw new Error('Univer is not available');
            }

            const { action, target, parameters } = classification;
            let success = false;
            let message = '';

            // Parse cell reference (e.g., "A1" → row: 0, col: 0)
            const cellMatch = target.identifier.match(/([A-Z]+)(\d+)/i);
            if (!cellMatch) {
                throw new Error(`Invalid cell reference: ${target.identifier}`);
            }

            const col = cellMatch[1].toUpperCase().charCodeAt(0) - 65; // A=0, B=1, etc.
            const row = parseInt(cellMatch[2]) - 1; // Convert to 0-based

            switch (action) {
                case 'add_note':
                    const noteText = typeof parameters?.text === 'string' ? parameters.text.trim() : '';
                    if (!noteText) {
                        message = '❌ No note text provided';
                        break;
                    }

                    success = await univerAdapter.addNote(row, col, noteText);
                    message = success
                        ? `✅ Note added to ${target.identifier}: "${noteText}"`
                        : `❌ Failed to add note to ${target.identifier}`;
                    break;

                case 'get_note':
                    const existingNote = univerAdapter.getNote(row, col);
                    if (existingNote) {
                        message = `💬 Note at ${target.identifier}: "${existingNote}"`;
                        success = true;
                    } else {
                        message = `ℹ️ No note found at ${target.identifier}`;
                        success = true; // Not an error, just no note
                    }
                    break;

                case 'remove_note':
                    success = await univerAdapter.removeNote(row, col);
                    message = success
                        ? `✅ Note removed from ${target.identifier}`
                        : `❌ Failed to remove note from ${target.identifier}`;
                    break;

                default:
                    console.log('⚠️ Unhandled comment action:', action);
                    return false;
            }

            // Update UI
            setMessages(prev => {
                const newMessages = prev.filter(m => !m.isAnalyzing);
                const updatedMessages = [...newMessages, {
                    role: 'assistant' as const,
                    content: message,
                    isTyping: true
                }];
                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });

            setIsProcessing(false);
            return success;

        } catch (error) {
            console.error('❌ Comment handler failed:', error);

            setMessages(prev => {
                const newMessages = prev.filter(m => !m.isAnalyzing);
                const updatedMessages = [...newMessages, {
                    role: 'assistant' as const,
                    content: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    isTyping: true
                }];
                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });

            setIsProcessing(false);
            return false;
        }
    };

    // Image/drawing handler
    const handleImageOperation = async (
        classification: CommandClassification
    ): Promise<boolean> => {
        console.log('🖼️ [Image Handler] Processing image/drawing operation');

        try {
            if (!univerAdapter || !univerAdapter.isReady()) {
                throw new Error('Univer is not available');
            }

            const { action, target, parameters } = classification;
            let success = false;
            let message = '';

            // Parse cell reference (e.g., "A1" → row: 0, col: 0)
            const cellMatch = target.identifier.match(/([A-Z]+)(\d+)/i);
            if (!cellMatch) {
                throw new Error(`Invalid cell reference: ${target.identifier}`);
            }

            const col = cellMatch[1].toUpperCase().charCodeAt(0) - 65; // A=0, B=1, etc.
            const row = parseInt(cellMatch[2]) - 1; // Convert to 0-based

            switch (action) {
                case 'insert_image':
                    const imageUrl = typeof parameters?.imageUrl === 'string' ? parameters.imageUrl.trim() : '';
                    if (!imageUrl) {
                        message = '❌ No image URL provided';
                        break;
                    }

                    success = univerAdapter.insertImage(row, col, imageUrl);
                    message = success
                        ? `✅ Image inserted at ${target.identifier}`
                        : `❌ Failed to insert image at ${target.identifier}`;
                    break;

                case 'create_drawing':
                    const shapeType = typeof parameters?.shapeType === 'string'
                        ? parameters.shapeType.toLowerCase()
                        : 'rectangle';

                    // Default dimensions for shapes
                    const widthRaw = parameters?.width;
                    const heightRaw = parameters?.height;
                    const width = typeof widthRaw === 'number' ? widthRaw : Number(widthRaw) || 200;
                    const height = typeof heightRaw === 'number' ? heightRaw : Number(heightRaw) || 100;

                    success = univerAdapter.createDrawing(
                        shapeType,
                        row,
                        col,
                        width,
                        height
                    );

                    message = success
                        ? `✅ ${shapeType.charAt(0).toUpperCase() + shapeType.slice(1)} created at ${target.identifier}`
                        : `❌ Failed to create ${shapeType} at ${target.identifier}`;
                    break;

                default:
                    console.log('⚠️ Unhandled image action:', action);
                    return false;
            }

            // Update UI
            setMessages(prev => {
                const newMessages = prev.filter(m => !m.isAnalyzing);
                const updatedMessages = [...newMessages, {
                    role: 'assistant' as const,
                    content: message,
                    isTyping: true
                }];
                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });

            setIsProcessing(false);
            return success;

        } catch (error) {
            console.error('❌ Image handler failed:', error);

            setMessages(prev => {
                const newMessages = prev.filter(m => !m.isAnalyzing);
                const updatedMessages = [...newMessages, {
                    role: 'assistant' as const,
                    content: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    isTyping: true
                }];
                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });

            setIsProcessing(false);
            return false;
        }
    };

    // Remove duplicates handler
    const handleRemoveDuplicates = async (
        classification: CommandClassification,
        userMessage: string
    ): Promise<boolean> => {
        console.log('🗑️ [Remove Duplicates] Processing duplicate removal');

        try {
            if (!univerAdapter || !univerAdapter.isReady()) {
                throw new Error('Univer is not available');
            }

            let message = '';
            let success = false;

            // 1. Read all data
            const data = univerAdapter.getAllData();

            if (!data || data.length === 0) {
                message = 'ℹ️ No data to process';
                success = true;

                setMessages(prev => {
                    const newMessages = prev.filter(m => !m.isAnalyzing);
                    const updatedMessages = [...newMessages, {
                        role: 'assistant' as const,
                        content: message,
                        isTyping: true
                    }];
                    saveChatMessagesToActiveChat(updatedMessages);
                    return updatedMessages;
                });

                setIsProcessing(false);
                return true;
            }

            // 2. Parse column specification from user message
            const columnSpec = parseColumnSpec(userMessage);

            // 3. Detect duplicates
            const duplicateIndices = findDuplicateRows(data, columnSpec);

            if (duplicateIndices.length === 0) {
                message = '✅ No duplicate rows found';
                success = true;

                setMessages(prev => {
                    const newMessages = prev.filter(m => !m.isAnalyzing);
                    const updatedMessages = [...newMessages, {
                        role: 'assistant' as const,
                        content: message,
                        isTyping: true
                    }];
                    saveChatMessagesToActiveChat(updatedMessages);
                    return updatedMessages;
                });

                setIsProcessing(false);
                return true;
            }

            console.log(`🗑️ Found ${duplicateIndices.length} duplicate row(s) at indices:`, duplicateIndices);

            // 4. Delete rows in REVERSE order (to avoid index shifting)
            const failedDeletions: number[] = [];
            let successfulDeletions = 0;

            for (let i = duplicateIndices.length - 1; i >= 0; i--) {
                const rowIndex = duplicateIndices[i];
                console.log(`🗑️ Attempting to delete row ${rowIndex}`);

                const deleted = univerAdapter.deleteRow(rowIndex, 1);

                if (deleted) {
                    successfulDeletions++;
                    console.log(`✅ Successfully deleted row ${rowIndex}`);
                } else {
                    failedDeletions.push(rowIndex);
                    console.error(`❌ Failed to delete row ${rowIndex}`);
                }
            }

            if (failedDeletions.length > 0) {
                message = `⚠️ Partially removed duplicates: ${successfulDeletions} succeeded, ${failedDeletions.length} failed`;
                success = false;
            } else {
                message = `✅ Removed ${successfulDeletions} duplicate row(s)`;
                success = true;
            }

            setMessages(prev => {
                const newMessages = prev.filter(m => !m.isAnalyzing);
                const updatedMessages = [...newMessages, {
                    role: 'assistant' as const,
                    content: message,
                    isTyping: true
                }];
                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });

            setIsProcessing(false);
            return success;

        } catch (error) {
            console.error('❌ Remove duplicates handler failed:', error);

            setMessages(prev => {
                const newMessages = prev.filter(m => !m.isAnalyzing);
                const updatedMessages = [...newMessages, {
                    role: 'assistant' as const,
                    content: `❌ Error removing duplicates: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    isTyping: true
                }];
                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });

            setIsProcessing(false);
            return false;
        }
    };

    const handleFindReplace = async (
        classification: CommandClassification,
        userMessage: string
    ): Promise<boolean> => {
        console.log('🔍 [Find & Replace] Processing find and replace operation');

        try {
            if (!univerAdapter || !univerAdapter.isReady()) {
                throw new Error('Univer is not available');
            }

            // Extract find and replace text from classification parameters or parse from message
            // LLM returns 'find' and 'replace', our code uses 'findText' and 'replaceText'
            let findText = (classification.parameters?.findText || classification.parameters?.find) as string;
            let replaceText = (classification.parameters?.replaceText || classification.parameters?.replace) as string;

            // Fallback: Parse from user message if not in parameters
            if (!findText || !replaceText) {
                const parsed = parseFindReplaceText(userMessage);
                findText = findText || parsed.findText;
                replaceText = replaceText || parsed.replaceText;
            }

            if (!findText) {
                const message = '⚠️ Could not determine what text to find. Please specify like: "find X and replace with Y"';
                setMessages(prev => {
                    const newMessages = prev.filter(m => !m.isAnalyzing);
                    const updatedMessages = [...newMessages, {
                        role: 'assistant' as const,
                        content: message,
                        isTyping: true
                    }];
                    saveChatMessagesToActiveChat(updatedMessages);
                    return updatedMessages;
                });
                return false;
            }

            if (!replaceText) {
                const message = '⚠️ Could not determine replacement text. Please specify like: "find X and replace with Y"';
                setMessages(prev => {
                    const newMessages = prev.filter(m => !m.isAnalyzing);
                    const updatedMessages = [...newMessages, {
                        role: 'assistant' as const,
                        content: message,
                        isTyping: true
                    }];
                    saveChatMessagesToActiveChat(updatedMessages);
                    return updatedMessages;
                });
                return false;
            }

            console.log(`🔍 Finding: "${findText}", Replacing with: "${replaceText}"`);

            // Parse options from message (case sensitivity, whole cell, etc.)
            const options = parseFindReplaceOptions(userMessage);

            console.log('🔧 About to call univerAdapter.findAndReplace');

            // Execute find and replace with timeout protection
            let count: number;
            try {
                count = await univerAdapter.findAndReplace(findText, replaceText, options);
                console.log('🔧 univerAdapter.findAndReplace returned:', count);
            } catch (adapterError) {
                console.error('❌ Adapter method threw error:', adapterError);
                count = -1;
            }

            console.log('🔧 Determining message based on count:', count);

            let message = '';
            let success = false;

            // Add column info to message if column filter was used
            const columnInfo = options.columnFilter
                ? ` in column ${options.columnFilter}`
                : '';

            if (count === -1) {
                message = '❌ Find and replace failed due to an error';
                success = false;
            } else if (count === 0) {
                message = `ℹ️ No matches found for "${findText}"${columnInfo}`;
                success = true;
            } else {
                message = `✅ Successfully replaced ${count} instance(s) of "${findText}" with "${replaceText}"${columnInfo}`;
                success = true;
            }

            // Update UI with result message
            setMessages(prev => {
                const newMessages = prev.filter(m => !m.isAnalyzing);
                const updatedMessages = [...newMessages, {
                    role: 'assistant' as const,
                    content: message,
                    isTyping: true
                }];
                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });

            return success;

        } catch (error) {
            console.error('❌ Find & Replace handler failed:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            setMessages(prev => {
                const newMessages = prev.filter(m => !m.isAnalyzing);
                const updatedMessages = [...newMessages, {
                    role: 'assistant' as const,
                    content: `❌ Find and replace failed: ${errorMessage}`,
                    isTyping: true
                }];
                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });

            return false;
        } finally {
            // ALWAYS runs, even if there's an uncaught error or promise never resolves
            console.log('🔧 FINALLY BLOCK: Setting isProcessing to false');
            setIsProcessing(false);
        }
    };

    const handleNamedRangeOperation = async (
        classification: CommandClassification
    ): Promise<boolean> => {
        console.log('📛 [Named Range] Processing operation:', classification.action);

        try {
            if (!univerAdapter || !univerAdapter.isReady()) {
                throw new Error('Univer is not available');
            }

            const action = classification.action;
            let message = '';
            let success = false;

            switch (action) {
                case 'create_named_range': {
                    const name = classification.parameters?.name as string;
                    const range = classification.parameters?.range as string;

                    if (!name || !range) {
                        message = '⚠️ Could not determine name or range. Use format: "create named range Sales from A1 to D10"';
                        break;
                    }

                    success = await univerAdapter.createNamedRange(name, range);
                    message = success
                        ? `✅ Named range "${name}" created successfully for ${range}`
                        : `❌ Failed to create named range "${name}". It may already exist or have an invalid format.`;
                    break;
                }

                case 'delete_named_range': {
                    const name = classification.parameters?.name as string;

                    if (!name) {
                        message = '⚠️ Could not determine range name. Use format: "delete named range Sales"';
                        break;
                    }

                    success = await univerAdapter.deleteNamedRange(name);
                    message = success
                        ? `✅ Named range "${name}" deleted successfully`
                        : `❌ Failed to delete named range "${name}". It may not exist.`;
                    break;
                }

                case 'list_named_ranges': {
                    const ranges = await univerAdapter.listNamedRanges();

                    if (ranges.length === 0) {
                        message = 'ℹ️ No named ranges found in this workbook.';
                        success = true;
                    } else {
                        const list = ranges.map(r => `  • **${r.name}**: ${r.ref} (${r.scope})`).join('\n');
                        message = `📋 **Named Ranges (${ranges.length})**:\n${list}`;
                        success = true;
                    }
                    break;
                }

                case 'rename_named_range': {
                    const oldName = classification.parameters?.oldName as string;
                    const newName = classification.parameters?.newName as string;

                    if (!oldName || !newName) {
                        message = '⚠️ Could not determine old or new name. Use format: "rename named range Sales to Revenue"';
                        break;
                    }

                    success = await univerAdapter.renameNamedRange(oldName, newName);
                    message = success
                        ? `✅ Named range renamed from "${oldName}" to "${newName}"`
                        : `❌ Failed to rename. "${oldName}" may not exist or "${newName}" already exists.`;
                    break;
                }

                case 'update_named_range': {
                    const name = classification.parameters?.name as string;
                    const newRange = classification.parameters?.newRange as string;

                    if (!name || !newRange) {
                        message = '⚠️ Could not determine name or new range. Use format: "update named range Sales to A1:E10"';
                        break;
                    }

                    success = await univerAdapter.updateNamedRange(name, newRange);
                    message = success
                        ? `✅ Named range "${name}" updated to ${newRange}`
                        : `❌ Failed to update named range "${name}". It may not exist or the range format is invalid.`;
                    break;
                }

                default:
                    message = `⚠️ Unknown named range operation: ${action}`;
            }

            // Update UI with result
            setMessages(prev => {
                const newMessages = prev.filter(m => !m.isAnalyzing);
                const updatedMessages = [...newMessages, {
                    role: 'assistant' as const,
                    content: message,
                    isTyping: true
                }];
                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });

            return success;

        } catch (error) {
            console.error('❌ Named range operation failed:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            setMessages(prev => {
                const newMessages = prev.filter(m => !m.isAnalyzing);
                const updatedMessages = [...newMessages, {
                    role: 'assistant' as const,
                    content: `❌ Named range operation failed: ${errorMessage}`,
                    isTyping: true
                }];
                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });

            return false;
        } finally {
            setIsProcessing(false);
        }
    };

    const handleIntelligentAnalysis = async (
        classification: CommandClassification
    ): Promise<boolean> => {
        console.log('🧠 [Intelligent Analysis] Starting analysis');
        console.log('🔍 Action:', classification.action);

        try {
            // Determine analysis type based on action
            const analysisType = classification.action === 'comprehensive_analysis'
                ? 'comprehensive'
                : 'focused';

            const focusArea =
                classification.action === 'anomaly_detection' ? 'anomalies' :
                classification.action === 'seasonality_analysis' ? 'trends' :
                classification.action === 'correlation_analysis' ? 'correlations' :
                undefined;

            // Call backend analysis endpoint
            if (!currentWorkspace?.id) {
                throw new Error('Workspace is not available for analysis');
            }
            const response: any = await analyzeWorkspaceInsights(
                currentWorkspace.id,
                analysisType,
                focusArea
            );

            // Format insights response
            const insightsMessage = formatAnalysisResponse(response);

            // Update message with results
            setMessages(prev => {
                const newMessages = prev.filter(msg => !msg.isAnalyzing);
                const insightsMessageEntry: ChatMessage = {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    type: 'assistant',
                    content: insightsMessage,
                    timestamp: new Date(),
                    visualization: response.visualizations?.[0]
                };
                const updatedMessages = [...newMessages, insightsMessageEntry];

                // Save to chat history
                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });

            console.log('✅ [Intelligent Analysis] Complete');
            return true;

        } catch (error) {
            console.error('❌ [Intelligent Analysis] Error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            setMessages(prev => {
                const newMessages = prev.filter(msg => !msg.isAnalyzing);
                const updatedMessages = [...newMessages, {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    type: 'assistant',
                    content: `Sorry, I encountered an error analyzing your data: ${errorMessage}. Please try again.`,
                    timestamp: new Date()
                } as ChatMessage];

                // Save error message to chat history
                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });

            return false;
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSmartFormat = async (
        classification: CommandClassification
    ): Promise<boolean> => {
        console.log('📐 [Smart Format] Starting auto-formatting');
        console.log('🔍 Template:', classification.parameters?.template || 'professional');

        try {
            // Get template from parameters
            const template = (classification.parameters?.template || 'professional') as 'professional' | 'financial' | 'minimal';

            // Show processing message
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Analyzing your data and applying ${template} formatting...`,
                isFormatting: true
            }]);

            // Call backend formatting endpoint
            if (!currentWorkspace?.id) {
                throw new Error('Workspace is not available for smart formatting');
            }
            const response: any = await smartFormatWorkspace(
                currentWorkspace.id,
                template
            );

            if (!response.success || !response.formatting) {
                throw new Error('Failed to generate formatting instructions');
            }

            const formatting = response.formatting;
            console.log('📋 Formatting instructions received:', formatting);

            // Apply formatting via UniverAdapter
            if (!univerAdapter) {
                throw new Error('Spreadsheet not ready for formatting');
            }

            // Get data dimensions
            const columns = Object.keys(formatting.column_formats);
            const dataRows = Array.isArray(data) ? data.length : 0;  // Exclude header row

            let formattedCount = 0;

            // 1. Apply number formats to data columns
            for (let colIndex = 0; colIndex < columns.length; colIndex++) {
                const colName = columns[colIndex];
                const format = formatting.column_formats[colName];
                const alignment = formatting.column_alignments[colName];
                const width = formatting.column_widths[colName];

                // Apply number format to entire column (excluding header row 0)
                if (format !== '@') {  // Skip text format
                    univerAdapter.setNumberFormat(1, colIndex, dataRows, 1, format);
                }

                // Apply alignment
                if (alignment) {
                    univerAdapter.setHorizontalAlignment(1, colIndex, dataRows, 1, alignment as 'left' | 'center' | 'right');
                }

                // Apply column width
                if (width) {
                    univerAdapter.setColumnWidth(colIndex, width);
                }

                formattedCount++;
            }

            // 2. Apply header row formatting
            const headerStyle = formatting.header_style;
            if (headerStyle) {
                // Bold header row
                if (headerStyle.bold) {
                    univerAdapter.setFontWeight(0, 0, 1, columns.length, 'bold');
                }

                // Background color
                if (headerStyle.background) {
                    univerAdapter.setBackgroundColor(0, 0, 1, columns.length, headerStyle.background);
                }

                // Font color
                if (headerStyle.font_color) {
                    univerAdapter.setFontColor(0, 0, 1, columns.length, headerStyle.font_color);
                }

                // Freeze header row
                if (headerStyle.freeze) {
                    univerAdapter.freezePanes(1, 0);  // Freeze 1 row, 0 columns
                }
            }

            console.log(`✅ [Smart Format] Applied formatting to ${formattedCount} columns`);

            // Update message with success
            setMessages(prev => {
                const newMessages = prev.filter(msg => !(msg as any).isFormatting);
                const updatedMessages = [...newMessages, {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    type: 'assistant',
                    content: `${response.message}\n\n**Applied formatting:**\n- Number formats: ${Object.keys(formatting.column_formats).length} columns\n- Column widths: Auto-adjusted\n- Header style: ${template.charAt(0).toUpperCase() + template.slice(1)}\n- Alignment: Optimized by data type\n\n**Detected types:**\n${Object.entries(formatting.column_types).map(([col, type]) => `- ${col}: ${type}`).join('\n')}`,
                    timestamp: new Date()
                } as ChatMessage];

                // Save to chat history
                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });

            return true;

        } catch (error) {
            console.error('❌ [Smart Format] Error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            setMessages(prev => {
                const newMessages = prev.filter(msg => !(msg as any).isFormatting);
                const updatedMessages = [...newMessages, {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    type: 'assistant',
                    content: `Sorry, I encountered an error formatting your data: ${errorMessage}. Please try again.`,
                    timestamp: new Date()
                } as ChatMessage];

                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });

            return false;
        } finally {
            setIsProcessing(false);
        }
    };

    const handleQuickDataEntry = async (
        classification: CommandClassification
    ): Promise<boolean> => {
        console.log('📝 [Quick Data Entry] Starting data entry operation');
        console.log('🔍 Action:', classification.action);
        console.log('🔍 Parameters:', classification.parameters);

        try {
            const action = classification.action;
            const params = classification.parameters;

            // Show processing message
            const processingMessage = action === 'add_single_row'
                ? 'Adding row to your spreadsheet...'
                : action === 'generate_multiple_rows'
                ? `Generating ${params.count || 5} sample ${params.entity_type || 'rows'}...`
                : 'Creating column headers...';

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: processingMessage,
                isFormatting: true
            }]);

            // Prepare parameters for backend
            let backendParams: Record<string, unknown> = {};

            if (action === 'add_single_row') {
                // Parse column-value pairs from row_data_string
                const rowDataString = typeof params?.row_data_string === 'string' ? params.row_data_string : '';
                const rowData = llmCommandClassifier.parseColumnValuePairs(rowDataString);

                backendParams = {
                    row_data: rowData,
                    position: params.position || 'bottom',
                    row_data_string: params.row_data_string
                };
            } else if (action === 'generate_multiple_rows') {
                backendParams = {
                    count: params.count || 5,
                    entity_type: params.entity_type || 'rows',
                    fields_hint: params.fields_hint || ''
                };
            } else if (action === 'create_headers') {
                backendParams = {
                    headers: params.headers || []
                };
            }

            // Call backend data entry endpoint
            if (!currentWorkspace?.id) {
                throw new Error('Workspace is not available for data entry');
            }
            const response: any = await quickDataEntryWorkspace(
                currentWorkspace.id,
                action as 'add_single_row' | 'generate_multiple_rows' | 'create_headers',
                backendParams
            );

            if (!response.success || !response.data) {
                throw new Error('Failed to process data entry');
            }

            const resultData = response.data;
            console.log('📋 Data entry result:', resultData);

            // Apply changes via UniverAdapter
            if (!univerAdapter) {
                throw new Error('Spreadsheet not ready for data entry');
            }

            if (action === 'add_single_row') {
                // Insert single row
                const rowValues = resultData.row_values;
                const position = resultData.actual_position;

                console.log('[Quick Data Entry] Row values:', rowValues);
                console.log('[Quick Data Entry] Position:', position);
                console.log('[Quick Data Entry] Is array?', Array.isArray(rowValues));

                // Ensure rowValues is a proper array
                if (!Array.isArray(rowValues)) {
                    throw new Error('Invalid row values received from backend');
                }

                // Convert to plain array to avoid any Proxy issues
                const plainRowValues = rowValues.map((val: any) => val);

                const success = univerAdapter.insertRow(position, plainRowValues);

                if (!success) {
                    throw new Error('Failed to insert row into spreadsheet');
                }

                // Highlight the inserted row (temporary green background)
                setTimeout(() => {
                    const numCols = plainRowValues.length;
                    univerAdapter.setBackgroundColor(position, 0, 1, numCols, '#90EE90');

                    // Remove highlight after 2 seconds
                    setTimeout(() => {
                        univerAdapter.setBackgroundColor(position, 0, 1, numCols, '#FFFFFF');
                    }, 2000);
                }, 100);

            } else if (action === 'generate_multiple_rows') {
                // Insert multiple rows
                const rows = resultData.rows;
                const startPosition = Array.isArray(data) ? data.length : 0; // Add to bottom

                univerAdapter.insertMultipleRows(startPosition, rows);

            } else if (action === 'create_headers') {
                // Set headers in row 0
                const headers = resultData.headers;

                // Set header values
                headers.forEach((header: string, colIndex: number) => {
                    univerAdapter.setRangeValues(0, colIndex, [[header]]);
                });

                // Apply header formatting
                univerAdapter.setFontWeight(0, 0, 1, headers.length, 'bold');
                univerAdapter.setBackgroundColor(0, 0, 1, headers.length, '#4A90E2');
                univerAdapter.setFontColor(0, 0, 1, headers.length, '#FFFFFF');
                univerAdapter.freezePanes(1, 0);
            }

            console.log(`✅ [Quick Data Entry] Operation completed successfully`);

            // Create success message based on action
            let successMessage = '';
            if (action === 'add_single_row') {
                successMessage = `✅ Successfully inserted 1 row at position ${resultData.actual_position + 1} with ${resultData.matched_count} filled cells.`;
            } else if (action === 'generate_multiple_rows') {
                successMessage = `✅ Successfully generated ${resultData.count} sample rows.`;
            } else if (action === 'create_headers') {
                successMessage = `✅ Successfully created ${resultData.headers.length} column headers.`;
            }

            // Update message with success - filter out both formatting and analyzing messages
            setMessages(prev => {
                const newMessages = prev.filter(msg => !(msg as any).isFormatting && !msg.isAnalyzing);
                const updatedMessages = [...newMessages, {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    type: 'assistant',
                    content: successMessage,
                    timestamp: new Date()
                } as ChatMessage];

                // Save to chat history
                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });

            // Ensure processing is stopped
            setIsProcessing(false);

            return true;

        } catch (error) {
            console.error('❌ [Quick Data Entry] Error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            // Filter out both formatting and analyzing messages
            setMessages(prev => {
                const newMessages = prev.filter(msg => !(msg as any).isFormatting && !msg.isAnalyzing);
                const updatedMessages = [...newMessages, {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    type: 'assistant',
                    content: `Sorry, I encountered an error processing your data entry: ${errorMessage}. Please try again.`,
                    timestamp: new Date()
                } as ChatMessage];

                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });

            // Ensure processing is stopped
            setIsProcessing(false);

            return false;
        }
    };

    // Helper functions for analysis formatting
    const getCorrelationStrength = (coef: number): string => {
        const abs = Math.abs(coef);
        if (abs >= 0.8) return 'Very strong';
        if (abs >= 0.6) return 'Strong';
        if (abs >= 0.4) return 'Moderate';
        return 'Weak';
    };

    const getSeverityDistribution = (anomalies: any[]) => {
        return {
            critical: anomalies.filter(a => a.severity === 'critical').length,
            high: anomalies.filter(a => a.severity === 'high').length,
            medium: anomalies.filter(a => a.severity === 'medium').length,
            low: anomalies.filter(a => a.severity === 'low').length
        };
    };

    const getSeverityEmoji = (severity: string): string => {
        switch (severity) {
            case 'critical': return '🔴';
            case 'high': return '🟠';
            case 'medium': return '🟡';
            case 'low': return '🟢';
            default: return '⚪';
        }
    };

    // Helper: Format analysis response into markdown
    const formatAnalysisResponse = (analysis: any): string => {
        let markdown = `## 🔍 Data Analysis Results\n\n`;

        // Executive Summary
        markdown += `${analysis.summary}\n\n`;

        // ===== ANOMALIES SECTION (ENHANCED) =====
        if (analysis.anomalies?.length > 0) {
            const totalRows = analysis.profile?.row_count || 0;
            const anomalyRate = totalRows > 0 ? ((analysis.anomalies.length / totalRows) * 100).toFixed(2) : '0';
            const severity = getSeverityDistribution(analysis.anomalies);

            markdown += `### 🚨 Anomalies Detected\n\n`;
            markdown += `**Overview**: ${analysis.anomalies.length} anomal${analysis.anomalies.length === 1 ? 'y' : 'ies'} found`;
            if (totalRows > 0) {
                markdown += ` (${anomalyRate}% of ${totalRows.toLocaleString()} rows)`;
            }
            markdown += `\n\n`;

            // Severity Breakdown
            markdown += `**Severity Breakdown**:\n`;
            markdown += `- 🔴 Critical: ${severity.critical}\n`;
            markdown += `- 🟠 High: ${severity.high}\n`;
            markdown += `- 🟡 Medium: ${severity.medium}\n`;
            markdown += `- 🟢 Low: ${severity.low}\n\n`;

            // Detailed Anomalies (top 5)
            markdown += `**Details**:\n`;
            analysis.anomalies.slice(0, 5).forEach((anomaly: any, idx: number) => {
                const emoji = getSeverityEmoji(anomaly.severity);
                markdown += `${idx + 1}. ${emoji} **${anomaly.column}** (Row ${anomaly.row_index}): `;
                markdown += `${anomaly.value?.toLocaleString() || 'N/A'}`;
                if (anomaly.zscore) {
                    markdown += ` — ${Math.abs(anomaly.zscore).toFixed(2)}σ ${anomaly.value > 0 ? 'above' : 'below'} mean`;
                }
                markdown += `\n`;
                markdown += `   *${anomaly.severity.charAt(0).toUpperCase() + anomaly.severity.slice(1)} severity anomaly - investigate for data quality or legitimate rare event*\n\n`;
            });

            if (analysis.anomalies.length > 5) {
                markdown += `_... and ${analysis.anomalies.length - 5} more anomal${analysis.anomalies.length - 5 === 1 ? 'y' : 'ies'}_\n\n`;
            }

            // Multi-anomaly row detection
            const rowCounts: Record<number, number> = {};
            analysis.anomalies.forEach((a: any) => {
                rowCounts[a.row_index] = (rowCounts[a.row_index] || 0) + 1;
            });
            const multiAnomalyRows = Object.entries(rowCounts).filter(([, count]) => count > 1);
            if (multiAnomalyRows.length > 0) {
                markdown += `**⚠️ Data Quality Alert**: ${multiAnomalyRows.length} row(s) have multiple anomalies:\n`;
                multiAnomalyRows.slice(0, 3).forEach(([row, count]) => {
                    markdown += `- Row ${row}: ${count} anomalies detected\n`;
                });
                markdown += `*Recommend investigating these rows for data entry errors*\n\n`;
            }
        }

        // ===== DATA QUALITY SECTION (NEW) =====
        if (analysis.profile) {
            const totalCells = (analysis.profile.row_count || 0) * (analysis.profile.column_count || 0);
            const missingValues = analysis.profile.missing_values || 0;
            const completeness = totalCells > 0 ? (((totalCells - missingValues) / totalCells) * 100).toFixed(1) : '100.0';
            const qualityScore = parseFloat(completeness);

            markdown += `### 📊 Data Quality Assessment\n\n`;
            markdown += `**Completeness**: ${completeness}%`;
            if (analysis.profile.row_count > 0) {
                markdown += ` (${analysis.profile.row_count.toLocaleString()} rows, ${analysis.profile.column_count} columns)`;
            }
            markdown += `\n\n`;

            if (missingValues > 0) {
                markdown += `**Missing Values**: ${missingValues.toLocaleString()} (${((missingValues / totalCells) * 100).toFixed(2)}% of dataset)\n\n`;
            }

            // Quality Score
            markdown += `**Quality Score**: `;
            if (qualityScore >= 95) {
                markdown += `✅ Excellent`;
            } else if (qualityScore >= 90) {
                markdown += `✅ Good`;
            } else if (qualityScore >= 80) {
                markdown += `⚠️ Fair - consider addressing missing data`;
            } else {
                markdown += `❌ Poor - significant data gaps detected`;
            }
            markdown += `\n\n`;
        }

        // ===== CORRELATIONS SECTION (ENHANCED) =====
        if (analysis.correlations?.length > 0) {
            markdown += `### 🔗 Strong Correlations\n\n`;
            markdown += `**Interpretation Guide**: Strong (>0.8) • Moderate (0.6-0.8) • Weak (<0.6)\n`;
            markdown += `⚠️ *Correlation ≠ Causation - further investigation needed*\n\n`;

            markdown += `**Top Correlations**:\n`;
            analysis.correlations.slice(0, 5).forEach((corr: any, idx: number) => {
                const strength = Math.abs(corr.coefficient);
                const strengthLabel = getCorrelationStrength(corr.coefficient);
                const direction = corr.coefficient > 0 ? 'positive' : 'negative';
                const stars = strength >= 0.8 ? '⭐⭐⭐' : strength >= 0.6 ? '⭐⭐' : '⭐';

                markdown += `${idx + 1}. **${corr.var1}** ↔ **${corr.var2}**: ${(strength * 100).toFixed(1)}% correlation ${stars}\n`;
                markdown += `   - ${strengthLabel} ${direction} relationship\n`;
                if (corr.sample_size) {
                    markdown += `   - Based on ${corr.sample_size.toLocaleString()} samples`;
                    if (corr.sample_size < 30) {
                        markdown += ` ⚠️ (small sample - use caution)`;
                    }
                    markdown += `\n`;
                }
                if (corr.pvalue < 0.01) {
                    markdown += `   - p-value: <0.01 (highly significant)\n`;
                } else if (corr.pvalue < 0.05) {
                    markdown += `   - p-value: ${corr.pvalue.toFixed(3)} (significant)\n`;
                }
                markdown += `\n`;
            });

            if (analysis.correlations.length > 5) {
                markdown += `_... and ${analysis.correlations.length - 5} more correlation${analysis.correlations.length - 5 === 1 ? '' : 's'}_\n\n`;
            }
        }

        // ===== SEASONALITY SECTION (ENHANCED) =====
        if (analysis.seasonality && analysis.seasonality.has_seasonality) {
            markdown += `### 📈 Seasonality Detected\n\n`;
            markdown += `**Pattern**: ${analysis.seasonality.description}\n`;
            markdown += `**Strength**: ${(analysis.seasonality.strength * 100).toFixed(1)}% `;
            markdown += analysis.seasonality.strength > 0.7 ? '(Strong)' : analysis.seasonality.strength > 0.4 ? '(Moderate)' : '(Weak)';
            markdown += `\n`;
            markdown += `**Period**: ${analysis.seasonality.period} time units\n\n`;
            markdown += `*Consider this pattern when forecasting or analyzing trends*\n\n`;
        }

        // ===== ACTIONABLE RECOMMENDATIONS (ENHANCED) =====
        markdown += `### 💡 Actionable Recommendations\n\n`;

        // Priority 1: High-severity anomalies
        const highSeverityAnomalies = analysis.anomalies?.filter((a: any) =>
            a.severity === 'critical' || a.severity === 'high'
        ) || [];

        if (highSeverityAnomalies.length > 0) {
            markdown += `**Priority 1 - Investigate High-Severity Anomalies**:\n`;
            highSeverityAnomalies.slice(0, 3).forEach((anomaly: any) => {
                markdown += `- [ ] Review Row ${anomaly.row_index} (${anomaly.column} = ${anomaly.value?.toLocaleString() || 'N/A'})`;
                if (anomaly.zscore) {
                    markdown += ` — ${Math.abs(anomaly.zscore).toFixed(2)}σ deviation`;
                }
                markdown += `\n`;
            });
            markdown += `\n`;
        }

        // Priority 2: Strong correlations
        const strongCorrelations = analysis.correlations?.filter((c: any) =>
            Math.abs(c.coefficient) > 0.7
        ) || [];

        if (strongCorrelations.length > 0) {
            markdown += `**Priority 2 - Correlation Analysis**:\n`;
            markdown += `- [ ] Verify top ${Math.min(3, strongCorrelations.length)} correlation${strongCorrelations.length > 1 ? 's' : ''} with domain experts\n`;
            markdown += `- [ ] Test for causation vs. coincidence\n`;
            markdown += `- [ ] Check for confounding variables\n\n`;
        }

        // Priority 3: Data Quality
        if (analysis.profile?.missing_values > 0) {
            markdown += `**Priority 3 - Data Quality**:\n`;
            markdown += `- [ ] Address ${analysis.profile.missing_values.toLocaleString()} missing values\n`;
            markdown += `- [ ] Consider imputation or removal strategies\n`;
            markdown += `- [ ] Document data quality assumptions\n\n`;
        }

        // Next steps
        markdown += `**Next Analysis Steps**:\n`;
        if (analysis.seasonality?.has_seasonality) {
            markdown += `- Run temporal forecasting models\n`;
        }
        if ((analysis.profile?.categorical_columns || 0) > 0) {
            markdown += `- Segment analysis by categorical variables\n`;
        }
        markdown += `- Consider multivariate analysis for deeper insights\n`;
        if (strongCorrelations.length > 2) {
            markdown += `- Build correlation network visualization\n`;
        }

        return markdown;
    };

    // Helper: Parse find and replace text from natural language
    const parseFindReplaceText = (message: string): { findText: string; replaceText: string} => {
        // Pattern 1: "find X and replace with Y"
        let match = message.match(/find\s+["']?([^"']+?)["']?\s+(?:and\s+)?replace\s+(?:with|to)\s+["']?([^"']+?)["']?$/i);
        if (match) return { findText: match[1].trim(), replaceText: match[2].trim() };

        // Pattern 2: "replace X with Y"
        match = message.match(/replace\s+["']?([^"']+?)["']?\s+(?:with|to)\s+["']?([^"']+?)["']?$/i);
        if (match) return { findText: match[1].trim(), replaceText: match[2].trim() };

        // Pattern 3: "search for X and change to Y"
        match = message.match(/search\s+(?:for\s+)?["']?([^"']+?)["']?\s+(?:and\s+)?(?:change|replace)\s+(?:with|to)\s+["']?([^"']+?)["']?$/i);
        if (match) return { findText: match[1].trim(), replaceText: match[2].trim() };

        return { findText: '', replaceText: '' };
    };

    // Helper: Parse options from natural language
    const parseFindReplaceOptions = (message: string): {
        matchCase?: boolean;
        matchEntireCell?: boolean;
        matchFormulaText?: boolean;
        columnFilter?: string | number;
    } => {
        const lowerMsg = message.toLowerCase();

        // Parse column specification
        let columnFilter: string | number | undefined;

        // Pattern 1: "in column A" or "in column B"
        const columnLetterMatch = message.match(/\bin\s+column\s+([A-Z])\b/i);
        if (columnLetterMatch) {
            columnFilter = columnLetterMatch[1].toUpperCase();
        }

        // Pattern 2: "in <columnname> column" like "in appid column"
        const columnNameMatch = message.match(/\bin\s+(\w+)\s+column\b/i);
        if (columnNameMatch && !columnLetterMatch) {
            columnFilter = columnNameMatch[1].toLowerCase();
        }

        return {
            matchCase: lowerMsg.includes('case sensitive') || lowerMsg.includes('match case'),
            matchEntireCell: lowerMsg.includes('whole cell') || lowerMsg.includes('entire cell') || lowerMsg.includes('exact match'),
            matchFormulaText: lowerMsg.includes('in formula') || lowerMsg.includes('formula text'),
            columnFilter
        };
    };




    // Helper function to handle query responses consistently
    const handleQueryResponse = (response: any) => {
        setMessages(prev => {
            const newMessages = prev.filter(msg => !msg.isAnalyzing);
            
            // Check if response contains clarification
            let parsedClarification = null;
            if (typeof response.response === 'string' && response.response.trim().startsWith('{')) {
                try {
                    const jsonResponse = JSON.parse(response.response);
                    if (jsonResponse.type === 'clarification') {
                        parsedClarification = jsonResponse;
                    } else if (jsonResponse.type === 'regular' && jsonResponse.message &&
                               jsonResponse.message.includes('I can help you with') &&
                               jsonResponse.message.includes('in several ways')) {
                        // This is a conversational clarification - treat as regular message
                        // Override response content with the conversational text
                        response.response = jsonResponse.message;
                    }
                } catch {
                    // Not JSON, proceed normally
                }
            }
            
            const assistantMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                type: 'assistant',
                content: parsedClarification ? '' : response.response,
                timestamp: new Date(),
                isTyping: false,  // No typing animation for clarifications
                clarification: parsedClarification || undefined,
                visualization: response.visualization ? {
                    type: response.visualization.type,
                    path: response.visualization.path,
                    original_query: response.visualization.original_query
                } : undefined
            };
            const updatedMessages = [...newMessages, assistantMessage];
            
            // Save to active chat with the updated messages
            saveChatMessagesToActiveChat(updatedMessages);
            
            return updatedMessages;
        });
    };

    // Helper function to handle filtering logic with Univer
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleUniverFiltering = async (classification: any, _query: string) => {
        console.log('[🔷 Univer Filter] Processing:', classification.action, classification.parameters);

        try {
            if (!univerAdapter || !univerAdapter.isReady()) {
                throw new Error('Univer is not available');
            }

            const action = classification.action;

            // Handle: "open filters" / "enable filters"
            if (action === 'open_filters') {
                const success = univerAdapter.createFilter();
                setMessages(prev => {
                    const newMessages = prev.filter(msg => !msg.isAnalyzing);
                    const updatedMessages = [...newMessages, {
                        id: (Date.now() + 1).toString(),
                        role: 'assistant',
                        type: 'assistant',
                        content: success ? '✅ Filters enabled on the current data range' : '❌ Failed to enable filters',
                        isTyping: false,
                        timestamp: new Date()
                    } as ChatMessage];
                    saveChatMessagesToActiveChat(updatedMessages);
                    return updatedMessages;
                });
                return;
            }

            // Handle: "clear filters" / "remove filters"
            if (action === 'clear_filters') {
                const success = univerAdapter.clearFilter();
                setMessages(prev => {
                    const newMessages = prev.filter(msg => !msg.isAnalyzing);
                    const updatedMessages = [...newMessages, {
                        id: (Date.now() + 1).toString(),
                        role: 'assistant',
                        type: 'assistant',
                        content: success ? '✅ All filters cleared' : '❌ No filters to clear',
                        isTyping: false,
                        timestamp: new Date()
                    } as ChatMessage];
                    saveChatMessagesToActiveChat(updatedMessages);
                    return updatedMessages;
                });
                return;
            }

            // Handle: "filter column A with value Complete" / "show only rows where Status equals Complete"
            if (action === 'filter_value_based' || action === 'filter_column') {
                const params = classification.parameters || {};
                const column = params.column;
                const value = params.value;
                const comparison = params.comparison || 'equals';

                console.log('[🔷 Univer Filter] Value-based filter:', { column, value, comparison });

                if (!column || !value) {
                    throw new Error('Missing column or value for filtering');
                }

                // Ensure filter exists
                let filter = univerAdapter.getFilter();
                if (!filter) {
                    console.log('[🔷 Univer Filter] No filter exists, creating one...');
                    const created = univerAdapter.createFilter();
                    if (!created) {
                        throw new Error('Failed to create filter');
                    }
                    filter = univerAdapter.getFilter();
                }

                // For value-based filtering, we need to get all unique values in the column
                // and filter to show only rows matching our criteria
                // For now, we'll implement a simple "equals" filter
                // TODO: Implement "contains" and "starts_with" for complex filtering

                if (comparison === 'equals') {
                    // Apply filter criteria to show only the specified value
                    const success = univerAdapter.setColumnFilterCriteria(column, [value]);

                    if (success) {
                        const filteredCount = univerAdapter.getFilteredOutRows().length;
                        setMessages(prev => {
                            const newMessages = prev.filter(msg => !msg.isAnalyzing);
                            const updatedMessages = [...newMessages, {
                                id: (Date.now() + 1).toString(),
                                role: 'assistant',
                                type: 'assistant',
                                content: `✅ Filtered column ${column} to show only "${value}" (${filteredCount} rows hidden)`,
                                isTyping: false,
                                timestamp: new Date()
                            } as ChatMessage];
                            saveChatMessagesToActiveChat(updatedMessages);
                            return updatedMessages;
                        });
                    } else {
                        throw new Error('Failed to apply filter criteria');
                    }
                } else {
                    // For contains/starts_with, we'd need to get all data and filter programmatically
                    // This is more complex and may require reading the data first
                    setMessages(prev => {
                        const newMessages = prev.filter(msg => !msg.isAnalyzing);
                        const updatedMessages = [...newMessages, {
                            id: (Date.now() + 1).toString(),
                            role: 'assistant' as const,
                            type: 'assistant' as const,
                            content: `⚠️ Complex filtering (${comparison}) not yet fully supported with Univer. Using equals filter.`,
                            isTyping: false,
                            timestamp: new Date()
                        } as ChatMessage];
                        saveChatMessagesToActiveChat(updatedMessages);
                        return updatedMessages;
                    });
                }
                return;
            }

            // Unhandled action
            throw new Error(`Unhandled filter action: ${action}`);

        } catch (error) {
            console.error('[🔷 Univer Filter] Error:', error);
            setMessages(prev => {
                const newMessages = prev.filter(msg => !msg.isAnalyzing);
                const updatedMessages = [...newMessages, {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    type: 'assistant',
                    content: `❌ Filter operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    isTyping: false,
                    timestamp: new Date()
                } as ChatMessage];
                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });
        }
    };

    // Helper function to handle filtering logic (Luckysheet fallback)
    const handleFilteringLogic = async (classification: any, query: string) => {
        // If Univer is available, use Univer filtering
        if (univerAdapter && univerAdapter.isReady()) {
            console.log('[🔷 Router] Routing to Univer filtering');
            return handleUniverFiltering(classification, query);
        }

        // Fallback to Luckysheet filtering
        console.log('[🔷 Router] Falling back to Luckysheet filtering');

        if (classification.action === 'filter_value_based') {
            console.log('🎯 Processing value-based filter with row hiding');
            if (typeof window !== 'undefined' && (window as any).luckysheet?.getSheetData && (window as any).luckysheet?.hideRow) {
                const sheetData = (window as any).luckysheet.getSheetData();
                if (sheetData && sheetData.length > 1) {
                    const headers = sheetData[0] || [];
                    const rawFilterColumn = classification.parameters?.column;
                    const filterColumn: string = typeof rawFilterColumn === 'string' ? rawFilterColumn : '';
                    const rawFilterValue = classification.parameters?.value;
                    const filterValue = typeof rawFilterValue === 'string' ? rawFilterValue : `${rawFilterValue ?? ''}`;
                    const comparison = typeof classification.parameters?.comparison === 'string'
                        ? classification.parameters.comparison
                        : 'equals';
                    
                    // Helper function to extract text from cells
                    const extractCellText = (cell: any): string => {
                        if (!cell) return '';
                        if (typeof cell === 'string') return cell;
                        if (typeof cell === 'object') {
                            return cell.m || cell.v || '';
                        }
                        return String(cell);
                    };
                    const filterColumnLower = filterColumn.toLowerCase();
                    
                    console.log('🔍 Filter parameters:', { filterColumn, filterValue, comparison });
                    console.log('🔍 Headers available:', headers.map((h, i) => `${i}: ${extractCellText(h)}`));
                    
                    // Find column index by name (case-insensitive)
                    let columnIndex = -1;
                    
                    for (let i = 0; i < headers.length; i++) {
                        const headerText = extractCellText(headers[i]).toLowerCase();
                        if (headerText === filterColumnLower || headerText.includes(filterColumnLower)) {
                            columnIndex = i;
                            break;
                        }
                    }
                    
                    if (columnIndex === -1) {
                        // Try to find by column letter (A, B, C, etc.)
                        const colLetter = filterColumn.toUpperCase();
                        if (colLetter.match(/^[A-Z]$/)) {
                            columnIndex = colLetter.charCodeAt(0) - 65;
                            console.log(`🔤 Column letter "${colLetter}" converted to index ${columnIndex}`);
                        }
                    }
                    
                    if (columnIndex >= 0 && columnIndex < headers.length) {
                        const columnName = extractCellText(headers[columnIndex]);
                        console.log(`✅ Found column "${columnName}" at index ${columnIndex}`);
                        
                        // Analyze rows and collect those that don't match
                        const rowsToHide: number[] = [];
                        let matchCount = 0;
                        
                        for (let rowIndex = 1; rowIndex < sheetData.length; rowIndex++) {
                            const row = sheetData[rowIndex];
                            if (row && row[columnIndex] !== undefined) {
                                const cellValue = extractCellText(row[columnIndex]).toLowerCase();
                                let matches = false;
                                
                                switch (comparison) {
                                    case 'equals':
                                        matches = cellValue === filterValue.toLowerCase();
                                        break;
                                    case 'contains':
                                        matches = cellValue.includes(filterValue.toLowerCase());
                                        break;
                                    case 'starts_with':
                                        matches = cellValue.startsWith(filterValue.toLowerCase());
                                        break;
                                    default:
                                        matches = cellValue.includes(filterValue.toLowerCase());
                                }
                                
                                if (matches) {
                                    matchCount++;
                                } else {
                                    rowsToHide.push(rowIndex);
                                }
                            } else {
                                rowsToHide.push(rowIndex);
                            }
                        }
                        
                        console.log(`🔍 Analysis: ${matchCount} rows match, ${rowsToHide.length} rows to hide`);
                        
                        // Hide non-matching rows in groups for better performance
                        if (rowsToHide.length > 0) {
                            const groups: number[][] = [];
                            if (rowsToHide.length > 0) {
                                let currentGroup: number[] = [rowsToHide[0]];
                                
                                for (let i = 1; i < rowsToHide.length; i++) {
                                    if (rowsToHide[i] === rowsToHide[i-1] + 1) {
                                        currentGroup.push(rowsToHide[i]);
                                    } else {
                                        groups.push(currentGroup);
                                        currentGroup = [rowsToHide[i]];
                                    }
                                }
                                groups.push(currentGroup);
                            }
                            
                            console.log(`🎯 Hiding ${groups.length} row range(s):`, groups);
                            
                            groups.forEach(group => {
                                if (group.length === 1) {
                                    (window as any).luckysheet.hideRow([group[0], group[0]]);
                                } else {
                                    (window as any).luckysheet.hideRow([group[0], group[group.length - 1]]);
                                }
                            });
                        }
                        
                        // Update message with results
                        setMessages(prev => {
                            const newMessages = prev.filter(msg => !msg.isAnalyzing);
                            const updatedMessages = [...newMessages, { 
                                id: (Date.now() + 1).toString(),
                                role: 'assistant', 
                                type: 'assistant',
                                content: `✅ Filtered ${sheetData.length - 1} rows, showing ${matchCount} where ${columnName} contains "${filterValue}"`,
                                isTyping: false,
                                timestamp: new Date()
                            } as ChatMessage];
                            
                            // Save to active chat
                            saveChatMessagesToActiveChat(updatedMessages);
                            
                            return updatedMessages;
                        });
                        return;
                        
                    } else {
                        console.error(`❌ Column "${filterColumn}" not found`);
                        setMessages(prev => {
                            const newMessages = prev.filter(msg => !msg.isAnalyzing);
                            const updatedMessages = [...newMessages, { 
                                id: (Date.now() + 1).toString(),
                                role: 'assistant', 
                                type: 'assistant',
                                content: `❌ Column "${filterColumn}" not found. Available columns: ${headers.map((h) => extractCellText(h)).join(', ')}`,
                                isTyping: false,
                                timestamp: new Date()
                            } as ChatMessage];
                            
                            // Save to active chat
                            saveChatMessagesToActiveChat(updatedMessages);
                            
                            return updatedMessages;
                        });
                        return;
                    }
                } else {
                    console.error('❌ No sheet data available or sheet is empty');
                    setMessages(prev => {
                        const newMessages = prev.filter(msg => !msg.isAnalyzing);
                        const updatedMessages = [...newMessages, { 
                            id: (Date.now() + 1).toString(),
                            role: 'assistant', 
                            type: 'assistant',
                            content: '❌ No spreadsheet data available to filter. Please make sure data is loaded.',
                            isTyping: false,
                            timestamp: new Date()
                        } as ChatMessage];
                        
                        // Save to active chat
                        saveChatMessagesToActiveChat(updatedMessages);
                        
                        return updatedMessages;
                    });
                    return;
                }
            }
        }
        
        // Handle other filter types here if needed
        console.log('⚠️ Unhandled filter action:', classification.action);
        setMessages(prev => {
            const newMessages = prev.filter(msg => !msg.isAnalyzing);
            const updatedMessages = [...newMessages, { 
                id: (Date.now() + 1).toString(),
                role: 'assistant', 
                type: 'assistant',
                content: `Sorry, I couldn't process that filtering request: ${classification.action}`,
                isTyping: false,
                timestamp: new Date()
            } as ChatMessage];
            
            // Save to active chat
            saveChatMessagesToActiveChat(updatedMessages);
            
            return updatedMessages;
        });
    };

    // Helper function to process classification results consistently
    const processClassificationResult = async (classification: any, query: string) => {
        if (!classification || classification.confidence < 0.8) {
            // Low confidence - route to backend
            console.log('⚠️ Low frontend confidence, routing to backend');
            const response = await sendQuery(query, activeChat?.id || 'default', { isVoice: false, mode: queryMode });
            handleQueryResponse(response);
            return;
        }

        console.log('✅ High confidence frontend routing:', classification.intent);

        // Handle high-confidence classifications
        switch (classification.intent) {
            case 'conditional_format':
                console.log('🎨 LLM-guided conditional formatting:', classification.action);
                const success = await handleLLMConditionalFormatting(classification);
                if (success) {
                    return; // Exit early after successful LLM handling
                }
                break;

            case 'hyperlink_operation':
                console.log('🔗 Hyperlink operation detected:', classification.action);
                const hyperlinkSuccess = await handleHyperlinkOperation(classification);
                if (hyperlinkSuccess) {
                    return;
                }
                break;

            case 'data_validation':
                console.log('✅ Data validation operation:', classification.action);
                const validationSuccess = await handleDataValidation(classification);
                if (validationSuccess) {
                    return;
                }
                break;

            case 'comment_operation':
                console.log('💬 Comment operation detected:', classification.action);
                const commentSuccess = await handleCommentOperation(classification);
                if (commentSuccess) {
                    return;
                }
                break;

            case 'image_operation':
                console.log('🖼️ Image/drawing operation detected:', classification.action);
                const imageSuccess = await handleImageOperation(classification);
                if (imageSuccess) {
                    return;
                }
                break;

            // data_modification removed - now handled by handleSubmit for proper dataUpdate dispatch

            case 'named_range_operation':
                console.log('📛 Named range operation detected:', classification.action);
                const namedRangeSuccess = await handleNamedRangeOperation(classification);
                if (namedRangeSuccess) {
                    return;
                }
                break;

            case 'filter':
                console.log('🔍 LLM detected filtering - analyzing action:', classification.action);
                // Execute filtering logic (existing code from handleSubmit)
                await handleFilteringLogic(classification, query);
                return;
        }
        
        // Fallback to backend if not handled
        console.log('🔄 Falling back to backend processing');
        const response = await sendQuery(query, activeChat?.id || 'default', { isVoice: false, mode: queryMode });
        handleQueryResponse(response);
    };

    // 🔄 RELIABLE EVENT WAITING HELPER
    const waitForEvent = async (eventName: string, timeoutMs: number = 15000): Promise<any> => {
        return new Promise((resolve, reject) => {
            // Event handler
            const eventHandler = (event: Event) => {
                console.log(`📡 Received ${eventName} event:`, (event as CustomEvent).detail);
                cleanup();
                resolve((event as CustomEvent).detail);
            };

            // Clean up function
            const cleanup = () => {
                clearTimeout(timeoutId);
                window.removeEventListener(eventName, eventHandler);
            };

            // Timeout handler
            const timeoutId = setTimeout(() => {
                console.warn(`⏰ Timeout waiting for ${eventName} event after ${timeoutMs}ms`);
                cleanup();
                reject(new Error(`Timeout waiting for ${eventName} event`));
            }, timeoutMs);

            // Add event listener
            window.addEventListener(eventName, eventHandler);
            console.log(`👂 Listening for ${eventName} event (timeout: ${timeoutMs}ms)`);
        });
    };
    
    // 🔄 SPREADSHEET REFRESH SYNCHRONIZATION
    const waitForSpreadsheetRefresh = async (): Promise<void> => {
        try {
            console.log('👂 Waiting for dataUpdateComplete event...');
            const eventDetail = await waitForEvent('dataUpdateComplete', 15000);
            
            if (eventDetail.success) {
                console.log('✅ Spreadsheet refresh completed successfully');
            } else {
                console.warn('⚠️ Spreadsheet refresh reported failure:', eventDetail.error);
                // Continue anyway - don't let refresh failures stop compound queries
            }
        } catch (error) {
            console.warn('⚠️ Spreadsheet refresh event timeout - continuing anyway:', error);
            // Don't throw - let compound query continue even if sync fails
        }
    };

    // 🎯 MANUAL HIGHLIGHT EXECUTION FOR COMPOUND QUERIES
    const executeManualHighlight = async (command: string): Promise<{ success: boolean; error?: string }> => {
        // ⚠️ DEPRECATED: This function used Luckysheet for manual highlighting
        // TODO: Reimplement with Univer conditional formatting API when available
        console.warn('⚠️ executeManualHighlight called but is deprecated');
        console.warn('⚠️ Manual highlighting commands not yet supported in Univer');

        return {
            success: false,
            error: 'Manual highlighting is not yet supported. This feature will be re-implemented with Univer soon.'
        };

        // ALL CODE BELOW IS UNREACHABLE - Old Luckysheet implementation (~250 lines removed)
        try {
            console.log('🎯 Executing manual highlight command:', command);

            if (typeof window === 'undefined' || !(window as any).luckysheet) {
                return { success: false, error: 'Spreadsheet not available' };
            }

            // Parse the command to extract condition and column
            // Expected format: "highlight [condition] [value] in column [column]"
            // Examples: "highlight greater than 5000 in column M", "highlight duplicates in column A"

            const sheetData = (window as any).luckysheet.getSheetData();
            if (!sheetData || sheetData.length === 0) {
                return { success: false, error: 'No spreadsheet data available' };
            }
            
            // Parse different highlight patterns
            let conditionName: string;
            let conditionValues: number[] = [];
            let columnIdentifier: string;
            
            // Pattern 1: Greater than, less than, equal to
            const numericMatch = command.match(/highlight\s+(greater\s+than|less\s+than|equal\s+to|between)\s+([0-9.]+)(?:\s+and\s+([0-9.]+))?\s+in\s+column\s+([A-Z]+|[\w\s]+)/i);
            if (numericMatch) {
                const match = numericMatch as RegExpMatchArray;
                const comparison = (match[1] || '').toLowerCase().replace(/\s+/g, '');
                const value1 = parseFloat(match[2] || '');
                const value2 = match[3] ? parseFloat(match[3]) : undefined;
                columnIdentifier = (match[4] || '').trim();
                
                if (comparison === 'greaterthan') {
                    conditionName = 'greaterThan';
                    conditionValues = [value1];
                } else if (comparison === 'lessthan') {
                    conditionName = 'lessThan';
                    conditionValues = [value1];
                } else if (comparison === 'equalto') {
                    conditionName = 'equal';
                    conditionValues = [value1];
                } else if (comparison === 'between' && value2 !== undefined) {
                    conditionName = 'betweenness';
                    conditionValues = [value1, value2 as number];
                }
            }
            
            // Pattern 2: Duplicates
            const duplicateMatch = command.match(/highlight\s+duplicates?\s+in\s+column\s+([A-Z]+|[\w\s]+)/i);
            if (duplicateMatch) {
                const dupMatch = duplicateMatch as RegExpMatchArray;
                conditionName = 'duplicateValue';
                conditionValues = [0]; // 0 = highlight duplicates, 1 = highlight unique
                columnIdentifier = (dupMatch[1] || '').trim();
            }
            
            if (!conditionName || !columnIdentifier) {
                return { success: false, error: 'Could not parse highlight command format' };
            }
            
            console.log('🔍 Parsed highlight parameters:', {
                conditionName,
                conditionValues,
                columnIdentifier
            });
            
            // Find column index
            let colIndex = -1;
            if (columnIdentifier.match(/^[A-Z]$/)) {
                // Single letter column (A, B, C, etc.)
                colIndex = columnIdentifier.charCodeAt(0) - 65;
            } else {
                // Named column - search headers
                const headers = sheetData[0] || [];
                for (let i = 0; i < headers.length; i++) {
                    const headerText = headers[i] && typeof headers[i] === 'object' ? 
                                     (headers[i].m || headers[i].v || '') : (headers[i] || '');
                    if (headerText.toString().toLowerCase().trim() === columnIdentifier.toLowerCase()) {
                        colIndex = i;
                        break;
                    }
                }
            }
            
            if (colIndex === -1) {
                return { success: false, error: `Column '${columnIdentifier}' not found` };
            }
            
            const colLetter = String.fromCharCode(65 + colIndex);
            console.log(`📍 Found column ${columnIdentifier} at index ${colIndex} (${colLetter})`);
            
            // Apply the highlighting logic based on condition type
            if (conditionName === 'duplicateValue') {
                // Handle duplicates using existing logic
                const counts: Record<string, number> = {};
                const startRow = 1; // Skip header
                const endRow = sheetData.length - 1;
                
                // Count occurrences
                for (let r = startRow; r <= endRow; r++) {
                    const cell = sheetData[r]?.[colIndex];
                    const value = extractCellText(cell);
                    if (value !== '') counts[value] = (counts[value] || 0) + 1;
                }
                
                // Find rows to highlight
                const targetRows: number[] = [];
                for (let r = startRow; r <= endRow; r++) {
                    const cell = sheetData[r]?.[colIndex];
                    const value = extractCellText(cell);
                    const count = value === '' ? 0 : (counts[value] || 0);
                    if (value !== '' && count > 1) {
                        targetRows.push(r + 1); // Convert to 1-based
                    }
                }
                
                // Apply highlighting
                return applyHighlightToRows(targetRows, colLetter);
                
            } else if (['greaterThan', 'lessThan', 'equal', 'betweenness'].includes(conditionName)) {
                // Handle numeric conditions
                const targetRows: number[] = [];
                
                for (let r = 1; r < sheetData.length; r++) { // Skip header row
                    const cell = sheetData[r]?.[colIndex];
                    const numValue = getCellNumericValue(cell);
                    const numericValue = typeof numValue === 'number' ? numValue : null;
                    
                    if (numericValue !== null) {
                        const value = Number(numericValue);
                        let matches = false;
                        
                        switch (conditionName) {
                            case 'greaterThan':
                                matches = value > conditionValues[0];
                                break;
                            case 'lessThan':
                                matches = value < conditionValues[0];
                                break;
                            case 'equal':
                                matches = Math.abs(value - conditionValues[0]) < 0.0001;
                                break;
                            case 'betweenness':
                                if (conditionValues.length >= 2) {
                                    const min = Math.min(conditionValues[0], conditionValues[1]);
                                    const max = Math.max(conditionValues[0], conditionValues[1]);
                                    matches = value >= min && value <= max;
                                }
                                break;
                        }
                        
                        if (matches) {
                            targetRows.push(r + 1); // Convert to 1-based for Luckysheet
                        }
                    }
                }
                
                // Apply highlighting
                return applyHighlightToRows(targetRows, colLetter);
            }
            
            return { success: false, error: 'Unsupported condition type' };
            
        } catch (error) {
            console.error('❌ Manual highlight execution failed:', error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    };
    
    // Helper function to extract cell text (reused from existing code)
    const extractCellText = (cell: any): string => {
        if (cell === null || cell === undefined) return '';
        if (typeof cell === 'object' && cell !== null) {
            const directM = (cell as any).m;
            const directV = (cell as any).v;
            if (directM !== undefined && directM !== null) return String(directM).trim();
            if (directV !== undefined && directV !== null) {
                if (typeof directV === 'object') {
                    const nestedM = (directV as any).m;
                    const nestedV = (directV as any).v;
                    if (nestedM !== undefined && nestedM !== null) return String(nestedM).trim();
                    if (nestedV !== undefined && nestedV !== null) return String(nestedV).trim();
                    return String(directV).trim();
                }
                return String(directV).trim();
            }
            return '';
        }
        return String(cell).trim();
    };
    
    // Helper function to extract numeric value from cell (reused from existing code)
    const getCellNumericValue = (cell: any): number | null => {
        if (cell === null || cell === undefined) return null;
        
        let rawValue: any = cell;
        if (typeof cell === 'object' && cell !== null) {
            const directM = (cell as any).m;
            const directV = (cell as any).v;
            if (directM !== undefined && directM !== null) rawValue = directM;
            else if (directV !== undefined && directV !== null) {
                if (typeof directV === 'object') {
                    const nestedM = (directV as any).m;
                    const nestedV = (directV as any).v;
                    if (nestedM !== undefined && nestedM !== null) rawValue = nestedM;
                    else if (nestedV !== undefined && nestedV !== null) rawValue = nestedV;
                    else rawValue = directV;
                } else {
                    rawValue = directV;
                }
            } else {
                return null;
            }
        }
        
        const numValue = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue));
        return isNaN(numValue) ? null : numValue;
    };
    
    // Helper function to apply highlighting to rows
    const applyHighlightToRows = (targetRows: number[], colLetter: string): { success: boolean; error?: string } => {
        try {
            if (targetRows.length === 0) {
                return { success: true }; // No rows to highlight is not an error
            }
            
            console.log(`🎨 Applying highlight to ${targetRows.length} cells in column ${colLetter}:`, targetRows);
            
            // Group contiguous rows into blocks for efficient highlighting
            let s = targetRows[0];
            let p = targetRows[0];
            const blocks: Array<{ s: number; e: number }> = [];
            for (let k = 1; k < targetRows.length; k++) {
                if (targetRows[k] === p + 1) p = targetRows[k];
                else { blocks.push({ s, e: p }); s = p = targetRows[k]; }
            }
            blocks.push({ s, e: p });
            
            // Apply background color to each block
            blocks.forEach(block => {
                const blockRange = `${colLetter}${block.s}:${colLetter}${block.e}`;
                try {
                    (window as any).luckysheet.setRangeFormat('bg', '#ffcccc', { range: blockRange });
                    console.log(`✅ Applied highlight to range: ${blockRange}`);
                } catch (error) {
                    console.warn('⚠️ Failed to highlight range:', blockRange, error);
                }
            });
            
            return { success: true };
            
        } catch (error) {
            console.error('❌ Failed to apply highlighting:', error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    };

    // 🎭 NEW: UNIVERSAL QUERY ROUTING (replaces compound detection)
    const routeQueryUniversally = async (query: string): Promise<{
        processorType: ProcessorType;
        queryType: UniversalQueryType;
        shouldUseOrchestration: boolean;
        shouldRouteDirect: boolean;
        confidence: number;
        reasoning: string;
    }> => {
        console.log('🧠 Universal Query Router: Analyzing query:', query);
        
        try {
            const executionPlan = await universalQueryRouter.route(query, {
                chatId: activeChat?.id,
                workspaceId: currentWorkspace?.id || 'default',
                currentData: data
            });
            
            const routing = executionPlan.routing;
            
            console.log('🧠 Universal routing decision:', {
                query: query.slice(0, 50) + '...',
                queryType: routing.queryType,
                processorType: routing.processorType,
                confidence: routing.confidence,
                reasoning: routing.reasoning
            });
            
            return {
                processorType: routing.processorType,
                queryType: routing.queryType,
                shouldUseOrchestration: routing.processorType === ProcessorType.ORCHESTRATED,
                shouldRouteDirect: routing.processorType === ProcessorType.DIRECT_BACKEND || 
                                   routing.processorType === ProcessorType.DIRECT_FRONTEND,
                confidence: routing.confidence,
                reasoning: routing.reasoning
            };
            
        } catch (error) {
            console.warn('🧠 Universal Query Router failed, using legacy fallback:', error);
            
            // Fallback to legacy detection logic
            return {
                processorType: ProcessorType.FALLBACK_LEGACY,
                queryType: UniversalQueryType.UNKNOWN,
                shouldUseOrchestration: false,
                shouldRouteDirect: false,
                confidence: 0.5,
                reasoning: 'Router error, using legacy fallback'
            };
        }
    };
    
    // 🔄 LEGACY: Keep old compound detection as fallback only
    const detectCompoundQuery = async (query: string): Promise<boolean> => {
        console.log('⚠️ Using legacy compound query detection (fallback only)');
        
        try {
            // Use the orchestrator in preview mode to intelligently detect compound queries
            const orchestrateResponse = await fetch('http://localhost:8000/api/orchestrate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: query,
                    workspace_id: currentWorkspace?.id || 'default',
                    preview_only: true
                }),
            });
            
            if (!orchestrateResponse.ok) {
                console.warn('🎭 Orchestrator preview failed, assuming simple query');
                return false;
            }
            
            const orchestrationResult = await orchestrateResponse.json();
            
            // If orchestrator can decompose into 2+ steps, it's a compound query
            const stepCount = orchestrationResult.estimated_steps || orchestrationResult.total_steps || 0;
            const isCompound = orchestrationResult.success && stepCount >= 2;
            
            console.log('🎭 Legacy compound query detection result:', {
                query: query.slice(0, 50) + '...',
                success: orchestrationResult.success,
                stepCount: stepCount,
                isCompound: isCompound,
                operations: orchestrationResult.operations?.map(op => op.step_type + ': ' + op.description) || []
            });
            
            return isCompound;
            
        } catch (error) {
            console.warn('🎭 Legacy compound query detection failed, assuming simple query:', error);
            return false;
        }
    };

    const handleCompoundQuery = async (query: string, workspaceId: string): Promise<any> => {
        console.log('🎭 === HANDLING COMPOUND QUERY ===');
        console.log('📝 Query:', query);
        console.log('🔷 Workspace ID:', workspaceId);
        
        try {
            // Get execution steps from orchestrator
            const orchestrateResponse = await fetch('http://localhost:8000/api/orchestrate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: query,
                    workspace_id: workspaceId,
                    preview_only: false
                }),
            });
            
            if (!orchestrateResponse.ok) {
                throw new Error(`Orchestration failed: ${orchestrateResponse.status} ${orchestrateResponse.statusText}`);
            }
            
            const orchestrationResult = await orchestrateResponse.json();
            console.log('🎭 Orchestration result:', orchestrationResult);
            
            if (!orchestrationResult.success) {
                return {
                    success: false,
                    error: `Query decomposition failed: ${orchestrationResult.error}`,
                    orchestration: orchestrationResult
                };
            }
            
            // Execute steps using existing single query flows
            console.log('🔄 === EXECUTING STEPS USING EXISTING FLOWS ===');
            const executedSteps: string[] = [];
            const failedSteps: string[] = [];
            
            // Execute steps in dependency order (flatten execution plan)
            const allSteps = orchestrationResult.execution_plan.flat();
            
            for (let i = 0; i < allSteps.length; i++) {
                const step = allSteps[i];
                console.log(`🎯 === Executing Step ${i + 1}/${allSteps.length}: ${step.step_id} (${step.step_type}) ===`);
                console.log(`📝 Command: ${step.command}`);
                console.log(`📋 Description: ${step.description}`);
                
                try {
                    let stepResult;
                    
                    if (step.step_type === 'spreadsheet') {
                        // 🔄 VALIDATION: Verify spreadsheet is available and has data
                        let isSpreadsheetReady = false;
                        let attempts = 0;
                        const maxAttempts = 3;
                        
                        while (!isSpreadsheetReady && attempts < maxAttempts) {
                            attempts++;
                            
                            if (typeof window !== 'undefined' && (window as any).luckysheet?.getSheetData) {
                                const currentData = (window as any).luckysheet.getSheetData();
                                if (currentData && currentData.length > 0) {
                                    console.log(`✅ Spreadsheet validation passed (attempt ${attempts}) - ${currentData.length} rows available`);
                                    isSpreadsheetReady = true;
                                } else {
                                    console.warn(`⚠️ Spreadsheet has no data (attempt ${attempts})`);
                                }
                            } else {
                                console.warn(`⚠️ Luckysheet not available (attempt ${attempts})`);
                            }
                            
                            if (!isSpreadsheetReady && attempts < maxAttempts) {
                                console.log(`⏳ Retrying spreadsheet validation in 300ms...`);
                                await new Promise(resolve => setTimeout(resolve, 300));
                            }
                        }
                        
                        if (!isSpreadsheetReady) {
                            console.error('❌ Spreadsheet validation failed after all attempts');
                            failedSteps.push(`${step.description}: Spreadsheet not ready or has no data`);
                            continue;
                        }
                        
                        // Univer-only execution path for common commands (no deprecated backend)
                        try {

                            // Quick path removed - let universal command router handle all operations
                            // (including multi-column commands like "delete column D and E")

                            // Attempt universal execution path (frontend only)
                            const execResult = await executeUniversalCommand({ action: 'natural_language', payload: { command: step.command } } as any);
                            if (execResult?.success) {
                                executedSteps.push(`${step.description}`);
                                console.log(`✅ Frontend operation completed: ${step.description}`);
                            } else {
                                console.warn(`⚠️ Frontend operation failed: ${execResult?.message || 'Unknown error'}`);
                                failedSteps.push(`${step.description}: ${execResult?.message || 'Execution failed'}`);
                            }
                        } catch (err) {
                            console.error('❌ Spreadsheet step execution error:', err);
                            failedSteps.push(`${step.description}: ${(err as Error).message || String(err)}`);
                        }
                        
                    } else if (step.step_type === 'backend') {
                        // Use existing backend query flow
                        stepResult = await sendQuery(step.command, activeChat?.id || 'default', { isVoice: false, mode: queryMode });
                        
                        // Handle data updates
                        if (stepResult.data_updated && stepResult.updated_data?.data) {
                            console.log('📊 Backend operation modified data - dispatching update event');
                            const dataUpdateEvent = new CustomEvent('dataUpdate', { 
                                detail: { data: stepResult.updated_data.data } 
                            });
                            window.dispatchEvent(dataUpdateEvent);
                            
                            // 🔄 RELIABLE SYNCHRONIZATION: Wait for spreadsheet refresh to complete
                            console.log('⏳ Waiting for spreadsheet refresh to complete...');
                            await waitForSpreadsheetRefresh();
                            console.log('✅ Spreadsheet refresh complete - ready for next step');
                        }
                        
                        executedSteps.push(step.description);
                        
                    } else if (step.step_type === 'agent') {
                        // Use existing agent flow (if available)
                        stepResult = await sendQuery(step.command, activeChat?.id || 'default', { isVoice: false, mode: queryMode });
                        executedSteps.push(step.description);
                        
                    } else if (step.step_type === 'manual_highlight') {
                        // Use manual highlighting logic to bypass problematic Luckysheet API
                        console.log('🎯 Executing manual highlight step:', step.command);
                        
                        try {
                            const highlightResult = await executeManualHighlight(step.command);
                            if (highlightResult.success) {
                                executedSteps.push(step.description);
                            } else {
                                failedSteps.push(`${step.description}: ${highlightResult.error}`);
                            }
                        } catch (highlightError) {
                            console.error('❌ Manual highlight execution failed:', highlightError);
                            failedSteps.push(`${step.description}: ${highlightError instanceof Error ? highlightError.message : String(highlightError)}`);
                        }
                        
                    } else if (step.step_type === 'chart') {
                        // Use existing chart generation flow (if available)
                        stepResult = await sendQuery(step.command, activeChat?.id || 'default', { isVoice: false, mode: queryMode });
                        executedSteps.push(step.description);
                        
                    } else {
                        console.warn(`⚠️ Unknown step type: ${step.step_type}`);
                        failedSteps.push(`${step.description}: Unknown step type`);
                    }
                    
                } catch (error) {
                    console.error(`❌ Step ${i + 1}/${allSteps.length} execution failed:`, error);
                    console.error(`❌ Failed step details:`, {
                        stepId: step.step_id,
                        stepType: step.step_type,
                        command: step.command,
                        description: step.description
                    });
                    
                    failedSteps.push(`${step.description}: ${error instanceof Error ? error.message : String(error)}`);
                    
                    // 🔄 EXECUTION CONTINUITY: Log failure but continue to next step
                    console.log(`🔄 Continuing to next step despite failure (${failedSteps.length} failed so far)`);
                }
                
                // Progress logging after each step
                console.log(`📊 Progress: ${executedSteps.length} completed, ${failedSteps.length} failed, ${allSteps.length - i - 1} remaining`);
            }
            
            // Generate user-friendly summary
            const successSummary = executedSteps.map(desc => `✅ ${desc}`).join('\n');
            const errorSummary = failedSteps.map(desc => `❌ ${desc}`).join('\n');
            const finalSummary = [successSummary, errorSummary].filter(Boolean).join('\n');
            
            return {
                success: executedSteps.length > 0,
                message: `Completed ${executedSteps.length} of ${orchestrationResult.total_steps} steps`,
                detailed_message: finalSummary || 'All steps completed successfully',
                steps_executed: executedSteps.length,
                steps_failed: failedSteps.length,
                orchestration: orchestrationResult
            };
            
        } catch (error) {
            console.error('❌ Compound query handling failed:', error);
            return {
                success: false,
                error: `Orchestration failed: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    };

    // 🎬 UNIVER COMMAND EXECUTION HELPER
    const executeUniverCommand = async (actionPayload: any, adapter: UniverAdapter): Promise<{ success: boolean; message?: string }> => {
        try {
            if (!actionPayload || !adapter || !adapter.isReady()) {
                return { success: false, message: 'Spreadsheet not available' };
            }

            console.log('🌌 [Univer] Executing command:', actionPayload);

            if (actionPayload.type === 'luckysheet_api') {
                // Single API call - map to Univer
                const { method, params } = actionPayload.payload || {};
                const result = mapLuckysheetMethodToUniver(method, params || [], adapter);
                return result;

            } else if (actionPayload.type === 'multiple_luckysheet_api') {
                // Multiple API calls in sequence
                const { calls } = actionPayload.payload || {};
                if (!calls || !Array.isArray(calls)) {
                    return { success: false, message: 'No API calls found' };
                }

                console.log(`🌌 [Univer] Executing ${calls.length} commands in sequence`);
                for (let i = 0; i < calls.length; i++) {
                    const call = calls[i];
                    const { method, params } = call;

                    console.log(`🌌 [Univer] [${i + 1}/${calls.length}] Calling ${method}`);
                    const result = mapLuckysheetMethodToUniver(method, params || [], adapter);

                    if (!result.success) {
                        return { success: false, message: `Command ${i + 1} failed: ${result.message}` };
                    }
                }
                return { success: true, message: `Executed ${calls.length} commands` };
            }

            return { success: false, message: 'Unknown action type' };
        } catch (error) {
            console.error('❌ Error executing Univer command:', error);
            return { success: false, message: `Execution failed: ${error instanceof Error ? error.message : String(error)}` };
        }
    };

    // 🔄 MAP LUCKYSHEET API METHODS TO UNIVER ADAPTER
    const mapLuckysheetMethodToUniver = (method: string, params: any[], adapter: UniverAdapter): { success: boolean; message?: string } => {
        try {
            console.log(`🔄 [Mapping] ${method}(${params.join(', ')})`);

            switch (method) {
                // Cell value operations
                case 'setCellValue':
                    if (params.length >= 3) {
                        const [row, col, value] = params;
                        return adapter.setCellValue(row, col, value)
                            ? { success: true, message: `Set cell ${row},${col} = ${value}` }
                            : { success: false, message: 'Failed to set cell value' };
                    }
                    break;

                case 'setRangeValue':
                    if (params.length >= 5) {
                        const [startRow, startCol, numRows, numCols, value] = params;
                        const values = Array(numRows).fill(null).map(() => Array(numCols).fill(value));
                        return adapter.setRangeValues(startRow, startCol, values)
                            ? { success: true }
                            : { success: false, message: 'Failed to set range value' };
                    }
                    break;

                // Formatting operations
                case 'setRangeBackgroundColor':
                case 'setBackgroundColor':
                    if (params.length >= 5) {
                        const [startRow, startCol, numRows, numCols, color] = params;
                        return adapter.setBackgroundColor(startRow, startCol, numRows, numCols, color)
                            ? { success: true }
                            : { success: false, message: 'Failed to set background color' };
                    }
                    break;

                case 'setRangeFontColor':
                case 'setFontColor':
                    if (params.length >= 5) {
                        const [startRow, startCol, numRows, numCols, color] = params;
                        return adapter.setFontColor(startRow, startCol, numRows, numCols, color)
                            ? { success: true }
                            : { success: false, message: 'Failed to set font color' };
                    }
                    break;

                case 'setRangeFontBold':
                case 'setFontWeight':
                    if (params.length >= 5) {
                        const [startRow, startCol, numRows, numCols, bold] = params;
                        const weight = bold ? 'bold' : 'normal';
                        return adapter.setFontWeight(startRow, startCol, numRows, numCols, weight)
                            ? { success: true }
                            : { success: false, message: 'Failed to set font weight' };
                    }
                    break;

                case 'setNumberFormat':
                    if (params.length >= 5) {
                        const [startRow, startCol, numRows, numCols, format] = params;
                        return adapter.setNumberFormat(startRow, startCol, numRows, numCols, format)
                            ? { success: true }
                            : { success: false, message: 'Failed to set number format' };
                    }
                    break;

                // Clear operations
                case 'clearRange':
                    if (params.length >= 4) {
                        const [startRow, startCol, numRows, numCols] = params;
                        return adapter.clearRange(startRow, startCol, numRows, numCols)
                            ? { success: true }
                            : { success: false, message: 'Failed to clear range' };
                    }
                    break;

                case 'clearSheet':
                    return adapter.clearSheet()
                        ? { success: true }
                        : { success: false, message: 'Failed to clear sheet' };

                // Formula operations
                case 'setCellFormula':
                    if (params.length >= 3) {
                        const [row, col, formula] = params;
                        return adapter.setFormula(row, col, formula)
                            ? { success: true }
                            : { success: false, message: 'Failed to set formula' };
                    }
                    break;

                // Column width operations
                case 'setColumnWidth':
                    if (params.length >= 2) {
                        const [columnIndex, width] = params;
                        return adapter.setColumnWidth(columnIndex, width)
                            ? { success: true }
                            : { success: false, message: 'Failed to set column width' };
                    }
                    break;

                case 'setColumnWidths':
                    if (params.length >= 3) {
                        const [startCol, numCols, width] = params;
                        return adapter.setColumnWidths(startCol, numCols, width)
                            ? { success: true }
                            : { success: false, message: 'Failed to set column widths' };
                    }
                    break;

                case 'autoResizeColumns':
                case 'autoFitColumns':
                case 'autofitColumns':
                    if (params.length >= 2) {
                        const [startCol, numCols] = params;
                        return adapter.autoResizeColumns(startCol, numCols)
                            ? { success: true, message: `Auto-fit columns ${startCol} to ${startCol + numCols - 1}` }
                            : { success: false, message: 'Failed to auto-resize columns' };
                    }
                    break;

                // Row height operations
                case 'setRowHeight':
                    if (params.length >= 2) {
                        const [rowIndex, height] = params;
                        return adapter.setRowHeight(rowIndex, height)
                            ? { success: true }
                            : { success: false, message: 'Failed to set row height' };
                    }
                    break;

                case 'setRowHeights':
                    if (params.length >= 3) {
                        const [startRow, numRows, height] = params;
                        return adapter.setRowHeights(startRow, numRows, height)
                            ? { success: true }
                            : { success: false, message: 'Failed to set row heights' };
                    }
                    break;

                case 'autoResizeRows':
                case 'autoFitRows':
                case 'autofitRows':
                    if (params.length >= 2) {
                        const [startRow, numRows] = params;
                        return adapter.autoResizeRows(startRow, numRows)
                            ? { success: true, message: `Auto-fit rows ${startRow} to ${startRow + numRows - 1}` }
                            : { success: false, message: 'Failed to auto-resize rows' };
                    }
                    break;

                default:
                    console.warn(`⚠️ [Mapping] Unsupported method: ${method}`);
                    return { success: false, message: `Method '${method}' not yet mapped to Univer` };
            }

            return { success: false, message: `Invalid parameters for ${method}` };
        } catch (error) {
            console.error(`❌ Error mapping ${method}:`, error);
            return { success: false, message: `Mapping failed: ${error instanceof Error ? error.message : String(error)}` };
        }
    };

    // 🌐 UNIVERSAL COMMAND EXECUTOR (Univer only)
    const executeUniversalCommand = async (actionPayload: any): Promise<{ success: boolean; message?: string }> => {
        // Check if Univer is active
        if (univerAdapter && univerAdapter.isReady()) {
            console.log('🌌 Using Univer engine for command execution');
            return await executeUniverCommand(actionPayload, univerAdapter);
        }

        // ⚠️ DEPRECATED: Luckysheet fallback removed
        // All operations now require Univer to be active
        console.warn('⚠️ Univer not available - Luckysheet fallback disabled');

        return { success: false, message: 'Univer spreadsheet engine not available. Please ensure Univer is loaded.' };
    };


    const handleSubmit = async (e: React.FormEvent) => {
        console.log('🚀 === HANDLESUBMIT FUNCTION STARTED ===');
        console.log('📝 Input value:', input.trim());
        console.log('🔄 Is processing:', isProcessing);
        
        e.preventDefault();
        if (!input.trim() || isProcessing) {
            console.log('❌ Early return - empty input or processing');
            return;
        }

        // If no active chat exists, create one first
        if (!activeChat && currentWorkspace?.id) {
            try {
                console.log('🆕 No active chat found, creating default chat...');
                const newChat = await createNewChat(currentWorkspace.id, 'Chat 1');
                setChats([newChat]);
                setActiveChat(newChat);
            } catch (error) {
                console.error('❌ Failed to create default chat:', error);
                alert('Failed to create chat. Please try again.');
                return;
            }
        }

        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev,
            { role: 'user', content: userMessage },
            { role: 'assistant', content: '', isAnalyzing: true }
        ]);
        setIsProcessing(true);

        try {
            // Simple command detection: Check if this is a spreadsheet operation
            const looksLikeSpreadsheetCmd = /autofit|fit|bold|italic|underline|highlight|background|color|font|cell|range|column|row|undo|redo|freeze|sort|filter|delete\s+column|remove\s+column/i.test(userMessage);
            const isSpreadsheetOperation = (univerAdapter && univerAdapter.isReady()) && looksLikeSpreadsheetCmd;

            // If it looks like a spreadsheet command but Univer isn't ready, stop and show hint
            if (looksLikeSpreadsheetCmd && !(univerAdapter && univerAdapter.isReady())) {
                setMessages(prev => {
                    const newMessages = prev.filter(msg => !msg.isAnalyzing);
                    return [...newMessages, { role: 'assistant', content: '⚠️ Spreadsheet not ready. Click inside the sheet to activate it, then try again.', isTyping: true }];
                });
                setIsProcessing(false);
                return;
            }

            if (isSpreadsheetOperation) {
                console.log('🔍 === DETECTED SPREADSHEET OPERATION ===');
                console.log('📝 Command:', userMessage);
                console.log('🎯 Attempting local execution...');

                try {
                    // Quick path removed - let LLM classifier handle all column operations
                    // (including multi-column commands like "delete column D and E")
                    // ===================================================================
                    // HELPER FUNCTIONS
                    // ===================================================================

                    // Helper: Extract color from command
                    const extractColor = (cmd: string): string | null => {
                        const colorMap: Record<string, string> = {
                            'red': '#ff0000',
                            'blue': '#0000ff',
                            'green': '#00ff00',
                            'yellow': '#ffff00',
                            'orange': '#ff9900',
                            'purple': '#9900ff',
                            'pink': '#ff69b4',
                            'gray': '#808080',
                            'grey': '#808080',
                            'black': '#000000',
                            'white': '#ffffff'
                        };

                        const lowerCmd = cmd.toLowerCase();
                        for (const [name, hex] of Object.entries(colorMap)) {
                            if (lowerCmd.includes(name)) {
                                return hex;
                            }
                        }
                        return null;
                    };

                    // Helper: Parse cell reference like "A2" or "A2:B10"
                    const parseCellReference = (cellRef: string): {
                        startRow: number;
                        startCol: number;
                        numRows: number;
                        numCols: number;
                    } | null => {
                        const match = cellRef.match(/([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?/i);
                        if (!match) return null;

                        const columnLetterToIndex = (letter: string): number => {
                            let result = 0;
                            for (let i = 0; i < letter.length; i++) {
                                result = result * 26 + (letter.charCodeAt(i) - 64);
                            }
                            return result - 1;
                        };

                        const startCol = columnLetterToIndex(match[1].toUpperCase());
                        const startRow = parseInt(match[2]) - 1;
                        const endCol = match[3] ? columnLetterToIndex(match[3].toUpperCase()) : startCol;
                        const endRow = match[4] ? parseInt(match[4]) - 1 : startRow;

                        return {
                            startRow: Math.min(startRow, endRow),
                            startCol: Math.min(startCol, endCol),
                            numRows: Math.abs(endRow - startRow) + 1,
                            numCols: Math.abs(endCol - startCol) + 1
                        };
                    };

                    // Helper: Extract cell reference from command
                    const extractCellReference = (cmd: string): string | null => {
                        // First try to match natural language range patterns like "A1 to R1"
                        const naturalRangeMatch = cmd.match(/\b([A-Z]+\d+)\s+(?:to|through|and)\s+([A-Z]+\d+)\b/i);
                        if (naturalRangeMatch) {
                            const start = naturalRangeMatch[1].toUpperCase();
                            const end = naturalRangeMatch[2].toUpperCase();
                            console.log(`📝 Converted natural range "${naturalRangeMatch[0]}" to ${start}:${end}`);
                            return `${start}:${end}`;
                        }

                        // Also handle "from A1 to R1" pattern
                        const fromToMatch = cmd.match(/\bfrom\s+([A-Z]+\d+)\s+to\s+([A-Z]+\d+)\b/i);
                        if (fromToMatch) {
                            const start = fromToMatch[1].toUpperCase();
                            const end = fromToMatch[2].toUpperCase();
                            console.log(`📝 Converted natural range "from ${fromToMatch[1]} to ${fromToMatch[2]}" to ${start}:${end}`);
                            return `${start}:${end}`;
                        }

                        // Fall back to standard colon format or single cell
                        const cellRefMatch = cmd.match(/\b([A-Z]+\d+(?::[A-Z]+\d+)?)\b/i);
                        return cellRefMatch ? cellRefMatch[1].toUpperCase() : null;
                    };

                    // Helper: Get range (from cell ref or current selection)
                    const getRange = (cellRef: string | null) => {
                        if (cellRef) {
                            const range = parseCellReference(cellRef);
                            if (!range) {
                                throw new Error(`Invalid cell reference: ${cellRef}`);
                            }
                            console.log('📍 Using cell reference:', cellRef, range);
                            return range;
                        } else {
                            const range = univerAdapter.getCurrentActiveRange();
                            if (!range) {
                                throw new Error('No cell selection and no cell reference provided');
                            }
                            console.log('📍 Using current selection:', range);
                            return range;
                        }
                    };

                    // ===================================================================
                    // SIMPLE COMMAND PATTERNS (No LLM - just regex like NativeSpreadsheet)
                    // ===================================================================

                    // Autofit columns - wide pattern net
                    if (/(?:can you |please |could you )?(?:auto\s*fit|autofit|fit|resize|adjust)\s*(?:the\s+)?columns?(?:\s+to\s+content)?/i.test(userMessage)) {
                        console.log('📊 Detected: Autofit columns');
                        const success = univerAdapter.autofitColumns();
                        if (success) {
                            setMessages(prev => [...prev.filter(msg => !msg.isAnalyzing), {
                                id: (Date.now() + 1).toString(),
                                role: 'assistant',
                                type: 'assistant',
                                content: '✅ Columns autofitted to content.',
                                timestamp: new Date()
                            } as ChatMessage]);
                            setIsProcessing(false);
                            return;
                        }
                        throw new Error('Autofit columns failed');
                    }

                    // Autofit rows - wide pattern net
                    if (/(?:can you |please |could you )?(?:auto\s*fit|autofit|fit|resize|adjust)\s*(?:the\s+)?rows?(?:\s+to\s+content)?/i.test(userMessage)) {
                        console.log('📊 Detected: Autofit rows');
                        const success = univerAdapter.autofitRows();
                        if (success) {
                            setMessages(prev => [...prev.filter(msg => !msg.isAnalyzing), {
                                id: (Date.now() + 1).toString(),
                                role: 'assistant',
                                type: 'assistant',
                                content: '✅ Rows autofitted to content.',
                                timestamp: new Date()
                            } as ChatMessage]);
                            setIsProcessing(false);
                            return;
                        }
                        throw new Error('Autofit rows failed');
                    }

                    // Insert column(s)
                    {
                        const m = userMessage.match(/\b(?:insert|add|create)\s*(\d+)?\s*columns?\s*(?:at|before|after)?\s*(?:column\s*)?([A-Za-z]|\d+)\b/i)
                            || userMessage.match(/\b(?:insert|add|create)\s*(?:a\s+)?(?:new\s+)?column\s*(?:at|before|after)?\s*(?:column\s*)?([A-Za-z]|\d+)\b/i);
                        if (m) {
                            const count = m[1] ? parseInt(m[1], 10) : 1;
                            const ref = m[m.length - 1];
                            const colIndex = /^[A-Za-z]$/.test(ref) ? (ref.toUpperCase().charCodeAt(0) - 65) : (parseInt(ref, 10) - 1);
                            if (!Number.isNaN(colIndex) && colIndex >= 0) {
                                const success = univerAdapter.insertColumn(colIndex, Math.max(1, count));
                                if (success) {
                                    setMessages(prev => [...prev.filter(msg => !msg.isAnalyzing), {
                                        id: (Date.now() + 1).toString(),
                                        role: 'assistant',
                                        type: 'assistant',
                                        content: `✅ Inserted ${Math.max(1, count)} column${Math.max(1, count) > 1 ? 's' : ''} at ${/^[A-Za-z]$/.test(ref) ? ref.toUpperCase() : `#${colIndex + 1}`}.`,
                                        timestamp: new Date()
                                    } as ChatMessage]);
                                    setIsProcessing(false);
                                    return;
                                }
                                throw new Error('Insert column failed');
                            }
                            throw new Error('Invalid column reference');
                        }
                    }

                    // Insert row(s)
                    {
                        const m = userMessage.match(/\b(?:insert|add|create)\s*(\d+)?\s*rows?\s*(?:at|to|before|after)?\s*(?:row\s*)?(\d+)\b/i)
                            || userMessage.match(/\b(?:insert|add|create)\s*(?:a\s+)?(?:new\s+)?row\s*(\d+)\b/i);
                        if (m) {
                            const count = m[1] ? parseInt(m[1], 10) : 1;
                            const rowIndex = parseInt(m[m.length - 1], 10) - 1;
                            if (!Number.isNaN(rowIndex) && rowIndex >= 0) {
                                const rowsToInsert = Array.from({ length: Math.max(1, count) }, () => []);
                                const success = univerAdapter.insertMultipleRows(rowIndex, rowsToInsert);
                                if (success) {
                                    setMessages(prev => [...prev.filter(msg => !msg.isAnalyzing), {
                                        id: (Date.now() + 1).toString(),
                                        role: 'assistant',
                                        type: 'assistant',
                                        content: `✅ Inserted ${Math.max(1, count)} row${Math.max(1, count) > 1 ? 's' : ''} at #${rowIndex + 1}.`,
                                        timestamp: new Date()
                                    } as ChatMessage]);
                                    setIsProcessing(false);
                                    return;
                                }
                                throw new Error('Insert row failed');
                            }
                            throw new Error('Invalid row reference');
                        }
                    }

                    // Delete row(s)
                    {
                        const m = userMessage.match(/\b(?:delete|remove)\s*(?:row\s*)?(\d+)(?:\s*(?:to|through|-)?\s*(\d+))?\b/i);
                        if (m) {
                            const start = parseInt(m[1], 10) - 1;
                            const end = m[2] ? parseInt(m[2], 10) - 1 : start;
                            if (!Number.isNaN(start) && !Number.isNaN(end) && start >= 0 && end >= start) {
                                const count = end - start + 1;
                                const success = univerAdapter.deleteRow(start, count);
                                if (success) {
                                    setMessages(prev => [...prev.filter(msg => !msg.isAnalyzing), {
                                        id: (Date.now() + 1).toString(),
                                        role: 'assistant',
                                        type: 'assistant',
                                        content: `✅ Deleted row${count > 1 ? 's' : ''} ${start + 1}${count > 1 ? ` to ${end + 1}` : ''}.`,
                                        timestamp: new Date()
                                    } as ChatMessage]);
                                    setIsProcessing(false);
                                    return;
                                }
                                throw new Error('Delete row failed');
                            }
                        }
                    }

                    // Hide/Show column
                    {
                        const hide = userMessage.match(/\bhide\s+(?:the\s+)?(?:column\s*)?([A-Za-z]|\d+)\b/i);
                        const show = userMessage.match(/\b(?:show|unhide)\s+(?:the\s+)?(?:column\s*)?([A-Za-z]|\d+)\b/i);
                        const m = hide || show;
                        if (m) {
                            const ref = m[1];
                            const colIndex = /^[A-Za-z]$/.test(ref) ? (ref.toUpperCase().charCodeAt(0) - 65) : (parseInt(ref, 10) - 1);
                            if (!Number.isNaN(colIndex) && colIndex >= 0) {
                                const ok = hide ? univerAdapter.hideColumns(colIndex, colIndex) : univerAdapter.showColumns(colIndex, colIndex);
                                if (ok) {
                                    setMessages(prev => [...prev.filter(msg => !msg.isAnalyzing), {
                                        id: (Date.now() + 1).toString(),
                                        role: 'assistant',
                                        type: 'assistant',
                                        content: `${hide ? '✅ Hidden' : '✅ Shown'} column ${/^[A-Za-z]$/.test(ref) ? ref.toUpperCase() : `#${colIndex + 1}`}.`,
                                        timestamp: new Date()
                                    } as ChatMessage]);
                                    setIsProcessing(false);
                                    return;
                                }
                                throw new Error(`${hide ? 'Hide' : 'Show'} column failed`);
                            }
                        }
                    }

                    // Hide/Show row
                    {
                        const hide = userMessage.match(/\bhide\s+(?:the\s+)?(?:row\s*)?(\d+)\b/i);
                        const show = userMessage.match(/\b(?:show|unhide)\s+(?:the\s+)?(?:row\s*)?(\d+)\b/i);
                        const m = hide || show;
                        if (m) {
                            const rowIndex = parseInt(m[1], 10) - 1;
                            if (!Number.isNaN(rowIndex) && rowIndex >= 0) {
                                const ok = hide ? univerAdapter.hideRows(rowIndex, rowIndex) : univerAdapter.showRows(rowIndex, rowIndex);
                                if (ok) {
                                    setMessages(prev => [...prev.filter(msg => !msg.isAnalyzing), {
                                        id: (Date.now() + 1).toString(),
                                        role: 'assistant',
                                        type: 'assistant',
                                        content: `${hide ? '✅ Hidden' : '✅ Shown'} row #${rowIndex + 1}.`,
                                        timestamp: new Date()
                                    } as ChatMessage]);
                                    setIsProcessing(false);
                                    return;
                                }
                                throw new Error(`${hide ? 'Hide' : 'Show'} row failed`);
                            }
                        }
                    }

                    // Freeze / Unfreeze
                    if (/\bfreeze\s+(?:first\s+)?(\d+)?\s*rows?\b/i.test(userMessage)) {
                        const m = userMessage.match(/\bfreeze\s+(?:first\s+)?(\d+)?\s*rows?\b/i);
                        const n = m && m[1] ? Math.max(1, parseInt(m[1], 10)) : 1;
                        const ok = univerAdapter.freezeRows(n);
                        if (ok) {
                            setMessages(prev => [...prev.filter(msg => !msg.isAnalyzing), { role: 'assistant', content: `✅ Froze first ${n} row(s).`, timestamp: Date.now() }]);
                            setIsProcessing(false);
                            return;
                        }
                        throw new Error('Freeze rows failed');
                    }
                    if (/\bfreeze\s+(?:first\s+)?(\d+)?\s*columns?\b/i.test(userMessage)) {
                        const m = userMessage.match(/\bfreeze\s+(?:first\s+)?(\d+)?\s*columns?\b/i);
                        const n = m && m[1] ? Math.max(1, parseInt(m[1], 10)) : 1;
                        const ok = univerAdapter.freezeColumns(n);
                        if (ok) {
                            setMessages(prev => [...prev.filter(msg => !msg.isAnalyzing), { role: 'assistant', content: `✅ Froze first ${n} column(s).`, timestamp: Date.now() }]);
                            setIsProcessing(false);
                            return;
                        }
                        throw new Error('Freeze columns failed');
                    }
                    if (/\b(unfreeze|cancel\s*freeze|unfreeze\s*pane|unfreeze\s*panes)\b/i.test(userMessage)) {
                        const ok = univerAdapter.unfreeze();
                        if (ok) {
                            setMessages(prev => [...prev.filter(msg => !msg.isAnalyzing), { role: 'assistant', content: '✅ Unfroze all panes.', timestamp: Date.now() }]);
                            setIsProcessing(false);
                            return;
                        }
                        throw new Error('Unfreeze failed');
                    }

                    // Sort by column
                    {
                        const m = userMessage.match(/\b(?:sort|order|arrange)\b.*\bby\s+(?:column\s*)?([A-Za-z]|\d+)\b(?:\s+(asc|ascending|a-?z|desc|descending|z-?a))?/i);
                        if (m) {
                            const ref = m[1];
                            const ascToken = (m[2] || '').toLowerCase();
                            const ascending = ascToken ? !/desc|z-?a/.test(ascToken) : true;
                            const colIndex = /^[A-Za-z]$/.test(ref) ? (ref.toUpperCase().charCodeAt(0) - 65) : (parseInt(ref, 10) - 1);
                            const dims = univerAdapter.getSheetDimensions();
                            const lastColLetter = String.fromCharCode(65 + Math.max(0, dims.cols - 1));
                            const range = `A2:${lastColLetter}${Math.max(1, dims.rows)}`;
                            const ok = univerAdapter.sort(range, colIndex, ascending);
                            if (ok) {
                                setMessages(prev => [...prev.filter(msg => !msg.isAnalyzing), { role: 'assistant', content: `✅ Sorted by ${/^[A-Za-z]$/.test(ref) ? ref.toUpperCase() : `#${colIndex + 1}`} ${ascending ? 'A-Z' : 'Z-A'}.`, timestamp: Date.now() }]);
                                setIsProcessing(false);
                                return;
                            }
                            throw new Error('Sort failed');
                        }
                    }

                    // Filter by column value (equals/contains) — Univer-only (hide non-matching rows)
                    {
                        // Patterns: "filter column E with the value Valve", "filter column Name equals Valve", "filter Name contains Valve"
                        const eq = userMessage.match(/\bfilter\s+(?:the\s+)?(?:column\s*)?(.+?)\s+(?:with\s+the\s+value|equals?|=|is)\s+"?([^"\n]+)"?/i);
                        const contains = userMessage.match(/\bfilter\s+(?:the\s+)?(?:column\s*)?(.+?)\s+(?:contains|has)\s+"?([^"\n]+)"?/i);
                        const m = eq || contains;
                        if (m) {
                            const columnRefRaw = m[1].trim();
                            const valueRaw = m[2].trim();
                            const isContains = !!contains;

                            // Resolve column index from letter, number or header name
                            const toIndex = (ref: string, headers: any[]): number => {
                                if (/^[A-Za-z]$/.test(ref)) return ref.toUpperCase().charCodeAt(0) - 65;
                                if (/^\d+$/.test(ref)) return parseInt(ref, 10) - 1;
                                // Try header name (case-insensitive)
                                const headerText = headers.map(h => typeof h === 'object' ? (h?.v ?? h?.m ?? '') : (h ?? ''));
                                const idx = headerText.findIndex(h => String(h).toLowerCase() === ref.toLowerCase());
                                if (idx !== -1) return idx;
                                // Try partial contains
                                const idx2 = headerText.findIndex(h => String(h).toLowerCase().includes(ref.toLowerCase()));
                                return idx2;
                            };

                            const data = univerAdapter.getAllData();
                            if (!data || data.length <= 1) throw new Error('No data available to filter');
                            const headers = data[0] || [];
                            const colIndex = toIndex(columnRefRaw, headers);
                            if (colIndex === -1 || Number.isNaN(colIndex)) throw new Error('Column not found');

                            // Unhide all rows first
                            const dims = univerAdapter.getSheetDimensions();
                            if (dims.rows > 1) {
                                univerAdapter.showRows(1, dims.rows - 1);
                            }

                            // Build list of rows to hide (0-based indexing; skip header row 0)
                            const target = valueRaw.toLowerCase();
                            const rowsToHide: number[] = [];
                            for (let r = 1; r < data.length; r++) {
                                const cell = data[r]?.[colIndex];
                                const cellStr = String(cell ?? '').toLowerCase();
                                const match = isContains ? cellStr.includes(target) : cellStr === target;
                                if (!match) rowsToHide.push(r);
                            }

                            // Convert to contiguous blocks and hide
                            if (rowsToHide.length > 0) {
                                let s = rowsToHide[0];
                                let p = rowsToHide[0];
                                for (let i = 1; i < rowsToHide.length; i++) {
                                    if (rowsToHide[i] === p + 1) {
                                        p = rowsToHide[i];
                                    } else {
                                        univerAdapter.hideRows(s, p);
                                        s = p = rowsToHide[i];
                                    }
                                }
                                univerAdapter.hideRows(s, p);
                            }

                            setMessages(prev => [...prev.filter(msg => !msg.isAnalyzing), {
                                role: 'assistant',
                                content: `✅ Filtered ${/^[A-Za-z]$/.test(columnRefRaw) ? `column ${columnRefRaw.toUpperCase()}` : `'${columnRefRaw}'`} ${isContains ? 'containing' : 'equal to'} "${valueRaw}".`,
                                timestamp: Date.now()
                            }]);
                            setIsProcessing(false);
                            return;
                        }
                    }

                    // Filter open/clear (Univer-only)
                    if (/\b(open|enable|turn\s*on|apply)\s+(filters?|filter)\b/i.test(userMessage)) {
                        const dims = univerAdapter.getSheetDimensions();
                        const lastColLetter = String.fromCharCode(65 + Math.max(0, dims.cols - 1));
                        const range = `A1:${lastColLetter}${Math.max(1, dims.rows)}`;
                        const ok = univerAdapter.autoFilter(range) || univerAdapter.createFilter(range as any);
                        if (ok) {
                            setMessages(prev => [...prev.filter(msg => !msg.isAnalyzing), { role: 'assistant', content: '✅ Filter enabled.', timestamp: Date.now() }]);
                            setIsProcessing(false);
                            return;
                        }
                        throw new Error('Enable filter failed');
                    }
                    if (/\b(clear|remove|reset|turn\s*off|disable)\s+(filters?|filter)\b/i.test(userMessage)) {
                        // Always unhide all data rows (skip header row 0)
                        const dims = univerAdapter.getSheetDimensions();
                        if (dims.rows > 1) {
                            univerAdapter.showRows(1, dims.rows - 1);
                        }
                        // Attempt to remove any active filter object
                        univerAdapter.clearFilter();
                        setMessages(prev => [...prev.filter(msg => !msg.isAnalyzing), { role: 'assistant', content: '✅ Filters cleared.', timestamp: Date.now() }]);
                        setIsProcessing(false);
                        return;
                    }

                    // Merge / Unmerge cells
                    {
                        const merge = userMessage.match(/\bmerge\s+([A-Z]+\d+):([A-Z]+\d+)\b/i);
                        const unmerge = userMessage.match(/\bunmerge\s+([A-Z]+\d+):([A-Z]+\d+)\b/i);
                        const m = merge || unmerge;
                        if (m) {
                            const range = parseCellReference(`${m[1].toUpperCase()}:${m[2].toUpperCase()}`);
                            if (range) {
                                const ok = merge ?
                                    univerAdapter.mergeCells(range.startRow, range.startCol, range.numRows, range.numCols) :
                                    univerAdapter.unmergeCells(range.startRow, range.startCol, range.numRows, range.numCols);
                                if (ok) {
                                    setMessages(prev => [...prev.filter(msg => !msg.isAnalyzing), { role: 'assistant', content: merge ? '✅ Cells merged.' : '✅ Cells unmerged.', timestamp: Date.now() }]);
                                    setIsProcessing(false);
                                    return;
                                }
                                throw new Error(`${merge ? 'Merge' : 'Unmerge'} failed`);
                            }
                        }
                    }

                    // Split text to columns
                    {
                        const m = userMessage.match(/\bsplit\s+(?:text\s+)?(?:in\s+)?(?:column\s*)?([A-Za-z]|\d+)\s+(?:by|on|using)\s+(tab|space|,|;|\||:|\/|-)\b/i);
                        if (m) {
                            const ref = m[1];
                            const token = m[2].toLowerCase();
                            const delimiter = token === 'tab' ? '\\t' : token === 'space' ? ' ' : token;
                            const colIndex = /^[A-Za-z]$/.test(ref) ? (ref.toUpperCase().charCodeAt(0) - 65) : (parseInt(ref, 10) - 1);
                            const ok = univerAdapter.splitTextToColumns(colIndex, delimiter);
                            if (ok) {
                                setMessages(prev => [...prev.filter(msg => !msg.isAnalyzing), { role: 'assistant', content: `✅ Split text to columns in ${/^[A-Za-z]$/.test(ref) ? ref.toUpperCase() : `#${colIndex + 1}`}.`, timestamp: Date.now() }]);
                                setIsProcessing(false);
                                return;
                            }
                            throw new Error('Split text to columns failed');
                        }
                    }

                    // Delete column(s) - supports single, range (D-F), and list (D and E)
                    {
                        const normalized = userMessage.replace(/\s*,\s*/g, ',').replace(/\s+and\s+/gi, ',');
                        // Match patterns: delete column D, delete columns D and E, delete columns D-F
                        const single = normalized.match(/\b(?:delete|remove)\s+(?:the\s+)?(?:column\s*)?([A-Za-z]|\d+)\b/i);
                        const range = normalized.match(/\b(?:delete|remove)\s+(?:the\s+)?(?:columns?\s*)?([A-Za-z]|\d+)\s*(?:to|through|-)\s*([A-Za-z]|\d+)\b/i);
                        const list = normalized.match(/\b(?:delete|remove)\s+(?:the\s+)?columns?\s+([A-Za-z\d,]+)\b/i);
                        const toIndex = (ref: string) => (/^[A-Za-z]$/.test(ref) ? (ref.toUpperCase().charCodeAt(0) - 65) : (parseInt(ref, 10) - 1));
                        const isValid = (i: number) => !Number.isNaN(i) && i >= 0;

                        if (range) {
                            const start = toIndex(range[1]);
                            const end = toIndex(range[2]);
                            if (isValid(start) && isValid(end)) {
                                const a = Math.min(start, end);
                                const b = Math.max(start, end);
                                const count = b - a + 1;
                                const ok = univerAdapter.deleteColumn(a, count);
                                if (ok) {
                                    const label = `${String.fromCharCode(65 + a)}${count > 1 ? `-${String.fromCharCode(65 + b)}` : ''}`;
                                    setMessages(prev => [...prev.filter(msg => !msg.isAnalyzing), { role: 'assistant', content: `✅ Deleted column${count > 1 ? 's' : ''} ${label}.`, timestamp: Date.now() }]);
                                    setIsProcessing(false);
                                    return;
                                }
                                throw new Error('Delete columns (range) failed');
                            }
                        } else if (list) {
                            const parts = list[1].split(',').map(s => s.trim()).filter(Boolean);
                            const indices = Array.from(new Set(parts.map(toIndex))).sort((x, y) => x - y);
                            if (indices.every(isValid) && indices.length > 0) {
                                // Delete in descending order to keep indices stable
                                let allOk = true;
                                for (let i = indices.length - 1; i >= 0; i--) {
                                    const ok = univerAdapter.deleteColumn(indices[i], 1);
                                    if (!ok) { allOk = false; break; }
                                }
                                if (allOk) {
                                    const label = parts.map(p => (/^[A-Za-z]$/.test(p) ? p.toUpperCase() : `#${toIndex(p) + 1}`)).join(', ');
                                    setMessages(prev => [...prev.filter(msg => !msg.isAnalyzing), { role: 'assistant', content: `✅ Deleted columns ${label}.`, timestamp: Date.now() }]);
                                    setIsProcessing(false);
                                    return;
                                }
                                throw new Error('Delete columns (list) failed');
                            }
                        } else if (single) {
                            const ref = single[1];
                            const idx = toIndex(ref);
                            if (isValid(idx)) {
                                const ok = univerAdapter.deleteColumn(idx, 1);
                                if (ok) {
                                    setMessages(prev => [...prev.filter(msg => !msg.isAnalyzing), { role: 'assistant', content: `✅ Deleted column ${/^[A-Za-z]$/.test(ref) ? ref.toUpperCase() : `#${idx + 1}`}.`, timestamp: Date.now() }]);
                                    setIsProcessing(false);
                                    return;
                                }
                                throw new Error('Delete column failed');
                            }
                        }
                    }

                    // Bold - wide pattern net
                    if (/(?:can you |please |could you |make |set )?(?:make\s+)?(?:cells?\s+)?(?:[A-Z]+\d+(?::[A-Z]+\d+)?\s+)?bold/i.test(userMessage)) {
                        console.log('🔤 Detected: Bold');
                        const cellRef = extractCellReference(userMessage);
                        const range = getRange(cellRef);
                        const success = univerAdapter.setFontWeight(range.startRow, range.startCol, range.numRows, range.numCols, 'bold');
                        if (success) {
                            setMessages(prev => [...prev.filter(msg => !msg.isAnalyzing), {
                                role: 'assistant',
                                content: '✅ Bold applied successfully.',
                                timestamp: Date.now()
                            }]);
                            setIsProcessing(false);
                            return;
                        }
                        throw new Error('Bold formatting failed');
                    }

                    // Italic - wide pattern net
                    if (/(?:can you |please |could you |make |set )?(?:make\s+)?(?:cells?\s+)?(?:[A-Z]+\d+(?::[A-Z]+\d+)?\s+)?italic/i.test(userMessage)) {
                        console.log('🔤 Detected: Italic');
                        const cellRef = extractCellReference(userMessage);
                        const range = getRange(cellRef);
                        const success = univerAdapter.setFontStyle(range.startRow, range.startCol, range.numRows, range.numCols, 'italic');
                        if (success) {
                            setMessages(prev => [...prev.filter(msg => !msg.isAnalyzing), {
                                role: 'assistant',
                                content: '✅ Italic applied successfully.',
                                timestamp: Date.now()
                            }]);
                            setIsProcessing(false);
                            return;
                        }
                        throw new Error('Italic formatting failed');
                    }

                    // Underline - wide pattern net
                    if (/(?:can you |please |could you |make |set )?(?:make\s+)?(?:cells?\s+)?(?:[A-Z]+\d+(?::[A-Z]+\d+)?\s+)?underline/i.test(userMessage)) {
                        console.log('🔤 Detected: Underline');
                        const cellRef = extractCellReference(userMessage);
                        const range = getRange(cellRef);
                        const success = univerAdapter.setFontLine(range.startRow, range.startCol, range.numRows, range.numCols, 'underline');
                        if (success) {
                            setMessages(prev => [...prev.filter(msg => !msg.isAnalyzing), {
                                role: 'assistant',
                                content: '✅ Underline applied successfully.',
                                timestamp: Date.now()
                            }]);
                            setIsProcessing(false);
                            return;
                        }
                        throw new Error('Underline formatting failed');
                    }

                    // Background/Highlight color - wide pattern net
                    if (/(?:can you |please |could you |make |set )?(?:highlight|background|bg)(?:\s+(?:cells?\s+)?(?:[A-Z]+\d+(?::[A-Z]+\d+)?\s+)?)?(?:to\s+)?(?:color\s+)?(\w+)?/i.test(userMessage)) {
                        console.log('🎨 Detected: Background color');
                        const color = extractColor(userMessage);
                        if (!color) {
                            throw new Error('No color specified. Try: "highlight red" or "make A2 background yellow"');
                        }
                        const cellRef = extractCellReference(userMessage);
                        const range = getRange(cellRef);
                        const success = univerAdapter.setBackgroundColor(range.startRow, range.startCol, range.numRows, range.numCols, color);
                        if (success) {
                            setMessages(prev => [...prev.filter(msg => !msg.isAnalyzing), {
                                role: 'assistant',
                                content: '✅ Background color applied successfully.',
                                timestamp: Date.now()
                            }]);
                            setIsProcessing(false);
                            return;
                        }
                        throw new Error('Background color failed');
                    }

                    // Font color - wide pattern net
                    if (/(?:can you |please |could you |make |set )?(?:font\s+)?(?:text\s+)?color(?:\s+(?:cells?\s+)?(?:[A-Z]+\d+(?::[A-Z]+\d+)?\s+)?)?(?:to\s+)?(\w+)?/i.test(userMessage) && !/background|highlight|bg/i.test(userMessage)) {
                        console.log('🎨 Detected: Font color');
                        const color = extractColor(userMessage);
                        if (!color) {
                            throw new Error('No color specified. Try: "font color red" or "make text blue"');
                        }
                        const cellRef = extractCellReference(userMessage);
                        const range = getRange(cellRef);
                        const success = univerAdapter.setFontColor(range.startRow, range.startCol, range.numRows, range.numCols, color);
                        if (success) {
                            setMessages(prev => [...prev.filter(msg => !msg.isAnalyzing), {
                                role: 'assistant',
                                content: '✅ Font color applied successfully.',
                                timestamp: Date.now()
                            }]);
                            setIsProcessing(false);
                            return;
                        }
                        throw new Error('Font color failed');
                    }

                    // If no pattern matched, fall through to backend
                    console.log('🔄 No simple command matched, falling through to backend...');

                    } catch (error) {
                        console.error('❌ Simple command execution failed:', error);
                        setMessages(prev => {
                            const newMessages = prev.filter(msg => !msg.isAnalyzing);
                            return [...newMessages, {
                                role: 'assistant',
                                content: `❌ Failed to execute command: ${error instanceof Error ? error.message : 'Unknown error'}`,
                                timestamp: Date.now()
                            }];
                        });
                        setIsProcessing(false);
                        return;
                    }
                }

            // Learn mode: route directly to learn API - let AI tutor handle conversation flow naturally
            if (mode === 'learn') {
                console.log('📚 Learn mode detected — sending to learn API with sheet context');
                try {
                    // No intent detection needed - AI tutor will handle conversation flow intelligently

                    const headers = data && data.length > 0 ? Object.keys(data[0]) : [];
                    const columnMap: Record<string, string> = {};
                    headers.forEach((h, idx) => {
                        // A1 letters
                        let result = '';
                        let i = idx;
                        while (i >= 0) {
                            result = String.fromCharCode((i % 26) + 65) + result;
                            i = Math.floor(i / 26) - 1;
                        }
                        columnMap[h] = result;
                    });

                    // Use LearnModeContext for proper conversation history
                    let learnRes;
                    if (learnContext && learnContext.askTutor) {
                        const sheetContext = {
                            data: data,
                            headers,
                            columnMap,
                            currentSelection: currentSelection
                        };
                        learnRes = await learnContext.askTutor(userMessage, sheetContext);
                    } else {
                        // Fallback with conversation history
                        learnRes = await sendLearnQuery({
                            question: userMessage,
                            workspaceId: currentWorkspace?.id || 'default',
                            isFirstMessage: messages.length === 1,
                            sheetContext: {
                                data: data,
                                headers,
                                columnMap,
                                currentSelection: currentSelection
                            },
                            conversationHistory: messages.map(msg => ({
                                role: msg.role || (msg.type === 'user' ? 'user' : 'assistant'),
                                content: msg.content,
                                timestamp: msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now()
                            }))
                        });
                    }

                    setMessages(prev => {
                        const newMessages = prev.filter(msg => !msg.isAnalyzing);
                        const updatedMessages = [...newMessages, {
                            id: (Date.now() + 1).toString(),
                            role: 'assistant' as const,
                            type: 'assistant' as const,
                            content: (learnRes as any)?.response || (learnRes as any)?.data?.response || 'Ready to help you learn.',
                            isLearn: true,
                            timestamp: new Date()
                        } as ChatMessage];
                        saveChatMessagesToActiveChat(updatedMessages);
                        return updatedMessages;
                    });
                    return;
                } catch (err) {
                    console.error('❌ Learn API call failed, falling back to message:', err);
                    setMessages(prev => {
                        const newMessages = prev.filter(msg => !msg.isAnalyzing);
                        return [...newMessages, { role: 'assistant', content: 'Sorry, I had trouble accessing the learn assistant. Please try again.' }];
                    });
                    return;
                } finally {
                    setIsProcessing(false);
                }
            }

            console.log('🎯 === ABOUT TO CALL UNIFIED SYSTEM ===');
            console.log('📝 User message for unified system:', userMessage);
            console.log('🔑 API key available:', !!process.env.NEXT_PUBLIC_GROQ_API_KEY);
            
            // 🎯 DIRECT CLASSIFICATION (Ambiguity detection removed)
            console.log('🎯 === DIRECT CLASSIFICATION ===');
            let classification: CommandClassification | null = null;
            let response: any | null = null;
            const newFeatureIntents: Array<CommandClassification['intent']> = [];
            
            // Use LLM classifier directly
            try {
                classification = await llmCommandClassifier.classifyCommand(userMessage);
                console.log('🎯 Classification result:', classification);
                console.log('🧠 [DEBUG] LLM Classification Details:', {
                    intent: classification?.intent,
                    action: classification?.action,
                    confidence: classification?.confidence,
                    parameters: classification?.parameters,
                    target: classification?.target
                });

                // CHECK FOR NEW FEATURE INTENTS FIRST - Route to frontend handlers
                if (classification && classification.confidence >= 0.8) {
                    if (newFeatureIntents.includes(classification.intent)) {
                        console.log('✅ High confidence new feature detected, routing to frontend handler');
                        console.log('🔍 Intent:', classification.intent, 'Action:', classification.action);
                        await processClassificationResult(classification, userMessage);
                        return; // Exit early - don't call Universal Router
                    }

                    // SPECIAL CASE: Intelligent Analysis
                    // Intercept BEFORE Universal Query Router to ensure proper analysis routing
                    if (classification.intent === 'intelligent_analysis' &&
                        classification.confidence >= 0.8) {
                        console.log('🧠 LLM detected intelligent_analysis - routing to analysis handler');
                        console.log('🔍 Intent:', classification.intent, 'Action:', classification.action);
                        await handleIntelligentAnalysis(classification);
                        return; // Exit early - don't call Universal Router or backend
                    }

                    // SPECIAL CASE: Smart Formatting
                    // Intercept BEFORE Universal Query Router for auto-formatting
                    if (classification.intent === 'smart_format' && classification.confidence >= 0.8) {
                        console.log('🔍 Template:', classification.parameters?.template || 'professional');
                        setIsProcessing(true);
                        await handleSmartFormat(classification);
                        return; // Exit early - don't call Universal Router or backend
                    }

                    // SPECIAL CASE: Quick Data Entry
                    // Intercept BEFORE Universal Query Router for data entry operations
                    if (classification.intent === 'data_entry' && classification.confidence >= 0.8) {
                        console.log('🔍 Action:', classification.action);
                        console.log('🔍 Parameters:', classification.parameters);
                        setIsProcessing(true);
                        await handleQuickDataEntry(classification);
                        return; // Exit early - don't call Universal Router or backend
                    }

                    // SPECIAL CASE: Remove Duplicates (data_modification intent)
                    // Intercept BEFORE Universal Query Router to ensure frontend handling
                    if (classification.intent === 'data_modification' &&
                        classification.action === 'remove_duplicates' &&
                        classification.confidence >= 0.8) {
                        console.log('🧹 LLM detected remove_duplicates - routing to duplicates handler');
                        console.log('🔍 Intent:', classification.intent, 'Action:', classification.action);
                        await handleRemoveDuplicates(classification, userMessage);
                        return; // Exit early - don't call Universal Router or backend
                    }

                    // SPECIAL CASE: Find & Replace
                    // Intercept BEFORE Universal Query Router to ensure frontend handling
                    if (classification.intent === 'data_modification' &&
                        classification.action === 'find_and_replace' &&
                        classification.confidence >= 0.8) {
                        console.log('🔍 LLM detected find_and_replace - routing to find/replace handler');
                        console.log('🔍 Intent:', classification.intent, 'Action:', classification.action);
                        await handleFindReplace(classification, userMessage);
                        return; // Exit early - don't call Universal Router or backend
                    }
                }
            } catch (error) {
                console.warn('⚠️ LLM classification failed, proceeding with fallback patterns:', error);
            }

            // Only reach Universal Router if NOT a new feature intent
            // 🧠 NEW: UNIVERSAL QUERY ROUTING SYSTEM
            console.log('🧠 === USING UNIVERSAL QUERY ROUTER ===');
            
            const routingDecision = await routeQueryUniversally(userMessage);
            
            console.log('🧠 Universal routing decision:', {
                query: userMessage.slice(0, 50) + '...',
                queryType: routingDecision.queryType,
                processorType: routingDecision.processorType,
                confidence: routingDecision.confidence,
                reasoning: routingDecision.reasoning
            });
            
            // Route based on Universal Query Router decision
            if (routingDecision.processorType === ProcessorType.DIRECT_BACKEND) {
                console.log('🎯 DIRECT BACKEND ROUTE: Sending directly to AgentServices');
                console.log(`📊 Query Type: ${routingDecision.queryType} (e.g., comparative analysis, statistical analysis)`);
                
                // YOUR CASE: "Compare average playtime..." goes here directly!
                const result = await sendQuery(userMessage, activeChat?.id || 'default', { 
                    isVoice: false, 
                    mode: queryMode 
                });
                
                console.log('✅ Direct backend result:', result);
                
                // Process result same as before
                setMessages(prev => {
                    const newMessages = prev.filter(msg => !msg.isAnalyzing);
                    const updatedMessages = [...newMessages, {
                        id: (Date.now() + 1).toString(),
                        role: 'assistant' as const,
                        type: 'assistant' as const,
                        content: result.response || (result as any).message || 'Analysis completed',
                        visualization: result.visualization,
                        isDirectBackend: true,
                        routingDecision: routingDecision,
                        timestamp: Date.now()
                    } as ChatMessage];
                    saveChatMessagesToActiveChat(updatedMessages);
                    return updatedMessages;
                });
                
                // Handle visualization if present
                if (result.visualization) {
                    console.log('📊 Visualization generated from direct backend route');
                }
                
                return; // Done - no need for orchestration!
                
            } else if (routingDecision.processorType === ProcessorType.DIRECT_FRONTEND) {
                console.log('🖥️ DIRECT FRONTEND ROUTE: Checking if handled by LLM classification');
                console.log('🖥️ [DEBUG] Current classification at DIRECT_FRONTEND:', classification);

                // Check if this operation is handled by our new LLM classification system
                const hasClassification = !!classification;
                const confidenceCheck = ((classification as any)?.confidence ?? 0) >= 0.8;
                const whitelist = ['freeze_operation', 'range_operation', 'row_operation', 'column_operation', 'table_operation'];
                const inWhitelist = whitelist.includes((classification as any)?.intent || '');
                const isHandledByLLM = hasClassification && confidenceCheck && inWhitelist;

                console.log('🔍 [DEBUG] Whitelist Check Breakdown:', {
                    hasClassification,
                    intent: classification?.intent,
                    confidence: classification?.confidence,
                    confidenceCheck,
                    whitelist,
                    inWhitelist,
                    isHandledByLLM
                });

                if (isHandledByLLM) {
                    console.log(`✅ [DEBUG] Operation "${(classification as any)?.intent}" PASSED whitelist - will reach switch statement`);
                    // Let it fall through to the LLM switch statement below
                } else {
                    // ⚠️ DEPRECATED: Old spreadsheet processor fallback disabled
                    console.error('❌ [DEBUG] Whitelist check FAILED - entering error block');
                    console.error('❌ [DEBUG] Failure reason:', {
                        hasClassification: !hasClassification ? 'FAIL: No classification' : 'PASS',
                        confidenceCheck: !confidenceCheck ? `FAIL: ${classification?.confidence} < 0.8` : 'PASS',
                        inWhitelist: !inWhitelist ? `FAIL: ${classification?.intent} not in whitelist` : 'PASS'
                    });
                    console.warn('⚠️ Old spreadsheet processor fallback called - classification may have failed');
                    console.warn('⚠️ Classification:', classification);

                    setMessages(prev => {
                        const newMessages = prev.filter(msg => !msg.isAnalyzing);
                        const updatedMessages = [...newMessages, {
                            id: (Date.now() + 1).toString(),
                            role: 'assistant',
                            type: 'assistant',
                            content: '⚠️ Unable to process spreadsheet command. Please try again or rephrase your request.',
                            isDirectFrontend: true,
                            routingDecision: routingDecision,
                            timestamp: Date.now()
                        } as ChatMessage];
                        saveChatMessagesToActiveChat(updatedMessages);
                        return updatedMessages;
                    });
                    setIsProcessing(false);
                    return;

                    // ALL CODE BELOW IS UNREACHABLE - Old commandService fallback (~35 lines removed)
                    /* REMOVED: commandService.processSpreadsheetCommand() fallback */
                }
                
            } else if (routingDecision.processorType === ProcessorType.ORCHESTRATED) {
                console.log('🎭 ORCHESTRATED ROUTE: True compound query detected');
                
            } else if (routingDecision.processorType === ProcessorType.FALLBACK_LEGACY) {
                console.log('🔄 LEGACY FALLBACK ROUTE: Using existing system routing');
                
                // Use existing compound query detection as fallback
                const isCompoundQuery = await detectCompoundQuery(userMessage);
                
                if (isCompoundQuery) {
                    console.log('🎭 Legacy: Compound query detected - using orchestrator');
                }
            }
            
            // Continue with orchestration logic (either from ORCHESTRATED route or legacy fallback)
            if (routingDecision.processorType === ProcessorType.ORCHESTRATED || 
                (routingDecision.processorType === ProcessorType.FALLBACK_LEGACY && await detectCompoundQuery(userMessage))) {
                
                try {
                    const orchestrationResult = await handleCompoundQuery(userMessage, currentWorkspace?.id || 'default');
                    
                    if (orchestrationResult.success) {
                        // Process orchestration success with detailed feedback
                        const detailedMessage = orchestrationResult.detailed_message || 
                                              orchestrationResult.message || 
                                              'Multi-step operation completed successfully';
                        
                        setMessages(prev => {
                            const newMessages = prev.filter(msg => !msg.isAnalyzing);
                            const updatedMessages = [...newMessages, {
                                id: (Date.now() + 1).toString(),
                                role: 'assistant' as const,
                                type: 'assistant' as const,
                                content: detailedMessage,
                                orchestrationResult: orchestrationResult,
                                isCompoundResult: true,
                                commandsExecuted: orchestrationResult.commands_executed || 0,
                                commandsFailed: orchestrationResult.commands_failed || 0
                            } as ChatMessage];
                            saveChatMessagesToActiveChat(updatedMessages);
                            return updatedMessages;
                        });
                        
                        setIsProcessing(false);
                        return; // Exit after successful orchestration
                    } else {
                        console.warn('⚠️ Orchestration failed, falling back to regular processing:', orchestrationResult.error);
                        // Continue with regular processing as fallback
                    }
                } catch (error) {
                    console.error('❌ Orchestration error:', error);
                    // Continue with regular processing as fallback
                }
            } else {
                // 🎯 NEW: Non-orchestrated queries (should be direct backend for analytics)
                console.log('🎯 NON-ORCHESTRATED QUERY: Processing as simple query');
                console.log(`📊 Router suggested: ${routingDecision.processorType} for ${routingDecision.queryType}`);
                
                if (routingDecision.processorType === ProcessorType.FALLBACK_LEGACY) {
                    // Use existing processing logic for unknown queries
                    console.log('🔄 Using legacy fallback processing');
                    // The existing logic below will handle this
                }
                // Note: Other processor types (like DIRECT_FRONTEND) will be handled by high-confidence classification below
            }

            // If we got a high-confidence classification, route accordingly
            if (classification && classification.confidence >= 0.8) {
                // Handle unified system routing by mapped intent
                const mappedIntent = (classification as any)?.intent;
                if (mappedIntent === 'backend') {
                    console.log('🚀 Unified system routing to BACKEND');
                    response = await sendQuery(userMessage, activeChat?.id || 'default', { isVoice: false, mode: queryMode });
                    
                    // Handle data updates if present
                    if (response.data_updated && response.updated_data?.data) {
                        const dataUpdateEvent = new CustomEvent('dataUpdate', { 
                            detail: { data: response.updated_data.data } 
                        });
                        window.dispatchEvent(dataUpdateEvent);
                        console.log('📊 DataUpdate event dispatched from unified backend routing');
                    }
                    
                    // Process and display response
                    setMessages(prev => {
                        const newMessages = prev.filter(msg => !msg.isAnalyzing);
                        const updatedMessages = [...newMessages, {
                            id: (Date.now() + 1).toString(),
                            role: 'assistant' as const,
                            type: 'assistant' as const,
                            content: response.response || 'Analysis completed',
                            visualization: response.visualization,
                            analysisError: response.success === false ? 'Analysis failed' : undefined
                        } as ChatMessage];
                        saveChatMessagesToActiveChat(updatedMessages);
                        return updatedMessages;
                    });
                    
                    setIsProcessing(false);
                    return; // Exit after successful unified backend routing
                }
                
                if (mappedIntent === 'frontend') {
                    console.log('🚀 Unified system routing to FRONTEND');
                    // Handle frontend operations (spreadsheet manipulation)
                    // For now, fall through to existing frontend logic
                }
                
                // Handle specific intent cases for backward compatibility
                switch ((classification as any).intent) {
                    case 'conditional_format':
                        // Handle conditional formatting through LLM guidance
                        console.log('🎨 LLM-guided conditional formatting:', classification.action);
                            const success = await handleLLMConditionalFormatting(classification);
                            if (success) {
                                return; // Exit early after successful LLM handling
                        }
                        // Fall through to existing patterns for other conditional formatting
                        break;

                    case 'data_modification':
                        // Check if it's remove_duplicates action - handle in frontend
                        if (classification.action === 'remove_duplicates') {
                            console.log('🗑️ LLM detected remove_duplicates - handling in frontend');
                            await handleRemoveDuplicates(classification, userMessage);
                            return; // Don't route to backend
                        }

                        // For other data modifications, route to backend
                        console.log('🗑️ LLM detected data modification - routing to backend');
                        response = await sendQuery(userMessage, activeChat?.id || 'default', { isVoice: false, mode: queryMode });
                        
                        // Handle data updates immediately (since main dataUpdate dispatch isn't reached)
                        console.log('🔍 === DATA_MODIFICATION DATAUPDATE DISPATCH DEBUG ===');
                        console.log('🔍 Response object keys:', Object.keys(response || {}));
                        console.log('🔍 response.data_updated:', response.data_updated, typeof response.data_updated);
                        console.log('🔍 response.updated_data:', !!response.updated_data, typeof response.updated_data);
                        
                        if (response.data_updated && response.updated_data) {
                            console.log('✅ First condition passed: response.data_updated && response.updated_data');
                            console.log('🔍 response.updated_data keys:', Object.keys(response.updated_data || {}));
                            console.log('🔍 response.updated_data.data:', !!response.updated_data.data, typeof response.updated_data.data);
                            console.log('🔍 Array.isArray(response.updated_data.data):', Array.isArray(response.updated_data.data));
                            
                            if (response.updated_data.data && Array.isArray(response.updated_data.data)) {
                                console.log('✅ Second condition passed: response.updated_data.data && Array.isArray');
                                const newData = response.updated_data.data;
                                console.log('🔍 newData.length:', newData.length);
                                console.log('🔍 newData sample:', newData.slice(0, 2));
                                
                                if (newData.length > 0) {
                                    console.log('✅ Third condition passed: newData.length > 0');
                                    console.log('🚀 SUCCESS: Dispatching dataUpdate event with', newData.length, 'rows');
                                    
                                    const dataUpdateEvent = new CustomEvent('dataUpdate', { 
                                        detail: { data: newData } 
                                    });
                                    window.dispatchEvent(dataUpdateEvent);
                                    console.log('📊 DataUpdate event dispatched successfully from data_modification case!');
                                } else {
                                    console.log('❌ Third condition FAILED: newData.length is 0');
                                }
                            } else {
                                console.log('❌ Second condition FAILED: response.updated_data.data missing or not array');
                            }
                        } else {
                            console.log('❌ First condition FAILED: Missing data_updated or updated_data');
                            if (!response.data_updated) {
                                console.log('❌ response.data_updated is falsy:', response.data_updated);
                            }
                            if (!response.updated_data) {
                                console.log('❌ response.updated_data is falsy:', response.updated_data);
                            }
                        }
                        break;
                    
                    case 'filter':
                        console.log('🔍 LLM detected filtering - analyzing action:', classification.action);
                        try {
                            // Handle value-based filtering with row hiding
                            if (classification.action === 'filter_value_based') {
                                console.log('🎯 Processing value-based filter with row hiding');
                                if (typeof window !== 'undefined' && (window as any).luckysheet?.getSheetData && (window as any).luckysheet?.hideRow) {
                                    const sheetData = (window as any).luckysheet.getSheetData();
                                    if (sheetData && sheetData.length > 1) {
                                        const headers = sheetData[0] || [];
                                        const rawFilterColumn = classification.parameters?.column;
                                        const filterColumn: string = typeof rawFilterColumn === 'string' ? rawFilterColumn : '';
                                        const filterValue = typeof classification.parameters?.value === 'string'
                                            ? classification.parameters.value
                                            : `${classification.parameters?.value ?? ''}`;
                                        const comparison = typeof classification.parameters?.comparison === 'string'
                                            ? classification.parameters.comparison
                                            : 'equals';
                                        
                                        // Helper function to extract text from cells
                                        const extractCellText = (cell: any): string => {
                                            if (!cell) return '';
                                            if (typeof cell === 'string') return cell;
                                            if (typeof cell === 'object') {
                                                return cell.m || cell.v || '';
                                            }
                                            return String(cell);
                                        };
                                        
                                        console.log('🔍 Filter parameters:', { filterColumn, filterValue, comparison });
                                        console.log('🔍 Headers available:', headers.map((h, i) => `${i}: ${extractCellText(h)}`));
                                        
                                        // Find column index by name (case-insensitive)
                                        let columnIndex = -1;
                                        
                                        const filterColumnLower = filterColumn.toLowerCase();
                                        for (let i = 0; i < headers.length; i++) {
                                            const headerText = extractCellText(headers[i]).toLowerCase();
                                            if (headerText === filterColumnLower || headerText.includes(filterColumnLower)) {
                                                columnIndex = i;
                                                break;
                                            }
                                        }
                                        
                                        if (columnIndex === -1) {
                                            // Try to find by column letter (A, B, C, etc.)
                                            const colLetter = filterColumn.toUpperCase();
                                            if (colLetter.match(/^[A-Z]$/)) {
                                                columnIndex = colLetter.charCodeAt(0) - 65;
                                                console.log(`🔤 Column letter "${colLetter}" converted to index ${columnIndex}`);
                                            }
                                        }
                                        
                                        if (columnIndex >= 0 && columnIndex < headers.length) {
                                            const columnName = extractCellText(headers[columnIndex]);
                                            console.log(`✅ Found column "${columnName}" at index ${columnIndex}`);
                                            
                                            // Analyze rows and collect those that don't match
                                            const rowsToHide: number[] = [];
                                            let matchCount = 0;
                                            
                                            for (let rowIndex = 1; rowIndex < sheetData.length; rowIndex++) {
                                                const row = sheetData[rowIndex] || [];
                                                const cellValue = extractCellText(row[columnIndex]).toLowerCase();
                                                const searchValue = filterValue.toLowerCase();
                                                
                                                let matches = false;
                                                if (comparison === 'equals') {
                                                    matches = cellValue === searchValue;
                                                } else if (comparison === 'contains') {
                                                    matches = cellValue.includes(searchValue);
                                                } else {
                                                    // Default to equals
                                                    matches = cellValue === searchValue;
                                                }
                                                
                                                if (matches) {
                                                    matchCount++;
                                                } else {
                                                    rowsToHide.push(rowIndex);
                                                }
                                            }
                                            
                                            console.log(`🔍 Analysis: ${matchCount} rows match, ${rowsToHide.length} rows to hide`);
                                            
                                            // Group consecutive rows for efficient hiding
                                            const groupConsecutive = (indices: number[]): Array<{start: number, end: number}> => {
                                                if (indices.length === 0) return [];
                                                
                                                indices.sort((a, b) => a - b);
                                                const ranges: Array<{ start: number; end: number }> = [];
                                                let start = indices[0];
                                                let end = indices[0];
                                                
                                                for (let i = 1; i < indices.length; i++) {
                                                    if (indices[i] === end + 1) {
                                                        end = indices[i];
                                                    } else {
                                                        ranges.push({ start, end });
                                                        start = indices[i];
                                                        end = indices[i];
                                                    }
                                                }
                                                ranges.push({ start, end });
                                                return ranges;
                                            };
                                            
                                            const rowRanges = groupConsecutive(rowsToHide);
                                            console.log(`🎯 Hiding ${rowRanges.length} row range(s):`, rowRanges);
                                            
                                            // Hide non-matching rows
                                            for (const range of rowRanges) {
                                                (window as any).luckysheet.hideRow(range.start, range.end);
                                            }
                                            
                                            setMessages(prev => {
                                                const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                                const updatedMessages = [...newMessages, { 
                                                    id: (Date.now() + 1).toString(),
                                                    role: 'assistant', 
                                                    type: 'assistant',
                                                    content: `✅ Filtered ${rowsToHide.length} rows, showing ${matchCount} where ${columnName} ${comparison === 'contains' ? 'contains' : 'equals'} "${filterValue}"`, 
                                                    isTyping: true,
                                                    timestamp: new Date()
                                                } as ChatMessage];
                                                saveChatMessagesToActiveChat(updatedMessages);
                                                return updatedMessages;
                                            });
                                            
                                        } else {
                                            setMessages(prev => {
                                                const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                                const availableColumns = headers.map((h, i) => extractCellText(h) || `Column ${i+1}`).join(', ');
                                                const updatedMessages = [...newMessages, { 
                                                    id: (Date.now() + 1).toString(),
                                                    role: 'assistant', 
                                                    type: 'assistant',
                                                    content: `❌ Column "${filterColumn}" not found. Available columns: ${availableColumns}`, 
                                                    isTyping: true,
                                                    timestamp: new Date()
                                                } as ChatMessage];
                                                saveChatMessagesToActiveChat(updatedMessages);
                                                return updatedMessages;
                                            });
                                        }
                                    }
                                }
                                setIsProcessing(false);
                                return; // Exit early
                            }
                            
                            // Handle clear filters
                            if (classification.action === 'clear_filters') {
                                console.log('🧹 Clearing all filters by showing all rows');
                                if (typeof window !== 'undefined' && (window as any).luckysheet?.showRow) {
                                    // Show all rows (using a large range to cover all possible rows)
                                    (window as any).luckysheet.showRow(0, 9999);
                                    
                                    setMessages(prev => {
                                        const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                        const updatedMessages = [...newMessages, { 
                                            id: (Date.now() + 1).toString(),
                                            role: 'assistant', 
                                            type: 'assistant',
                                            content: `✅ Cleared filters, showing all rows`, 
                                            isTyping: true,
                                            timestamp: new Date()
                                        } as ChatMessage];
                                        saveChatMessagesToActiveChat(updatedMessages);
                                        return updatedMessages;
                                    });
                                }
                                setIsProcessing(false);
                                return; // Exit early
                            }
                            
                            // Fallback to existing dropdown filter logic
                            console.log('🔍 Falling back to dropdown filter logic');
                            const filterAction = (classification.parameters?.action || (/(open|enable|turn on|put on)/i.test(userMessage) ? 'open' : /(close|clear|remove|reset|turn off|disable|get rid of)/i.test(userMessage) ? 'close' : 'open')) as 'open' | 'close';
                            const doLocalOpenClose = async () => {
                                if (typeof window !== 'undefined' && (window as any).luckysheet?.getSheetData && (window as any).luckysheet?.setRangeFilter) {
                                    const sheetData = (window as any).luckysheet.getSheetData();
                                    if (sheetData && sheetData.length > 0) {
                                        // Detect used range
                                        const cellHasValue = (cell: any): boolean => {
                                            if (cell === null || cell === undefined) return false;
                                            if (typeof cell === 'object') {
                                                const m = (cell as any).m; const v = (cell as any).v;
                                                if (m !== undefined && m !== null && String(m).trim() !== '') return true;
                                                if (v !== undefined && v !== null) {
                                                    if (typeof v === 'object') {
                                                        const nm = (v as any).m; const nv = (v as any).v;
                                                        if (nm !== undefined && nm !== null && String(nm).trim() !== '') return true;
                                                        if (nv !== undefined && nv !== null && String(nv).trim() !== '') return true;
                                                        return String(v).trim() !== '';
                                                    }
                                                    return String(v).trim() !== '';
                                                }
                                                return false;
                                            }
                                            return String(cell).trim() !== '';
                                        };
                                        let lastUsedCol = 0;
                                        for (let r = 0; r < sheetData.length; r++) {
                                            const row = sheetData[r] || [];
                                            for (let c = row.length - 1; c >= 0; c--) {
                                                if (cellHasValue(row[c])) { lastUsedCol = Math.max(lastUsedCol, c); break; }
                                            }
                                        }
                                        let lastUsedRow = 1;
                                        for (let r = sheetData.length - 1; r >= 1; r--) {
                                            const row = sheetData[r] || [];
                                            let has = false;
                                            for (let c = 0; c <= lastUsedCol; c++) { if (cellHasValue(row[c])) { has = true; break; } }
                                            if (has) { lastUsedRow = r; break; }
                                        }
                                        const lastColLetter = String.fromCharCode(65 + lastUsedCol);
                                        const range = `A1:${lastColLetter}${lastUsedRow + 1}`; // include header row
                                        (window as any).luckysheet.setRangeFilter(filterAction, { range, order: 0 });
                                        setMessages(prev => {
                                            const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                            return [...newMessages, { role: 'assistant', content: filterAction === 'open' ? `✅ Filter enabled` : `✅ Filters cleared`, isTyping: true }];
                                        });
                                        if (saveChatMessagesToActiveChat) {
                                            saveChatMessagesToActiveChat([]);
                                        }
                                        setIsProcessing(false);
                                        return true;
                                    }
                                }
                                return false;
                            };

                            // Prefer local open/close for filters to avoid backend coupling
                            const localDone = await doLocalOpenClose();
                            if (localDone) return;

                            // Remove deprecated backend fallback; guide user if local path unavailable
                            setMessages(prev => {
                                const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                return [...newMessages, { role: 'assistant', content: `⚠️ Spreadsheet not ready for filter operation. Click the sheet to activate it and try again.`, isTyping: true }];
                            });
                            setIsProcessing(false);
                            return;
                        } catch {
                            console.error('❌ LLM filter execution failed:', e);
                            // Ultimate fallback for clear filters
                            if (/(close|clear|remove|reset|turn off|disable|get rid of)/i.test(userMessage) && typeof window !== 'undefined') {
                                try {
                                    if ((window as any).luckysheet?.setRangeFilter) {
                                        (window as any).luckysheet.setRangeFilter('close', {});
                                        setMessages(prev => {
                                            const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                            return [...newMessages, { role: 'assistant', content: `✅ Filters cleared`, isTyping: true }];
                                        });
                                        if (saveChatMessagesToActiveChat) { saveChatMessagesToActiveChat([]); }
                                        setIsProcessing(false);
                                        return;
                                    }
                                } catch {}
                            }
                        }
                        break;
                    
                    case 'sort':
                        console.log('🔃 LLM detected sorting - executing sort');
                        try {
                            if (typeof window !== 'undefined' && (window as any).luckysheet?.getSheetData) {
                                const sheetData = (window as any).luckysheet.getSheetData();
                                if (sheetData && sheetData.length > 1) {
                                    const headers = (sheetData[0] || []).map((h: any, i: number) => typeof h === 'object' ? (h?.v ?? h?.m ?? `Column ${i + 1}`) : (h ?? `Column ${i + 1}`));
                                    const colIdentRaw = (classification.target?.identifier || '').toString();
                                    const dirRaw = (classification.parameters?.direction || 'asc').toString().toLowerCase();
                                    const dir = /desc|z-?a|down|decreasing/.test(dirRaw) ? 'des' : 'asc';
                                    
                                    const findColIndexByName = (nameRaw: string): number => {
                                        const name = nameRaw.trim().toLowerCase();
                                        for (let i = 0; i < headers.length; i++) {
                                            const h = (headers[i] || '').toString().trim().toLowerCase();
                                            if (h === name) return i;
                                            if (h.replace(/[^a-z0-9]/g, '') === name.replace(/[^a-z0-9]/g, '')) return i;
                                            if (h.includes(name) || name.includes(h)) return i;
                                        }
                                        return -1;
                                    };
                                    let colIndex = -1;
                                    if (/^[A-Za-z]$/.test(colIdentRaw)) {
                                        colIndex = colIdentRaw.toUpperCase().charCodeAt(0) - 65;
                                    } else {
                                        colIndex = findColIndexByName(colIdentRaw);
                                    }
                                    if (colIndex >= 0) {
                                        const lastRow1Based = sheetData.length;
                                        const lastColIndex = Math.max(0, headers.length - 1);
                                        const lastColLetter = String.fromCharCode(65 + lastColIndex);
                                        const range = `A2:${lastColLetter}${lastRow1Based}`;
                                        (window as any).luckysheet.setRangeShow?.(range);
                                        (window as any).luckysheet.setRangeSortMulti?.(false, [{ i: colIndex, sort: dir }]);
                                        setMessages(prev => {
                                            const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                            return [...newMessages, { role: 'assistant', content: `✅ Sorted by ${/^[A-Za-z]$/.test(colIdentRaw) ? colIdentRaw.toUpperCase() : headers[colIndex]} ${dir === 'asc' ? 'A-Z' : 'Z-A'}`, isTyping: true }];
                                        });
                                        if (saveChatMessagesToActiveChat) { saveChatMessagesToActiveChat([]); }
                                        setIsProcessing(false);
                                        return;
                                    }
                                }
                            }
                        } catch {
                            console.error('❌ LLM sort execution failed:', e);
                        }
                        break;
                    
                    case 'column_operation':
                        console.log('📏 LLM detected column operation - executing:', classification.action);
                        try {
                            const action = classification.action;
                            const colIdentRaw = (classification.target?.identifier || '').toString();
                            const countRaw = classification.parameters?.count;
                            const count = typeof countRaw === 'number'
                                ? countRaw
                                : parseInt(String(countRaw ?? '1'), 10) || 1;

                            // Try Univer first if available
                            if (univerAdapter && univerAdapter.isReady()) {
                                console.log('📐 Using Univer for column operations');

                                // Convert column letter to index if needed
                                let colIndex = -1;
                                if (/^[A-Za-z]$/.test(colIdentRaw)) {
                                    colIndex = colIdentRaw.toUpperCase().charCodeAt(0) - 65;
                                }

                                if (action === 'insert_column' && colIndex >= 0) {
                                    const success = univerAdapter.insertColumn(colIndex, count);
                                    if (success) {
                                        setMessages(prev => {
                                            const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                            const updatedMessages = [...newMessages, {
                                                id: (Date.now() + 1).toString(),
                                                role: 'assistant',
                                                type: 'assistant',
                                                content: `✅ Inserted ${count} column(s) at position ${colIdentRaw.toUpperCase()}`,
                                                isTyping: true,
                                                timestamp: new Date()
                                            } as ChatMessage];
                                            saveChatMessagesToActiveChat(updatedMessages);
                                            return updatedMessages;
                                        });
                                        setIsProcessing(false);
                                        return;
                                    }
                                } else if (action === 'delete_column' && colIndex >= 0) {
                                    const success = univerAdapter.deleteColumn(colIndex, count);
                                    if (success) {
                                        setMessages(prev => {
                                            const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                            const updatedMessages = [...newMessages, {
                                                id: (Date.now() + 1).toString(),
                                                role: 'assistant',
                                                type: 'assistant',
                                                content: `✅ Deleted ${count} column(s) starting at ${colIdentRaw.toUpperCase()}`,
                                                isTyping: true,
                                                timestamp: new Date()
                                            } as ChatMessage];
                                            saveChatMessagesToActiveChat(updatedMessages);
                                            return updatedMessages;
                                        });
                                        setIsProcessing(false);
                                        return;
                                    }
                                } else if (action === 'delete_columns_multiple') {
                                    // Handle multiple non-consecutive columns (e.g., "delete column A and C")
                                    const columnsParam = classification.parameters?.columns;
                                    const columns = Array.isArray(columnsParam) ? columnsParam : [];

                                    if (columns.length > 0) {
                                        console.log('📐 Deleting multiple non-consecutive columns:', columns);

                                        // Convert to indices and sort in DESCENDING order
                                        // Delete from highest index to lowest to avoid index shifting issues
                                        const indices = columns
                                            .map((col: string) => col.toUpperCase().charCodeAt(0) - 65)
                                            .sort((a: number, b: number) => b - a); // Highest first

                                        console.log('📐 Deletion order (highest to lowest):', indices);

                                        // Delete each column from highest index to lowest
                                        let successCount = 0;
                                        for (const idx of indices) {
                                            console.log(`🗑️ Deleting column at index ${idx}`);
                                            const success = univerAdapter.deleteColumn(idx, 1);
                                            if (success) {
                                                successCount++;
                                            } else {
                                                console.error(`❌ Failed to delete column at index ${idx}`);
                                            }
                                        }

                                        if (successCount === indices.length) {
                                            setMessages(prev => {
                                                const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                                const updatedMessages = [...newMessages, {
                                                    id: (Date.now() + 1).toString(),
                                                    role: 'assistant',
                                                    type: 'assistant',
                                                    content: `✅ Deleted ${successCount} columns: ${columns.join(', ')}`,
                                                    isTyping: true,
                                                    timestamp: new Date()
                                                } as ChatMessage];
                                                saveChatMessagesToActiveChat(updatedMessages);
                                                return updatedMessages;
                                            });
                                            setIsProcessing(false);
                                            return;
                                        } else {
                                            setMessages(prev => {
                                                const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                                const updatedMessages = [...newMessages, {
                                                    id: (Date.now() + 1).toString(),
                                                    role: 'assistant',
                                                    type: 'assistant',
                                                    content: `⚠️ Partially deleted columns: ${successCount}/${indices.length} successful`,
                                                    isTyping: true,
                                                    timestamp: new Date()
                                                } as ChatMessage];
                                                saveChatMessagesToActiveChat(updatedMessages);
                                                return updatedMessages;
                                            });
                                            setIsProcessing(false);
                                            return;
                                        }
                                    }
                                } else if (action === 'hide_columns') {
                                    const startCol = typeof classification.parameters?.start_column === 'string'
                                        ? classification.parameters.start_column
                                        : '';
                                    const endCol = typeof classification.parameters?.end_column === 'string'
                                        ? classification.parameters.end_column
                                        : '';

                                    if (startCol && endCol) {
                                        const startIndex = startCol.toUpperCase().charCodeAt(0) - 65;
                                        const endIndex = endCol.toUpperCase().charCodeAt(0) - 65;
                                        const success = univerAdapter.hideColumns(startIndex, endIndex);
                                        if (success) {
                                            setMessages(prev => {
                                                const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                                const updatedMessages = [...newMessages, {
                                                    id: (Date.now() + 1).toString(),
                                                    role: 'assistant',
                                                    type: 'assistant',
                                                    content: `✅ Hidden columns ${startCol.toUpperCase()} to ${endCol.toUpperCase()}`,
                                                    isTyping: true,
                                                    timestamp: new Date()
                                                } as ChatMessage];
                                                saveChatMessagesToActiveChat(updatedMessages);
                                                return updatedMessages;
                                            });
                                            setIsProcessing(false);
                                            return;
                                        }
                                    } else if (colIndex >= 0) {
                                        const success = univerAdapter.hideColumns(colIndex, colIndex);
                                        if (success) {
                                            setMessages(prev => {
                                                const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                                const updatedMessages = [...newMessages, {
                                id: (Date.now() + 1).toString(),
                                role: 'assistant',
                                type: 'assistant',
                                content: `✅ Hidden column ${colIdentRaw.toUpperCase()}`,
                                isTyping: true,
                                timestamp: new Date()
                            } as ChatMessage];
                                                saveChatMessagesToActiveChat(updatedMessages);
                                                return updatedMessages;
                                            });
                                            setIsProcessing(false);
                                            return;
                                        }
                                    }
                                } else if (action === 'show_columns') {
                                    // Check if this is an "all columns" command
                                    if (classification.target?.identifier === '*') {
                                        const success = univerAdapter.showColumns(0, 25); // A-Z
                                        if (success) {
                                            setMessages(prev => {
                                                const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                                const updatedMessages = [...newMessages, {
                                                    id: (Date.now() + 1).toString(),
                                                    role: 'assistant',
                                                    type: 'assistant',
                                                    content: `✅ Showed all columns`,
                                                    isTyping: true,
                                                    timestamp: new Date()
                                                } as ChatMessage];
                                                saveChatMessagesToActiveChat(updatedMessages);
                                                return updatedMessages;
                                            });
                                            setIsProcessing(false);
                                            return;
                                        }
                                    }
                                }
                            } else {
                                console.warn('⚠️ UniverAdapter not available for column operation');
                            }
                        } catch {
                            console.error('❌ LLM column operation execution failed:', e);
                        }
                        break;
                    
                    case 'row_operation':
                        console.log('📏 LLM detected row operation - executing:', classification.action);
                        try {
                            const action = classification.action;
                            const rowParam = classification.parameters?.row;
                            const startRow = classification.parameters?.start_row;
                            const endRow = classification.parameters?.end_row;
                            const countRaw = classification.parameters?.count;
                            const count = typeof countRaw === 'number'
                                ? countRaw
                                : parseInt(String(countRaw ?? '1'), 10) || 1;

                            // Try Univer first if available
                            if (univerAdapter && univerAdapter.isReady()) {
                                console.log('📏 Using Univer for row operations');

                                if (action === 'insert_row' && rowParam) {
                                    // Convert to 0-based index
                                    const rowIndex = parseInt(rowParam.toString()) - 1;
                                    const rowsToInsert = Array.from({ length: count }, () => []);
                                    const success = univerAdapter.insertMultipleRows(rowIndex, rowsToInsert);
                                    if (success) {
                                        setMessages(prev => {
                                            const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                            const updatedMessages = [...newMessages, {
                                                id: (Date.now() + 1).toString(),
                                                role: 'assistant',
                                                type: 'assistant',
                                                content: `✅ Inserted ${count} row(s) at position ${rowParam}`,
                                                isTyping: true,
                                                timestamp: new Date()
                                            } as ChatMessage];
                                            saveChatMessagesToActiveChat(updatedMessages);
                                            return updatedMessages;
                                        });
                                    }
                                } else if (action === 'delete_row' && rowParam) {
                                    // Convert to 0-based index
                                    const rowIndex = parseInt(rowParam.toString()) - 1;
                                    const success = univerAdapter.deleteRow(rowIndex, count);
                                    if (success) {
                                        setMessages(prev => {
                                            const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                            const updatedMessages = [...newMessages, {
                                                id: (Date.now() + 1).toString(),
                                                role: 'assistant',
                                                type: 'assistant',
                                                content: `✅ Deleted ${count} row(s) starting at ${rowParam}`,
                                                isTyping: true,
                                                timestamp: new Date()
                                            } as ChatMessage];
                                            saveChatMessagesToActiveChat(updatedMessages);
                                            return updatedMessages;
                                        });
                                    }
                                } else if (action === 'hide_rows') {
                                    const start = startRow ? parseInt(startRow.toString()) - 1 : 0;
                                    const end = endRow ? parseInt(endRow.toString()) - 1 : start;
                                    const success = univerAdapter.hideRows(start, end);
                                    if (success) {
                                        setMessages(prev => {
                                            const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                            const updatedMessages = [...newMessages, {
                                                id: (Date.now() + 1).toString(),
                                                role: 'assistant',
                                                type: 'assistant',
                                                content: `✅ Hidden rows ${start + 1} to ${end + 1}`,
                                                isTyping: true,
                                                timestamp: new Date()
                                            } as ChatMessage];
                                            saveChatMessagesToActiveChat(updatedMessages);
                                            return updatedMessages;
                                        });
                                    }
                                } else if (action === 'show_rows') {
                                    // Check if this is an "all rows" command
                                    if (!startRow && !endRow && classification.target?.identifier === '*') {
                                        const success = univerAdapter.showRows(0, 9999);
                                        if (success) {
                                            setMessages(prev => {
                                                const newMessages = prev.filter(msg => !msg.isAnalyzing);
                        const updatedMessages = [...newMessages, {
                            id: (Date.now() + 1).toString(),
                            role: 'assistant',
                            type: 'assistant',
                            content: `✅ Showed all rows`,
                            isTyping: true,
                            timestamp: new Date()
                        } as ChatMessage];
                                                saveChatMessagesToActiveChat(updatedMessages);
                                                return updatedMessages;
                                            });
                                        }
                                    } else {
                                        const start = startRow ? parseInt(startRow.toString()) - 1 : 0;
                                        const end = endRow ? parseInt(endRow.toString()) - 1 : start;
                                        const success = univerAdapter.showRows(start, end);
                                        if (success) {
                                            setMessages(prev => {
                                                const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                                const updatedMessages = [...newMessages, {
                                                id: (Date.now() + 1).toString(),
                                                role: 'assistant',
                                                type: 'assistant',
                                                content: `✅ Showed rows ${start + 1} to ${end + 1}`,
                                                isTyping: true,
                                                timestamp: new Date()
                                            } as ChatMessage];
                                                saveChatMessagesToActiveChat(updatedMessages);
                                                return updatedMessages;
                                            });
                                        }
                                    }
                                }
                            } else {
                                console.warn('⚠️ UniverAdapter not available for row operation');
                            }
                        } catch {
                            console.error('❌ LLM row operation execution failed:', e);
                        }
                        setIsProcessing(false);
                        return; // Exit early to prevent fallback patterns
                        break;
                    
                    case 'cell_operation':
                        console.log('📝 LLM detected cell operation - executing:', classification.action);
                        try {
                            if (typeof window !== 'undefined' && (window as any).luckysheet?.getSheetData) {
                                const action = classification.action;
                                const cellId = classification.target?.identifier || '';
                                const value = classification.parameters?.value;
                                const format = classification.parameters?.format;
                                
                                // Parse cell reference (e.g., "B3" -> row:2, col:1)
                                const cellMatch = cellId.match(/([A-Z]+)(\d+)/i);
                                if (cellMatch) {
                                    const colLetter = cellMatch[1].toUpperCase();
                                    const rowNum = parseInt(cellMatch[2]);
                                    const colIndex = colLetter.charCodeAt(0) - 65; // A=0, B=1, etc.
                                    const rowIndex = rowNum - 1; // Convert to 0-based
                                    
                                    if (action === 'set_cell_value' && value !== undefined) {
                                        (window as any).luckysheet.setCellValue?.(rowIndex, colIndex, value);
                                        setMessages(prev => {
                                            const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                            const updatedMessages = [...newMessages, { 
                                                id: (Date.now() + 1).toString(),
                                                role: 'assistant', 
                                                type: 'assistant',
                                                content: `✅ Set cell ${cellId} to "${value}"`, 
                                                isTyping: true,
                                                timestamp: new Date()
                                            } as ChatMessage];
                                            saveChatMessagesToActiveChat(updatedMessages);
                                            return updatedMessages;
                                        });
                                    } else if (action === 'clear_cell') {
                                        (window as any).luckysheet.clearCell?.(rowIndex, colIndex);
                                        setMessages(prev => {
                                            const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                            const updatedMessages = [...newMessages, { 
                                                id: (Date.now() + 1).toString(),
                                                role: 'assistant', 
                                                type: 'assistant',
                                                content: `✅ Cleared cell ${cellId}`, 
                                                isTyping: true,
                                                timestamp: new Date()
                                            } as ChatMessage];
                                            saveChatMessagesToActiveChat(updatedMessages);
                                            return updatedMessages;
                                        });
                                    } else if (action === 'format_cell' && format) {
                                        // Handle basic formatting
                                        if (format === 'bold') {
                                            (window as any).luckysheet.setCellFormat?.(rowIndex, colIndex, 'bl', 1);
                                        }
                                        setMessages(prev => {
                                            const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                            const updatedMessages = [...newMessages, { 
                                                id: (Date.now() + 1).toString(),
                                                role: 'assistant', 
                                                type: 'assistant',
                                                content: `✅ Applied ${format} formatting to cell ${cellId}`, 
                                                isTyping: true,
                                                timestamp: new Date()
                                            } as ChatMessage];
                                            saveChatMessagesToActiveChat(updatedMessages);
                                            return updatedMessages;
                                        });
                                    }
                                }
                            }
                        } catch {
                            console.error('❌ LLM cell operation execution failed:', e);
                        }
                        setIsProcessing(false);
                        return; // Exit early to prevent fallback patterns
                        break;
                    
                    case 'range_operation':
                        console.log('📋 LLM detected range operation - executing:', classification.action);
                        try {
                        const action = classification.action;
                        const range = typeof classification.parameters?.range === 'string'
                            ? classification.parameters.range
                            : typeof classification.target?.identifier === 'string'
                                ? classification.target.identifier
                                : '';

                            // Try Univer first if available
                            if (univerAdapter && univerAdapter.isReady()) {
                                console.log('📋 Using Univer for range operations');

                                if (action === 'merge_range' && range) {
                                    // Parse range (e.g., "A1:C3" -> startRow: 0, startCol: 0, numRows: 3, numCols: 3)
                                    const rangeMatch = range.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/i);
                                    if (rangeMatch) {
                                        const startCol = rangeMatch[1].toUpperCase().charCodeAt(0) - 65;
                                        const startRow = parseInt(rangeMatch[2]) - 1;
                                        const endCol = rangeMatch[3].toUpperCase().charCodeAt(0) - 65;
                                        const endRow = parseInt(rangeMatch[4]) - 1;
                                        const numRows = endRow - startRow + 1;
                                        const numCols = endCol - startCol + 1;

                                        const success = univerAdapter.mergeCells(startRow, startCol, numRows, numCols);
                                        if (success) {
                                            setMessages(prev => {
                                                const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                                const updatedMessages = [...newMessages, {
                                                    id: (Date.now() + 1).toString(),
                                                    role: 'assistant',
                                                    type: 'assistant',
                                                    content: `✅ Merged cells in range ${range}`,
                                                    isTyping: true,
                                                    timestamp: new Date()
                                                } as ChatMessage];
                                                saveChatMessagesToActiveChat(updatedMessages);
                                                return updatedMessages;
                                            });
                                        }
                                    }
                                } else if (action === 'unmerge_range' && range) {
                                    // Parse range for unmerge
                                    const rangeMatch = range.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/i);
                                    if (rangeMatch) {
                                        const startCol = rangeMatch[1].toUpperCase().charCodeAt(0) - 65;
                                        const startRow = parseInt(rangeMatch[2]) - 1;
                                        const endCol = rangeMatch[3].toUpperCase().charCodeAt(0) - 65;
                                        const endRow = parseInt(rangeMatch[4]) - 1;
                                        const numRows = endRow - startRow + 1;
                                        const numCols = endCol - startCol + 1;

                                        const success = univerAdapter.unmergeCells(startRow, startCol, numRows, numCols);
                                        if (success) {
                                            setMessages(prev => {
                                                const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                                const updatedMessages = [...newMessages, {
                                                    id: (Date.now() + 1).toString(),
                                                    role: 'assistant',
                                                    type: 'assistant',
                                                    content: `✅ Unmerged cells in range ${range}`,
                                                    isTyping: true,
                                                    timestamp: new Date()
                                                } as ChatMessage];
                                                saveChatMessagesToActiveChat(updatedMessages);
                                                return updatedMessages;
                                            });
                                        }
                                    }
                                } else if (action === 'insert_cells' && range) {
                                    // Parse range and shift direction
                                const rangeMatch = range.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/i);
                                const shiftDirection: 'down' | 'right' =
                                    classification.parameters?.shift_direction === 'right' ? 'right' : 'down';

                                    if (rangeMatch) {
                                        const startCol = rangeMatch[1].toUpperCase().charCodeAt(0) - 65;
                                        const startRow = parseInt(rangeMatch[2]) - 1;
                                        const endCol = rangeMatch[3].toUpperCase().charCodeAt(0) - 65;
                                        const endRow = parseInt(rangeMatch[4]) - 1;
                                        const numRows = endRow - startRow + 1;
                                        const numCols = endCol - startCol + 1;

                                        const success = univerAdapter.insertCells(startRow, startCol, numRows, numCols, shiftDirection);
                                        if (success) {
                                            setMessages(prev => {
                                                const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                                const updatedMessages = [...newMessages, {
                                                    id: (Date.now() + 1).toString(),
                                                    role: 'assistant',
                                                    type: 'assistant',
                                                    content: `✅ Inserted cells at ${range}, shifted ${shiftDirection}`,
                                                    isTyping: true,
                                                    timestamp: new Date()
                                                } as ChatMessage];
                                                saveChatMessagesToActiveChat(updatedMessages);
                                                return updatedMessages;
                                            });
                                        }
                                    }
                                } else if (action === 'delete_cells' && range) {
                                    // Parse range and shift direction
                                    const rangeMatch = range.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/i);
                                    const shiftDirection: 'left' | 'up' =
                                        classification.parameters?.shift_direction === 'left' ? 'left' : 'up';

                                    if (rangeMatch) {
                                        const startCol = rangeMatch[1].toUpperCase().charCodeAt(0) - 65;
                                        const startRow = parseInt(rangeMatch[2]) - 1;
                                        const endCol = rangeMatch[3].toUpperCase().charCodeAt(0) - 65;
                                        const endRow = parseInt(rangeMatch[4]) - 1;
                                        const numRows = endRow - startRow + 1;
                                        const numCols = endCol - startCol + 1;

                                        const success = univerAdapter.deleteCells(startRow, startCol, numRows, numCols, shiftDirection);
                                        if (success) {
                                            setMessages(prev => {
                                                const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                                const updatedMessages = [...newMessages, {
                            id: (Date.now() + 1).toString(),
                            role: 'assistant',
                            type: 'assistant',
                            content: `✅ Deleted cells at ${range}, shifted ${shiftDirection}`,
                            isTyping: true,
                            timestamp: new Date()
                        } as ChatMessage];
                                                saveChatMessagesToActiveChat(updatedMessages);
                                                return updatedMessages;
                                            });
                                        }
                                    }
                                } else if (action === 'clear_range' && range) {
                                    // Parse range for clearing
                                    const rangeMatch = range.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/i);
                                    if (rangeMatch) {
                                        const startCol = rangeMatch[1].toUpperCase().charCodeAt(0) - 65;
                                        const startRow = parseInt(rangeMatch[2]) - 1;
                                        const endCol = rangeMatch[3].toUpperCase().charCodeAt(0) - 65;
                                        const endRow = parseInt(rangeMatch[4]) - 1;

                                        const success = univerAdapter.clearRange(startRow, startCol, endRow - startRow + 1, endCol - startCol + 1);
                                        if (success) {
                                            setMessages(prev => {
                                                const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                                const updatedMessages = [...newMessages, {
                                                    id: (Date.now() + 1).toString(),
                                                    role: 'assistant',
                                                    type: 'assistant',
                                                    content: `✅ Cleared range ${range}`,
                                                    isTyping: true,
                                                    timestamp: new Date()
                                                } as ChatMessage];
                                                saveChatMessagesToActiveChat(updatedMessages);
                                                return updatedMessages;
                                            });
                                        }
                                    }
                                }
                            } else {
                                console.warn('⚠️ UniverAdapter not available for range operation');
                            }
                        } catch {
                            console.error('❌ LLM range operation execution failed:', e);
                        }
                        setIsProcessing(false);
                        return; // Exit early to prevent fallback patterns
                        break;
                    
                    case 'freeze_operation':
                        console.log('🧊 LLM detected freeze operation - executing:', classification.action);
                        try {
                            const action = classification.action;
                            const rowParam = classification.parameters?.row;
                            const columnParam = classification.parameters?.column;
                            const row = typeof rowParam === 'number' ? rowParam : parseInt(String(rowParam ?? '0'), 10);
                            const column = typeof columnParam === 'number' ? columnParam : parseInt(String(columnParam ?? '0'), 10);

                            if (univerAdapter && univerAdapter.isReady()) {
                                console.log('🧊 Using Univer for freeze operations');

                                if (action === 'freeze_horizontal' && row) {
                                    const success = univerAdapter.freezeRows(row);
                                    if (success) {
                                        setMessages(prev => {
                                            const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                            const updatedMessages = [...newMessages, {
                                                id: (Date.now() + 1).toString(),
                                                role: 'assistant',
                                                type: 'assistant',
                                                content: `✅ Froze first ${row} row(s)`,
                                                isTyping: true,
                                                timestamp: new Date()
                                            } as ChatMessage];
                                            saveChatMessagesToActiveChat(updatedMessages);
                                            return updatedMessages;
                                        });
                                    }
                                } else if (action === 'freeze_vertical' && column) {
                                    // Convert column letter to index
                                    const colIndex = typeof columnParam === 'string'
                                        ? columnParam.toUpperCase().charCodeAt(0) - 65 + 1
                                        : column;
                                    const success = univerAdapter.freezeColumns(colIndex);
                                    if (success) {
                                        setMessages(prev => {
                                            const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                            const updatedMessages = [...newMessages, {
                            id: (Date.now() + 1).toString(),
                            role: 'assistant',
                            type: 'assistant',
                            content: `✅ Froze column(s) up to ${columnParam ?? column}`,
                            isTyping: true,
                            timestamp: new Date()
                        } as ChatMessage];
                                            saveChatMessagesToActiveChat(updatedMessages);
                                            return updatedMessages;
                                        });
                                    }
                                } else if (action === 'unfreeze_panes') {
                                    const success = univerAdapter.unfreeze();
                                    if (success) {
                                        setMessages(prev => {
                                            const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                            const updatedMessages = [...newMessages, {
                                id: (Date.now() + 1).toString(),
                                role: 'assistant',
                                type: 'assistant',
                                content: `✅ Unfroze all panes`,
                                isTyping: true,
                                timestamp: new Date()
                            } as ChatMessage];
                                            saveChatMessagesToActiveChat(updatedMessages);
                                            return updatedMessages;
                                        });
                                    }
                                }
                            } else {
                                console.warn('⚠️ UniverAdapter not available for freeze operation');
                            }
                        } catch {
                            console.error('❌ LLM freeze operation execution failed:', e);
                        }
                        setIsProcessing(false);
                        return; // Exit early to prevent fallback patterns
                        break;
                    
                    case 'general_query':
                        console.log('💬 LLM detected general query - routing to backend');
                        response = await sendQuery(userMessage, activeChat?.id || 'default', { isVoice: false, mode: queryMode });
                        break;

                    case 'compound_operation':
                        console.log('🎭 Compound operation detected - executing multiple operations');
                        try {
                            const operationsParam = classification.parameters?.operations;
                            const operations = Array.isArray(operationsParam) ? operationsParam : [];

                            if (operations.length > 0) {
                                console.log(`🔄 Executing ${operations.length} operations in sequence:`, operations);

                                const results: string[] = [];
                                let allSuccessful = true;

                                // Execute each sub-operation sequentially
                                for (let i = 0; i < operations.length; i++) {
                                    const subOperation = operations[i];
                                    console.log(`\n🔄 [${i + 1}/${operations.length}] Executing: "${subOperation}"`);

                                    try {
                                        // Re-classify the sub-operation
                                        const subClassification = await llmCommandClassifier.classifyCommand(subOperation);
                                        console.log(`📋 Sub-operation classified as: ${subClassification.intent} -> ${subClassification.action}`);

                                        // Execute based on intent using a simplified handler
                                        let subResult = '';
                                        if (!univerAdapter || !univerAdapter.isReady()) {
                                            subResult = '❌ Univer not available for operation';
                                            results.push(subResult);
                                            allSuccessful = false;
                                            continue;
                                        }

                                        switch (subClassification.intent) {
                                            case 'column_operation':
                                                const action = subClassification.action;
                                                const colIdentRaw = (subClassification.target?.identifier || '').toString();
                                                const countRaw = subClassification.parameters?.count;
                                                const count = typeof countRaw === 'number'
                                                    ? countRaw
                                                    : parseInt(String(countRaw ?? '1'), 10) || 1;
                                                let colIndex = -1;
                                                if (/^[A-Za-z]$/.test(colIdentRaw)) {
                                                    colIndex = colIdentRaw.toUpperCase().charCodeAt(0) - 65;
                                                }

                                                if (action === 'delete_column' && colIndex >= 0) {
                                                    const success = univerAdapter.deleteColumn(colIndex, count);
                                                    subResult = success ? `✅ Deleted column ${colIdentRaw.toUpperCase()}` : `❌ Failed to delete column ${colIdentRaw.toUpperCase()}`;
                                                    allSuccessful = allSuccessful && success;
                                                } else if (action === 'delete_columns_multiple') {
                                                    const columnsParam = subClassification.parameters?.columns;
                                                    const columns = Array.isArray(columnsParam) ? columnsParam : [];
                                                    const indices = columns
                                                        .map((col: string) => col.toUpperCase().charCodeAt(0) - 65)
                                                        .sort((a: number, b: number) => b - a);
                                                    let successCount = 0;
                                                    for (const idx of indices) {
                                                        const success = univerAdapter.deleteColumn(idx, 1);
                                                        if (success) successCount++;
                                                    }
                                                    subResult = successCount === indices.length
                                                        ? `✅ Deleted columns: ${columns.join(', ')}`
                                                        : `⚠️ Partially deleted columns: ${successCount}/${indices.length}`;
                                                    allSuccessful = allSuccessful && (successCount === indices.length);
                                                } else if (action === 'insert_column' && colIndex >= 0) {
                                                    const success = univerAdapter.insertColumn(colIndex, count);
                                                    subResult = success ? `✅ Inserted column at ${colIdentRaw.toUpperCase()}` : `❌ Failed to insert column`;
                                                    allSuccessful = allSuccessful && success;
                                                }
                                                break;

                                            case 'freeze_operation':
                                                const freezeAction = subClassification.action;
                                                if (freezeAction === 'freeze_horizontal') {
                const rowParam = subClassification.parameters?.row;
                const row = typeof rowParam === 'number' ? rowParam : parseInt(String(rowParam ?? '1'), 10) || 1;
                const success = univerAdapter.freezeRows(row);
                                                    subResult = success ? `✅ Froze first ${row} row(s)` : `❌ Failed to freeze rows`;
                                                    allSuccessful = allSuccessful && success;
                                                } else if (freezeAction === 'freeze_vertical') {
                const column = (subClassification.parameters?.column || 'A').toString();
                const colIndex = /^[A-Za-z]+$/.test(column)
                    ? column.toUpperCase().charCodeAt(0) - 65 + 1
                    : parseInt(column, 10) || 1;
                                                    const success = univerAdapter.freezeColumns(colIndex);
                                                    subResult = success ? `✅ Froze column(s) up to ${column}` : `❌ Failed to freeze columns`;
                                                    allSuccessful = allSuccessful && success;
                                                } else if (freezeAction === 'unfreeze_panes') {
                                                    const success = univerAdapter.unfreeze();
                                                    subResult = success ? `✅ Unfroze all panes` : `❌ Failed to unfreeze`;
                                                    allSuccessful = allSuccessful && success;
                                                }
                                                break;

                                            case 'row_operation':
                                                const rowAction = subClassification.action;
                                                const rowNumberRaw = subClassification.parameters?.row;
                                                const rowCountRaw = subClassification.parameters?.count;
                                                const rowNumber = typeof rowNumberRaw === 'number' ? rowNumberRaw : parseInt(String(rowNumberRaw ?? '1'), 10) || 1;
                                                const rowCount = typeof rowCountRaw === 'number' ? rowCountRaw : parseInt(String(rowCountRaw ?? '1'), 10) || 1;

                                                if (rowAction === 'delete_row') {
                                                    const success = univerAdapter.deleteRow(rowNumber - 1, rowCount);
                                                    subResult = success ? `✅ Deleted ${rowCount} row(s) starting at row ${rowNumber}` : `❌ Failed to delete rows`;
                                                    allSuccessful = allSuccessful && success;
                                                } else if (rowAction === 'insert_row') {
                                                    const rowsToInsert = Array.from({ length: rowCount }, () => []);
                                                    const success = univerAdapter.insertMultipleRows(rowNumber - 1, rowsToInsert);
                                                    subResult = success ? `✅ Inserted ${rowCount} row(s) at row ${rowNumber}` : `❌ Failed to insert rows`;
                                                    allSuccessful = allSuccessful && success;
                                                }
                                                break;

                                            default:
                                                subResult = `⚠️ Operation type "${subClassification.intent}" not supported in compound mode yet`;
                                                allSuccessful = false;
                                                break;
                                        }

                                        results.push(`${i + 1}. ${subResult}`);
                                        console.log(`✅ Sub-operation ${i + 1} completed:`, subResult);

                                    } catch (subError) {
                                        console.error(`❌ Sub-operation ${i + 1} failed:`, subError);
                                        results.push(`${i + 1}. ❌ Error: ${subError instanceof Error ? subError.message : 'Unknown error'}`);
                                        allSuccessful = false;
                                    }
                                }

                                // Show combined result
                                const summaryMessage = allSuccessful
                                    ? `✅ All ${operations.length} operations completed successfully:\n${results.join('\n')}`
                                    : `⚠️ Compound operation completed with some issues:\n${results.join('\n')}`;

                                setMessages(prev => {
                                    const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                    const updatedMessages = [...newMessages, {
                        id: (Date.now() + 1).toString(),
                        role: 'assistant',
                        type: 'assistant',
                        content: summaryMessage,
                        isTyping: true,
                        timestamp: new Date()
                    } as ChatMessage];
                                    saveChatMessagesToActiveChat(updatedMessages);
                                    return updatedMessages;
                                });
                                setIsProcessing(false);
                                return; // Exit early after compound execution
                            }
                        } catch (error) {
                            console.error('❌ Error in compound operation execution:', error);
                        }
                        break;

                    default:
                        console.log('🔄 LLM classification complete, continuing with existing patterns');
                        break;
                }
                
                // If we handled the command above and set a response, process it
                if (response) {
                    setMessages(prev => {
                        const newMessages = prev.filter(msg => !msg.isAnalyzing);
                        
                        // Detect structured responses that should display immediately with proper formatting
                        const rawResponseText = response.response || response.message || '';
                        const responseText = rawResponseText;
                        const hasStructuredContent = responseText.includes('Key Details:') || 
                                                    responseText.includes('Why This Matters:') || 
                                                    responseText.includes('You might also want to explore:') ||
                                                    responseText.includes('- ');
                        
                        const updatedMessages = [...newMessages, {
                            id: (Date.now() + 1).toString(),
                            role: 'assistant',
                            type: 'assistant',
                            content: responseText,
                            isTyping: !response.visualization && !hasStructuredContent,
                            visualization: response.visualization ? {
                                type: response.visualization.type,
                                path: response.visualization.path,
                                original_query: response.visualization.original_query || userMessage
                            } : undefined,
                            timestamp: new Date()
                        } as ChatMessage];
                        
                        // Save chat history
                        saveChatMessagesToActiveChat(updatedMessages);
                        return updatedMessages;
                    });
                    setIsProcessing(false);
                    return; // Exit early after LLM-guided backend call
                }
            }

            console.log('🔧 === FALLBACK TO EXISTING PATTERNS ===');
            // DIRECT NUMERIC CONDITIONAL FORMATTING - Execute immediately for numeric conditions
            const numericConditionMatch = userMessage.match(/(?:highlight|show|mark|color)\s+(?:all\s+)?(?:(?:cells?|values?(?:\s+in\s+cells?)?|numbers?|data)\s+)?(?:(?:with|that\s+(?:are|have|contain)|having)\s+)?(?:values?\s+)?(?:that\s+(?:are|have)\s+)?(greater(?:\s+than)?|less(?:\s+than)?|equal(?:\s+to)?|equals?|between|>=|<=|>|<|=)\s+(?:than\s+)?([+-]?\d*\.?\d+)(?:\s+and\s+([+-]?\d*\.?\d+))?(?:\s+(?:in|on|for|within)\s+(?:column\s+)?([A-Za-z]+))?/i);
            
            if (numericConditionMatch && (window as any).luckysheet && typeof (window as any).luckysheet.getSheetData === 'function') {
                console.log('🔢 DIRECT NUMERIC CONDITIONAL FORMATTING detected:', userMessage);
                
                // Add brief delay to show analyzing state
                await new Promise(resolve => setTimeout(resolve, 300));
                const operation = numericConditionMatch[1].toLowerCase();
                const value1 = parseFloat(numericConditionMatch[2]);
                const value2 = numericConditionMatch[3] ? parseFloat(numericConditionMatch[3]) : undefined;
                const columnSpec = numericConditionMatch[4] ? numericConditionMatch[4].toUpperCase() : null;
                
                // Determine condition type
                let conditionType = 'greaterThan';
                if (/less(?:\s*than)?|<|<=/.test(operation)) {
                    conditionType = 'lessThan';
                } else if (/equal|equals?|=/.test(operation)) {
                    conditionType = 'equal';
                } else if (/between/.test(operation)) {
                    conditionType = 'betweenness';
                }
                
                // Get current sheet data
                const sheetData = (window as any).luckysheet.getSheetData();
                if (sheetData && sheetData.length > 1) {
                    // Determine range based on column specification
                    const lastRow = sheetData.length;
                    const lastCol = Math.max(...sheetData.map((row: any) => row ? row.length : 0));
                    
                    let targetRange: string;
                    let startCol: number;
                    let endCol: number;
                    
                    if (columnSpec) {
                        // Column specified - work only on that column
                        const columnIndex = columnSpec.charCodeAt(0) - 65; // A=0, B=1, etc.
                        if (columnIndex >= 0 && columnIndex < lastCol) {
                            startCol = columnIndex;
                            endCol = columnIndex;
                            targetRange = `${columnSpec}2:${columnSpec}${lastRow}`;
                        } else {
                            // Invalid column specified
                            setMessages(prev => {
                                const newMessages = prev.filter(msg => !msg.isAnalyzing);
                                return [...newMessages, {
                                    role: 'assistant',
                                    content: `❌ Column ${columnSpec} does not exist in the spreadsheet`,
                                    isTyping: true
                                }];
                            });
                            setIsProcessing(false);
                            return;
                        }
                    } else {
                        // No column specified - use full data range
                        startCol = 0;
                        endCol = lastCol - 1;
                        const lastColLetter = String.fromCharCode(64 + lastCol); // A=1, so 64+1=65='A'
                        targetRange = `A2:${lastColLetter}${lastRow}`;
                    }
                    
                    console.log('🎯 Applying direct numeric CF:', {
                        condition: conditionType,
                        values: value2 !== undefined ? [value1, value2] : [value1],
                        column: columnSpec || 'all',
                        range: targetRange,
                        scanCols: [startCol, endCol],
                        dataRows: lastRow - 1,
                        dataCols: lastCol
                    });
                    
                    // Helper function to extract numeric value from cell
                    const getCellNumericValue = (cell: any): number | null => {
                        if (cell === null || cell === undefined) return null;
                        
                        let rawValue: any = cell;
                        if (typeof cell === 'object' && cell !== null) {
                            const directM = (cell as any).m;
                            const directV = (cell as any).v;
                            if (directM !== undefined && directM !== null) rawValue = directM;
                            else if (directV !== undefined && directV !== null) {
                                if (typeof directV === 'object') {
                                    const nestedM = (directV as any).m;
                                    const nestedV = (directV as any).v;
                                    if (nestedM !== undefined && nestedM !== null) rawValue = nestedM;
                                    else if (nestedV !== undefined && nestedV !== null) rawValue = nestedV;
                                    else rawValue = directV;
                                } else {
                                    rawValue = directV;
                                }
                            } else {
                                return null;
                            }
                        }
                        
                        const numValue = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue));
                        return isNaN(numValue) ? null : numValue;
                    };
                    
                    const matchingCells: Array<{row: number, col: number}> = [];
                    
                    // Check each cell in data range (exclude header row)
                    for (let row = 1; row < lastRow; row++) { // Start from row 1 (0-based, so row 2 in sheet)
                        for (let col = startCol; col <= endCol; col++) {
                            const cell = sheetData[row]?.[col];
                            const numValue = getCellNumericValue(cell);
                            
                            if (numValue !== null) {
                                let matches = false;
                                
                                // Apply condition logic
                                switch (conditionType) {
                                    case 'greaterThan':
                                        matches = numValue > value1;
                                        break;
                                    case 'lessThan':
                                        matches = numValue < value1;
                                        break;
                                    case 'equal':
                                        matches = Math.abs(numValue - value1) < 0.0001;
                                        break;
                                    case 'betweenness':
                                        if (value2 !== undefined) {
                                            const min = Math.min(value1, value2);
                                            const max = Math.max(value1, value2);
                                            matches = numValue >= min && numValue <= max;
                                        }
                                        break;
                                }
                                
                                if (matches) {
                                    matchingCells.push({row: row + 1, col}); // Convert to 1-based for range
                                }
                            }
                        }
                    }
                    
                    console.log(`✅ Found ${matchingCells.length} matching cells for ${conditionType}`);
                    
                    // Apply background highlighting to matching cells
                    if (matchingCells.length > 0) {
                        matchingCells.forEach(cellPos => {
                            const colLetter = String.fromCharCode(65 + cellPos.col);
                            const cellRange = `${colLetter}${cellPos.row}:${colLetter}${cellPos.row}`;
                            try {
                                (window as any).luckysheet.setRangeFormat('bg', '#ffcccc', { range: cellRange });
                            } catch {
                                console.warn('Direct CF setRangeFormat failed for cell', cellRange, e);
                            }
                        });
                        
                        // Update UI with success message
                        const conditionDescription = conditionType === 'betweenness' && value2 !== undefined ? 
                            `between ${value1} and ${value2}` : 
                            `${operation} ${value1}`;
                        
                        const locationDescription = columnSpec ? ` in column ${columnSpec}` : '';
                        
                        setMessages(prev => {
                            const newMessages = prev.filter(msg => !msg.isAnalyzing);
                            const updatedMessages = [...newMessages, {
                                id: (Date.now() + 1).toString(),
                                role: 'assistant',
                                type: 'assistant',
                                content: `✅ Highlighted ${matchingCells.length} cells with values ${conditionDescription}${locationDescription}`,
                                isTyping: true,
                                timestamp: new Date()
                            } as ChatMessage];
                            // Save chat history for conditional formatting
                            saveChatMessagesToActiveChat(updatedMessages);
                            return updatedMessages;
                        });
                        setIsProcessing(false);
                        return; // Exit early - don't process through backend
                    } else {
                        // No matches found
                        const conditionDescription = conditionType === 'betweenness' && value2 !== undefined ? 
                            `between ${value1} and ${value2}` : 
                            `${operation} ${value1}`;
                        
                        const locationDescription = columnSpec ? ` in column ${columnSpec}` : '';
                        
                        setMessages(prev => {
                            const newMessages = prev.filter(msg => !msg.isAnalyzing);
                            const updatedMessages = [...newMessages, {
                                id: (Date.now() + 1).toString(),
                                role: 'assistant',
                                type: 'assistant',
                                content: `ℹ️ No cells found with values ${conditionDescription}${locationDescription}`,
                                isTyping: true,
                                timestamp: new Date()
                            } as ChatMessage];
                            // Save chat history for conditional formatting
                            saveChatMessagesToActiveChat(updatedMessages);
                            return updatedMessages;
                        });
                        setIsProcessing(false);
                        return; // Exit early - don't process through backend
                    }
                }
            }
            // END DIRECT NUMERIC CONDITIONAL FORMATTING
            
            // Initialize backend if this is the first query from a saved workspace
            if (!isBackendInitialized) {
                await initializeBackend();
            }

            // Check if this is a duplicate operation first (highest priority)
            // Exclude conditional-formatting style requests like "highlight duplicates in <column>" including looser phrasing
            const highlightDupInColumnPattern1 = /(?:conditional\s*format|highlight)\s+(?:\w+\s+)*?(?:duplicates?|repeats?)\s+(?:\w+\s+)*?(?:in|on|for|within)\s+(?:\w+\s+)*?(?:column|\bcol\b)/i;
            const highlightDupInColumnPattern2 = /highlight\s+(?:\w+\s+)*?(?:duplicates?|repeats?)\s+(?:\w+\s+)*?in\s+column\s+[A-Za-z]\b/i;
            const highlightDupRowsPattern = /highlight\s+(?:all\s+)?(?:the\s+)?duplicate\s+rows/i;
            const highlightDupRowsPattern2 = /can\s+you\s+highlight\s+(?:all\s+)?(?:the\s+)?duplicate\s+rows/i;
            const isDuplicateCommand = /\b(duplicate|duplicates|deduplicate|deduplication|remove duplicate|delete duplicate|drop duplicate|eliminate duplicate|check duplicate|find duplicate|any duplicate|are there.*duplicate)\b/i.test(userMessage)
              && !highlightDupInColumnPattern1.test(userMessage)
              && !highlightDupInColumnPattern2.test(userMessage)
              && !highlightDupRowsPattern.test(userMessage)
              && !highlightDupRowsPattern2.test(userMessage);
            
            // ⚠️ REMOVED: Old filter command fallback (lines 5174-5365)
            // Filter commands now handled by LLM Classification → handleUniverFiltering()

            // ⚠️ REMOVED: Old isSpreadsheetCommand regex check
            // All spreadsheet operations now handled by Universal Query Router → LLM Classification → UniverAdapter

            console.log('🎯 === CHATSIDEBAR COMMAND ANALYSIS ===');
            console.log('💬 User message:', userMessage);
            console.log('🔄 Is duplicate command:', isDuplicateCommand);

            if (isDuplicateCommand) {
                console.log('🔄 Routing to duplicate processing via data analysis service...');
                
                // Route duplicate commands to the regular data analysis service
                // This ensures proper backend routing to DUPLICATE_CHECK category
                try {
                    const duplicateResponse = await commandService.analyzeData(userMessage, []);
                    console.log('✅ Duplicate command raw response:', duplicateResponse);
                    
                    // Normalize response format to match expected ChatSidebar format
                    // IMPORTANT: Preserve data_updated and updated_data for spreadsheet refresh
                    response = {
                        response: (duplicateResponse as any).message || (duplicateResponse as any).response || 'Duplicate operation completed',
                        visualization: duplicateResponse.visualization || null,
                        data_updated: duplicateResponse.data_updated,
                        updated_data: duplicateResponse.updated_data
                    };
                    console.log('✅ Normalized duplicate response:', response);
                    console.log('🔍 Data update fields preserved:', { 
                        data_updated: response.data_updated, 
                        has_updated_data: !!response.updated_data 
                    });
                } catch (error) {
                    console.error('❌ Error in duplicate command processing:', error);
                    response = {
                        response: `❌ Error processing duplicate command: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        visualization: null
                    };
                }
                
            } else {
                // Not a spreadsheet command, use regular query processing
                console.log('🌐 Routing to regular query service...');
                response = await sendQuery(userMessage, activeChat?.id || 'default', { isVoice: false, mode: queryMode });
            }
            
            // Handle data updates from the backend
            console.log('🔍 === CHATSIDEBAR DATAUPDATE DISPATCH DEBUG ===');
            console.log('🔍 Response object keys:', Object.keys(response || {}));
            console.log('🔍 response.data_updated:', response.data_updated, typeof response.data_updated);
            console.log('🔍 response.updated_data:', !!response.updated_data, typeof response.updated_data);
            
            if (response.data_updated && response.updated_data) {
                console.log('✅ First condition passed: response.data_updated && response.updated_data');
                console.log('🔍 response.updated_data keys:', Object.keys(response.updated_data || {}));
                console.log('🔍 response.updated_data.data:', !!response.updated_data.data, typeof response.updated_data.data);
                console.log('🔍 Array.isArray(response.updated_data.data):', Array.isArray(response.updated_data.data));
                
                if (response.updated_data.data && Array.isArray(response.updated_data.data)) {
                    console.log('✅ Second condition passed: response.updated_data.data && Array.isArray');
                    const newData = response.updated_data.data;
                    console.log('🔍 newData.length:', newData.length);
                    console.log('🔍 newData sample:', newData.slice(0, 2));
                    
                    if (newData.length > 0) {
                        console.log('✅ Third condition passed: newData.length > 0');
                        console.log('🚀 SUCCESS: Dispatching dataUpdate event with', newData.length, 'rows');
                        
                        const dataUpdateEvent = new CustomEvent('dataUpdate', { 
                            detail: { data: newData } 
                        });
                        window.dispatchEvent(dataUpdateEvent);
                        console.log('📊 DataUpdate event dispatched successfully!');
                    } else {
                        console.log('❌ Third condition FAILED: newData.length is 0');
                    }
                } else {
                    console.log('❌ Second condition FAILED: response.updated_data.data missing or not array');
                }
            } else {
                console.log('❌ First condition FAILED: Missing data_updated or updated_data');
                if (!response.data_updated) {
                    console.log('❌ response.data_updated is falsy:', response.data_updated);
                }
                if (!response.updated_data) {
                    console.log('❌ response.updated_data is falsy:', response.updated_data);
                }
            }
            
            // Check if response is a clarification request
            let clarificationData: ClarificationResponse | null = null;
            let isConversationalClarification = false;
            try {
                const responseContent = response.response || response.message || '';
                if (responseContent.includes('"type": "clarification"') || responseContent.includes('"type":"clarification"')) {
                    clarificationData = JSON.parse(responseContent) as ClarificationResponse;
                    console.log('🤔 Clarification detected:', clarificationData);
                } else if (responseContent.includes('"type": "regular"') || responseContent.includes('"type":"regular"')) {
                    // Check if this is a conversational clarification response
                    const jsonResponse = JSON.parse(responseContent);
                    if (jsonResponse.message && jsonResponse.message.includes('I can help you with') && jsonResponse.message.includes('in several ways')) {
                        isConversationalClarification = true;
                        console.log('🤔 Conversational clarification detected');
                    }
                }
            } catch {
                // Not a JSON clarification response, continue normally
            }

            // Remove the analyzing message and add the real response
            setMessages(prev => {
                const newMessages = prev.filter(msg => !msg.isAnalyzing);
                
                if (clarificationData) {
                    // Handle traditional clarification response with buttons
                    const updatedMessages = [...newMessages, { 
                        id: (Date.now() + 1).toString(),
                        role: 'assistant', 
                        type: 'assistant',
                        content: clarificationData.message,
                        clarification: clarificationData,
                        isTyping: false,
                        timestamp: new Date()
                    } as ChatMessage];
                    saveChatMessagesToActiveChat(updatedMessages);
                    return updatedMessages;
                }
                
                if (isConversationalClarification) {
                    // Handle conversational clarification as a regular message
                    const jsonResponse = JSON.parse(response.response || response.message || '');
                    const updatedMessages = [...newMessages, { 
                        id: (Date.now() + 1).toString(),
                        role: 'assistant', 
                        type: 'assistant',
                        content: jsonResponse.message,
                        isTyping: false,  // Display immediately, no typing animation for clarity
                        timestamp: new Date()
                    } as ChatMessage];
                    saveChatMessagesToActiveChat(updatedMessages);
                    return updatedMessages;
                }
                
                // Detect structured responses that should display immediately with proper formatting
                const rawResponseText = response.response || response.message || '';
                const responseText = rawResponseText;
                const hasStructuredContent = responseText.includes('Key Details:') || 
                                            responseText.includes('Why This Matters:') || 
                                            responseText.includes('You might also want to explore:') ||
                                            responseText.includes('- ');
                
                const updatedMessages = [...newMessages, { 
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    type: 'assistant',
                    content: responseText,
                    isTyping: !response.visualization && !hasStructuredContent,
                    visualization: response.visualization ? {
                        type: response.visualization.type,
                        path: response.visualization.path,
                        original_query: response.visualization.original_query || userMessage
                    } : undefined,
                    timestamp: new Date()
                } as ChatMessage];
                
                // Save chat history after successful response
                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });
        } catch (error) {
            console.error('Error in chat submission:', error);
            setMessages(prev => {
                const newMessages = prev.filter(msg => !msg.isAnalyzing);
                const updatedMessages = [...newMessages, {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    type: 'assistant',
                    content: 'Sorry, I encountered an error processing your request.',
                    timestamp: new Date()
                } as ChatMessage];
                
                // Save chat history after error message
                saveChatMessagesToActiveChat(updatedMessages);
                return updatedMessages;
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReset = async () => {
        try {
            await resetState();
            setMessages([]);
            setIsProcessing(false);
            
            // Re-sync backend with current frontend data to restore data context
            if (isDataLoaded && data && data.length > 0 && currentWorkspace?.id) {
                try {
                    console.log('🔄 Re-syncing backend with current data after chat reset...');
                    
                    // Convert current data back to CSV format
                    const headers = Object.keys(data[0]).join(',');
                    const rows = data.map(row => 
                        Object.values(row).map(val => 
                            typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val
                        ).join(',')
                    );
                    const csvContent = [headers, ...rows].join('\n');
                    
                    // Create CSV file
                    const blob = new Blob([csvContent], { type: 'text/csv' });
                    const file = new File([blob], 'workspace_data.csv', { type: 'text/csv' });
                    
                    // Re-upload to backend to restore data handler state
                    await uploadFile(file, currentWorkspace.id);
                    console.log('✅ Backend data context restored after chat reset');
                } catch (error) {
                    console.error('❌ Failed to re-sync backend data after reset:', error);
                    // Don't throw - chat reset should still work even if re-sync fails
                }
            }
            
            // Save empty chat history after reset
            await saveChatMessagesToActiveChat([]);
        } catch (error) {
            console.error('Failed to reset state:', error);
        }
    };

    const handleCancel = async () => {
        try {
            await cancelOperation();
            setIsProcessing(false);
        } catch (error) {
            console.error('Failed to cancel operation:', error);
        }
    };

    // ============================================
    // NEW: Chat Management Functions
    // ============================================

    // Load all chats for current workspace
    const loadWorkspaceChats = useCallback(async () => {
        if (!currentWorkspace?.id) return;
        
        // Use isLoadingChat (singular) because that's what the render condition checks
        setIsLoadingChat(true);
        try {
            const workspaceChats = await loadChats(currentWorkspace.id);
            setChats(workspaceChats);
            
            console.log('🔍 DEBUG - loadWorkspaceChats:', {
                workspaceId: currentWorkspace.id,
                chatsFound: workspaceChats.length,
                currentActiveChat: activeChat?.id,
                currentMessagesCount: messages.length
            });
            
            // Always load the most recent chat if we have chats and no messages are currently loaded
            // This ensures consistent behavior on page reload regardless of activeChat state
            if (workspaceChats.length > 0 && messages.length === 0) {
                const mostRecentChat = workspaceChats[0]; // Already sorted by updated_at DESC
                console.log('📂 Loading most recent chat:', mostRecentChat.id, 'Messages:', mostRecentChat.messages?.length || 0);
                
                setActiveChat(mostRecentChat);
                // Load messages using the dedicated loadChatMessages function for consistency
                const chatMessages = await loadChatMessages(mostRecentChat.id);
                setMessages(chatMessages);
                
                console.log('✅ Loaded most recent chat on workspace load:', mostRecentChat.id);
                
                // Keep loading state active until messages are loaded to prevent welcome screen flash
                // setIsLoadingChats(false) is called in the finally block after everything is complete
            } else if (workspaceChats.length === 0) {
                // No chats exist, ensure clean state
                setActiveChat(null);
                setMessages([]);
                console.log('📭 No chats found for workspace, showing welcome screen');
            }
            // Note: Don't set isLoadingChats = false here, let finally block handle it
        } catch (error) {
            console.error('❌ Failed to load chats:', error);
            setChats([]);
            setActiveChat(null);
            setMessages([]);
        } finally {
            // Only set loading to false after everything is complete (including messages)
            // This prevents the welcome screen flash during the gap between chat load and message load
            setIsLoadingChat(false);
        }
    }, [currentWorkspace, activeChat, messages.length]);

    // Create a new chat
    const handleCreateNewChat = async () => {
        if (!currentWorkspace?.id || isCreatingChat) return;

        setIsCreatingChat(true);
        try {
            const newChat = await createNewChat(currentWorkspace.id, 'New Chat');

            // Add to chat list
            setChats(prev => [newChat, ...prev]);

            // Switch to new chat
            setActiveChat(newChat);
            setMessages([]);

            console.log('✅ New chat created and switched to:', newChat.id);
        } catch (error) {
            console.error('❌ Failed to create new chat:', error);
            alert('Failed to create new chat. Please try again.');
        } finally {
            setIsCreatingChat(false);
        }
    };

    // Save worksheet data (learn mode)
    const handleSaveWorksheet = async () => {
        if (!currentWorkspace?.id || isSaving || mode !== 'learn') return;

        setIsSaving(true);
        setSaveStatus('saving');

        try {
            // Get current live data from spreadsheet (not the stale prop)
            const currentData = (getCurrentData ? getCurrentData() : data) || [];
            const currentDataLength = Array.isArray(currentData) ? currentData.length : 0;
            console.log('💾 [Save] Saving worksheet data...', currentDataLength, 'rows');
            if (Array.isArray(currentData)) {
                console.log('💾 [Save] First 2 rows of data being saved:', JSON.stringify(currentData.slice(0, 2), null, 2));
            }
            
            // Capture full sheet snapshot for exact restore
            let sheetState: any = undefined;
            try {
                if (typeof window !== 'undefined' && (window as any).luckysheet?.getAllSheets) {
                    const sheets = (window as any).luckysheet.getAllSheets();
                    if (Array.isArray(sheets) && sheets.length > 0) {
                        sheetState = sheets;
                        console.log('💾 [Save] Captured sheet_state snapshot');
                    }
                }
            } catch {}
            
            await saveWorkspaceData(currentWorkspace.id, currentData, filename, sheetState);
            console.log('✅ [Save] Worksheet saved successfully');

            setSaveStatus('saved');

            // Reset to idle after 2 seconds
            setTimeout(() => {
                setSaveStatus('idle');
            }, 2000);
        } catch (error) {
            console.error('❌ [ChatSidebar] Failed to save worksheet:', error);
            setSaveStatus('error');

            // Reset to idle after 3 seconds
            setTimeout(() => {
                setSaveStatus('idle');
            }, 3000);
        } finally {
            setIsSaving(false);
        }
    };

    // Cycle through chats (loop arrow functionality)
    const handleCycleChat = async () => {
        if (chats.length <= 1) return; // Nothing to cycle through

        try {
            // Save current chat messages before switching
            if (activeChat && messages.length > 0) {
                console.log('💾 Saving current chat messages before cycling...');
                await saveChatMessages(activeChat.id, messages);
            }

            // Find current chat index
            const currentIndex = chats.findIndex(chat => chat.id === activeChat?.id);
            
            // Get next chat (cycle back to 0 if at end)
            const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % chats.length : 0;
            const nextChat = chats[nextIndex];
            
            // Switch to next chat
            setActiveChat(nextChat);
            
            // Load messages for the next chat
            const chatMessages = await loadChatMessages(nextChat.id);
            setMessages(chatMessages);
            
            console.log('🔄 Cycled to chat:', nextChat.id, 'Messages loaded:', chatMessages.length);
        } catch (error) {
            console.error('❌ Failed to cycle chat:', error);
            alert('Failed to cycle chat. Please try again.');
        }
    };

    // Load chats when workspace changes
    useEffect(() => {
        if (currentWorkspace?.id) {
            loadWorkspaceChats();
        } else {
            setChats([]);
            setActiveChat(null);
            setMessages([]);
        }
    }, [currentWorkspace?.id, loadWorkspaceChats]);

    // Helper function to download chart
    const downloadChart = async (visualizationPath: string, visualizationType: string) => {
        try {
            const fullUrl = `${API_BASE_URL}${visualizationPath}`;
            const response = await fetch(fullUrl);
            
            if (!response.ok) {
                throw new Error('Failed to fetch chart');
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            
            const filename = visualizationPath.split('/').pop() || 
                           `chart_${Date.now()}.${visualizationType === 'plotly_html' ? 'html' : 'png'}`;
            
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading chart:', error);
            alert('Failed to download chart. Please try again.');
        }
    };


    return (
        <div
            className={isExpanded ? 'w-[28rem] backdrop-blur-sm border-r border-border transition-all duration-300' : 'w-16 backdrop-blur-sm border-r border-border transition-all duration-300'}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: '100%',
                background: `linear-gradient(135deg, rgba(34, 211, 238, 0.28), transparent 40%),
                           linear-gradient(225deg, rgba(236, 72, 153, 0.28), transparent 45%),
                           linear-gradient(180deg, #000, #000)`,
                overflow: 'hidden',
                zIndex: 10
            }}
        >
            {/* Header - Fixed Height: 64px */}
            <div 
                className="p-4 bg-background transition-all duration-300 ease-in-out"
                style={{ height: '64px', overflow: 'hidden' }}
            >
                <div className="flex items-center justify-between h-full">
                    <button
                        onClick={onToggle}
                        className="w-10 h-10 flex items-center justify-center rounded-full bg-black hover:bg-black/80 border border-white/10 transition-all duration-200 text-white/80 hover:text-white shadow-sm hover:shadow-md"
                    >
                        <Image 
                            src="/sidebar.png" 
                            alt="Toggle sidebar" 
                            width={20} 
                            height={20}
                            className="opacity-75 hover:opacity-100 transition-opacity duration-200"
                        />
                    </button>
                    
                    {/* Chat Controls in Header */}
                    {isExpanded && (
                        <div className="flex items-center gap-3">
                            {/* New Chat */}
                            <button
                                onClick={() => handleCreateNewChat()}
                                disabled={isCreatingChat || !currentWorkspace?.id}
                                className="bg-black hover:bg-black/90 text-white px-3 py-2 rounded-md font-medium transition-all duration-200 border border-white/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isCreatingChat ? (
                                    <div className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <Plus className="w-4 h-4" />
                                )}
                                <span className="text-sm">New Chat</span>
                            </button>

                            {/* Save Button (Learn Mode Only) */}
                            {mode === 'learn' && (
                                <button
                                    onClick={handleSaveWorksheet}
                                    disabled={isSaving || !currentWorkspace?.id}
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-2 rounded-md font-medium transition-all duration-200 border border-primary/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Save your practice work"
                                >
                                    {saveStatus === 'saving' ? (
                                        <div className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin"></div>
                                    ) : saveStatus === 'saved' ? (
                                        <Check className="w-4 h-4" />
                                    ) : saveStatus === 'error' ? (
                                        <span className="text-xs">✗</span>
                                    ) : (
                                        <Save className="w-4 h-4" />
                                    )}
                                    <span className="text-sm">
                                        {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Error' : 'Save'}
                                    </span>
                                </button>
                            )}

                            {/* Spreadsheet Engine Toggle */}
                            <button
                                onClick={toggleSpreadsheetEngine}
                                className="flex items-center justify-center w-6 h-6 text-sidebar-foreground hover:text-sidebar-foreground/80 transition-colors"
                                title={isUniverEnabled() ? "Switch to Luckysheet" : "Switch to Univer (Beta)"}
                            >
                                <Zap className={`w-4 h-4 ${isUniverEnabled() ? 'text-yellow-400' : 'text-gray-400'}`} />
                            </button>

                            {/* Cycle Arrow */}
                            <button
                                onClick={() => handleCycleChat()}
                                disabled={chats.length <= 1}
                                className="flex items-center justify-center w-6 h-6 text-sidebar-foreground hover:text-sidebar-foreground/80 disabled:text-sidebar-foreground/30 disabled:cursor-not-allowed transition-colors"
                                title="Cycle through chats"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
            </div>


            {/* Messages Area - Calculated Height */}
            {isExpanded && (
                <div 
                    className="p-4 space-y-4 bg-transparent"
                    data-scroll-container
                    style={{ 
                        height: 'calc(100% - 244px)', /* 64px header + 180px input */
                        overflowY: 'auto',
                        overflowX: 'hidden'
                    }}
                >
                    {isLoadingChat ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="text-center text-muted-foreground">
                                <div className="w-8 h-8 border-2 border-foreground border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                                <p className="text-sm">Loading chats...</p>
                            </div>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="text-sidebar-foreground text-sm space-y-6">
                            {/* Welcome Section */}
                            <div className="text-center mt-6">
                                <div className="p-3 bg-card rounded-full w-fit mx-auto mb-4 border border-border">
                                    <svg className="w-8 h-8 text-sidebar-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-semibold text-white mb-2">Welcome to EDI.ai</h3>
                                <p className="text-muted-foreground text-xs">{minimal ? 'Your learning companion for spreadsheets' : 'Your intelligent data analysis companion'}</p>
                            </div>

                            {/* Learn-mode onboarding tooltip */}
                            {mode === 'learn' && (
                                <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-xs text-primary">
                                    Say &quot;hi&quot; to EDI.ai to start your learning journey. I&apos;ll ask a couple of quick questions about your level and goals, then guide you step by step.
                                </div>
                            )}

                            {/* Learning Guide (moved above instructions) */}
                            {mode === 'learn' && learningTips.length > 0 && (
                                <div className="rounded-lg border border-border bg-card/50">
                                    <div className="p-4">
                                        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                                            <div className="w-2 h-2 bg-primary rounded-full"></div>
                                            Learning Guide
                                        </h3>

                                        <div className="space-y-3">
                                            {learningTips.map((tip, index) => (
                                                <div
                                                    key={tip.id}
                                                    className={`p-3 rounded-lg border transition-all ${
                                                        index === currentTipIndex
                                                            ? 'border-primary bg-primary/10'
                                                            : 'border-border bg-background/50'
                                                    }`}
                                                >
                                                    <div className="flex items-start gap-2">
                                                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                                                            tip.completed ? 'bg-green-500' : 'bg-primary'
                                                        }`} />
                                                        <div className="flex-1 min-w-0">
                                                            <h4 className="text-sm font-medium text-foreground">
                                                                {tip.title}
                                                            </h4>
                                                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                                                {tip.description}
                                                            </p>
                                                            {tip.example && (
                                                                <div className="mt-2 p-2 bg-muted/30 rounded text-xs">
                                                                    <code className="text-foreground">{tip.example}</code>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {learningTips.length > 1 && (
                                            <div className="flex items-center gap-2 mt-3">
                                                <button
                                                    onClick={() => setCurrentTipIndex(Math.max(0, currentTipIndex - 1))}
                                                    disabled={currentTipIndex === 0}
                                                    className="px-2 py-1 text-xs bg-muted hover:bg-muted/80 text-muted-foreground rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Previous
                                                </button>
                                                <div className="flex-1 flex justify-center gap-1">
                                                    {learningTips.map((_, index) => (
                                                        <div
                                                            key={index}
                                                            className={`w-1.5 h-1.5 rounded-full transition-colors ${
                                                                index === currentTipIndex ? 'bg-primary' : 'bg-muted-foreground/30'
                                                            }`}
                                                        />
                                                    ))}
                                                </div>
                                                <button
                                                    onClick={() => setCurrentTipIndex(Math.min(learningTips.length - 1, currentTipIndex + 1))}
                                                    disabled={currentTipIndex === learningTips.length - 1}
                                                    className="px-2 py-1 text-xs bg-primary text-primary-foreground hover:bg-primary/90 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Next
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Instructions removed per request */}

                            {!isDataLoaded && (
                                <div className="bg-muted/20 border border-border rounded-lg p-3">
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L5.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                        </svg>
                                        <span className="text-xs font-medium">Upload data to start chatting</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        messages.map((message, index) => (
                            <div key={index} className={`${message.role === 'user' ? 'ml-4' : 'mr-4'}`}>
                                <div className={`rounded-lg p-3 text-sm ${
                                    message.role === 'user'
                                        ? 'bg-black text-white border border-white/10 ml-auto max-w-[85%]'
                                        : 'bg-black text-white border border-white/10 max-w-[95%]'
                                }`}>
                                    {message.isAnalyzing ? (
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 border border-muted-foreground border-t-transparent rounded-full animate-spin"></div>
                                            <span className="text-muted-foreground">Analyzing...</span>
                                        </div>
                                    ) : (() => {
                                        const raw = message.content || '';
                                        const hasBullets = /[\n\r]\s*[-*•]\s+|^\s*[-*•]\s+|\s•\s/.test(raw);
                                        const normalized = raw
                                            .replace(/\s•\s/g, '\n- ')
                                            .replace(/^\s*•\s+/gm, '- ');
                                        const shouldType = message.isTyping && !hasBullets;
                                        return shouldType ? (
                                            <TypeAnimation
                                                sequence={[normalized]}
                                                wrapper="div"
                                                speed={90}
                                                cursor={false}
                                                repeat={1}
                                            />
                                        ) : (
                                            <>
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    className={`markdown-content max-w-none ${message.role === 'user' ? 'text-secondary-foreground' : 'text-card-foreground'}`}
                                                >
                                                    {normalized}

                                                </ReactMarkdown>
                                                {message.visualization && (
                                                    <div className="mt-3 space-y-2">
                                                        {message.visualization.type === 'matplotlib_figure' ? (
                                                            <>
                                                                <div className="relative w-full max-w-2xl mx-auto">
                                                                    <Image
                                                                        src={`${API_BASE_URL}${message.visualization?.path ?? ''}`}
                                                                        alt="Data Visualization"
                                                                        width={800}
                                                                        height={400}
                                                                        className="rounded-lg w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
                                                                        style={{ maxHeight: '400px' }}
                                                                        onClick={() => message.visualization && setExpandedImage(`${API_BASE_URL}${message.visualization.path}`)}
                                                                    />
                                                                </div>
                                                                <button
                                                                    onClick={() => downloadChart(message.visualization!.path, message.visualization!.type)}
                                                                    className="w-full text-xs bg-black hover:bg-black/90 text-white rounded py-1 px-2 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 border border-white/20"
                                                                >
                                                                    Save Chart
                                                                </button>
                                                            </>
                                                        ) : message.visualization.type === 'plotly_html' ? (
                                                            <>
                                                                <iframe
                                                                    src={`${API_BASE_URL}${message.visualization.path}`}
                                                                    className="w-full h-40 rounded-lg border-0"
                                                                />
                                                                <button
                                                                    onClick={() => downloadChart(message.visualization!.path, message.visualization!.type)}
                                                                    className="w-full text-xs bg-black hover:bg-black/90 text-white rounded py-1 px-2 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 border border-white/20"
                                                                >
                                                                    Save Chart
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <div className="p-2 bg-yellow-100 border border-yellow-300 rounded text-yellow-800 text-sm">
                                                                ⚠️ Unknown visualization type: {message.visualization.type}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        ))
                    )}
                    <div ref={messagesEndRef} />
                </div>
            )}

            {/* Input Area - Fixed Height: 180px */}
            {isExpanded && (
                <div 
                    className="p-4 bg-transparent"
                    style={{ 
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: '180px',
                        overflow: 'hidden'
                    }}
                >
                    {/* Voice Status Indicator */}
                    {isListening && (
                        <div className="mb-3 p-3 bg-muted/20 border border-border rounded-lg">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <div className="w-2 h-2 bg-destructive rounded-full animate-pulse"></div>
                                <span className="text-sm font-medium">Listening... Speak now</span>
                            </div>
                        </div>
                    )}
                    
                    {/* AI Prompt Component */}
                    <AIPrompt
                        value={input}
                        onChange={setInput}
                        onSubmit={(value, mode) => {
                            // Map the mode to the existing queryMode system
                            const modeMap: Record<string, 'simple' | 'complex'> = {
                                'Simple': 'simple',
                                'Advanced': 'complex',
                                'Deep Reasoning': 'complex',
                            };
                            setQueryMode(modeMap[mode] || 'simple');
                            setInput(value);
                            
                            // Trigger the existing handleSubmit logic
                            const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
                            handleSubmit(fakeEvent);
                        }}
                        onFileUpload={minimal ? undefined : () => {
                            if (onFileUpload) {
                                // Create a hidden file input and trigger it
                                const fileInput = document.createElement('input');
                                fileInput.type = 'file';
                                fileInput.accept = '.csv,.xlsx,.xls';
                                fileInput.multiple = false; // Match the direct file input behavior
                                fileInput.style.display = 'none';
                                
                                fileInput.onchange = () => {
                                    // Pass a minimal synthetic event compatible with our handler
                                    const syntheticEvent = {
                                        target: fileInput,
                                    } as unknown as React.ChangeEvent<HTMLInputElement>;
                                    onFileUpload(syntheticEvent);
                                    
                                    // Clean up after the handler completes
                                    setTimeout(() => {
                                        if (document.body.contains(fileInput)) {
                                            document.body.removeChild(fileInput);
                                        }
                                    }, 100);
                                };
                                
                                document.body.appendChild(fileInput);
                                fileInput.click();
                            }
                        }}
                        disabled={!isDataLoaded}
                        isProcessing={isProcessing}
                        placeholder={minimal ? "Ask your Learn Assistant..." : (isDataLoaded ? "Ask about your data or use voice command..." : "Upload data first...")}
                        selectedMode={minimal ? 'Simple' : (queryMode === 'simple' ? 'Simple' : 'Advanced')}
                        onModeChange={minimal ? undefined : (mode) => {
                            const modeMap: Record<string, 'simple' | 'complex'> = {
                                'Simple': 'simple',
                                'Advanced': 'complex',
                                'Deep Reasoning': 'complex',
                            };
                            setQueryMode(modeMap[mode] || 'simple');
                        }}
                        minimal={minimal}
                        additionalButtons={minimal ? undefined : (
                            <>
                                {/* Voice Button */}
                                {onStartVoiceRecognition && onStopVoiceRecognition && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (isListening) {
                                                onStopVoiceRecognition?.();
                                            } else {
                                                onStartVoiceRecognition?.();
                                            }
                                        }}
                                        disabled={isProcessingCommand || !isDataLoaded}
                                        className="rounded-lg p-2 bg-white/5 hover:bg-white/10 transition-colors text-white/80 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                        title={isListening ? 'Stop Recording' : 'Voice Command'}
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                        </svg>
                                    </button>
                                )}
                                {/* Reset chat button */}
                                {messages.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleReset}
                                        className="rounded-lg p-2 bg-white/5 hover:bg-white/10 transition-colors text-white/80 hover:text-white"
                                        title="Reset chat"
                                        aria-label="Reset chat"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M3 2v6h6" />
                                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L3 8" />
                                        </svg>
                                    </button>
                                )}
                                {/* Cancel button when processing */}
                                {isProcessing && (
                                    <button
                                        type="button"
                                        onClick={handleCancel}
                                        className="rounded-lg p-2 bg-red-600/20 hover:bg-red-600/30 transition-colors text-red-400 hover:text-red-300"
                                        title="Cancel processing"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                )}
                            </>
                        )}
                    />
                    
                    {/* Clear Chat Button - Always in fixed input area */}
                    {false && messages.length > 0 && (
                        <button
                            onClick={handleReset}
                            className="w-full mt-2 px-3 py-2 bg-black text-white border border-white/20 rounded-lg hover:bg-black/90 transition-colors duration-150 text-sm"
                        >
                            Clear Chat
                        </button>
                    )}
                    
                </div>
            )}

            {/* Learning Tips Section moved above; removed bottom duplicate */}

            {/* Expanded Image Modal - Using React Portal */}
            {expandedImage && typeof document !== 'undefined' && createPortal(
                <div 
                    className="visualization-modal-overlay fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4"
                    onClick={() => setExpandedImage(null)}
                    onKeyDown={(e) => e.key === 'Escape' && setExpandedImage(null)}
                    tabIndex={-1}
                >
                    <div className="relative max-w-7xl max-h-full">
                        <button
                            onClick={() => setExpandedImage(null)}
                            className="visualization-modal-close absolute -top-2 -right-2 text-white text-3xl hover:text-gray-300 bg-black bg-opacity-75 rounded-full w-12 h-12 flex items-center justify-center border-2 border-white hover:border-gray-300 transition-all"
                            aria-label="Close expanded image"
                        >
                            ×
                        </button>
                        <Image
                            src={expandedImage}
                            alt="Expanded Data Visualization"
                            width={1600}
                            height={1200}
                            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                            draggable={false}
                        />
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}