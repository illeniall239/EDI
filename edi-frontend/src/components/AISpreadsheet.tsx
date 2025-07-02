'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWorkspace } from '@/contexts/WorkspaceContext';

interface AISpreadsheetProps {
  sheetId?: string;
  data?: Array<any>;
  onCommand?: (command: string) => Promise<any>;
}

interface UndoHistoryInfo {
  available_undos: number;
  history: Array<{
    timestamp: string;
    index: number;
  }>;
}

export default function AISpreadsheet({ sheetId, data, onCommand }: AISpreadsheetProps) {
  const [isProcessingCommand, setIsProcessingCommand] = useState(false);
  const [commandResult, setCommandResult] = useState<string | null>(null);
  const [voiceCommand, setVoiceCommand] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [showCommandPanel, setShowCommandPanel] = useState(true);
  const [undoHistory, setUndoHistory] = useState<UndoHistoryInfo>({ available_undos: 0, history: [] });
  const [isUndoing, setIsUndoing] = useState(false);
  const { currentWorkspace } = useWorkspace();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Voice recognition setup
  const [recognition, setRecognition] = useState<any>(null);

  useEffect(() => {
    // Initialize speech recognition if available
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      const recognitionInstance = new SpeechRecognition();
      
      recognitionInstance.continuous = false;
      recognitionInstance.interimResults = false;
      recognitionInstance.lang = 'en-US';
      
      recognitionInstance.onresult = (event: any) => {
        const command = event.results[0][0].transcript;
        setVoiceCommand(command);
        handleVoiceCommand(command);
      };
      
      recognitionInstance.onend = () => {
        setIsListening(false);
      };
      
      recognitionInstance.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };
      
      setRecognition(recognitionInstance);
    }
  }, []);

  // Keyboard shortcut for undo (Ctrl+Z)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [sheetId]);

  // Load undo history when sheet changes
  useEffect(() => {
    if (sheetId) {
      // Note: Undo functionality will be handled by the native spreadsheet
    }
  }, [sheetId]);

  const handleUndo = async () => {
    // Note: This will be handled by the native spreadsheet component
    console.log('Undo will be handled by native spreadsheet');
  };

  const handleVoiceCommand = async (command: string) => {
    if (!command.trim() || !onCommand) return;
    
    setIsProcessingCommand(true);
    setCommandResult(null);
    
    try {
      const result = await onCommand(command);
      setCommandResult(result.message || 'Command executed successfully');
      
      // Reload undo history after successful command
      if (result.success) {
        // Note: Undo functionality will be handled by the native spreadsheet
      }
      
      // Auto-hide result after 3 seconds
      setTimeout(() => setCommandResult(null), 3000);
    } catch (error) {
      setCommandResult('Failed to execute command');
      setTimeout(() => setCommandResult(null), 3000);
    } finally {
      setIsProcessingCommand(false);
    }
  };

  const startVoiceRecognition = () => {
    if (recognition && !isListening) {
      setIsListening(true);
      recognition.start();
    }
  };

  const stopVoiceRecognition = () => {
    if (recognition && isListening) {
      recognition.stop();
      setIsListening(false);
    }
  };

  const handleTextCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (voiceCommand.trim()) {
      await handleVoiceCommand(voiceCommand);
      setVoiceCommand('');
    }
  };

  return (
    <div className="h-screen flex bg-gray-50">
      {/* Left Sidebar - EDI Controls */}
      <AnimatePresence>
        {showCommandPanel && (
          <motion.div
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="w-80 bg-white border-r border-gray-200 flex flex-col shadow-lg"
          >
            {/* Header */}
            <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-emerald-600 to-emerald-700">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-white">EDI Assistant</h2>
                  <p className="text-emerald-100 text-sm">
                    {currentWorkspace?.name || 'AI Spreadsheet'}
                  </p>
                </div>
                <button
                  onClick={() => setShowCommandPanel(false)}
                  className="text-emerald-100 hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Undo Section */}
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-medium text-gray-900 mb-3">Undo Actions</h3>
              
              <div className="space-y-3">
                <button
                  onClick={handleUndo}
                  disabled={undoHistory.available_undos === 0 || isUndoing}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 text-sm ${
                    undoHistory.available_undos > 0 && !isUndoing
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {isUndoing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Undoing...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                      Undo (Ctrl+Z)
                    </>
                  )}
                </button>

                <div className="text-xs text-gray-500 text-center">
                  {undoHistory.available_undos > 0 
                    ? `${undoHistory.available_undos} action${undoHistory.available_undos !== 1 ? 's' : ''} available to undo`
                    : 'No actions to undo'
                  }
                </div>
                
                {undoHistory.available_undos > 0 && (
                  <div className="text-xs text-blue-600 text-center bg-blue-50 p-2 rounded">
                    💡 Press Ctrl+Z anywhere to undo
                  </div>
                )}
              </div>
            </div>

            {/* Voice Command Section */}
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-medium text-gray-900 mb-3">Voice Commands</h3>
              
              <div className="space-y-3">
                <button
                  onClick={isListening ? stopVoiceRecognition : startVoiceRecognition}
                  disabled={isProcessingCommand}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all duration-200 ${
                    isListening
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isListening ? (
                    <>
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                      Stop Listening
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                      Start Voice Command
                    </>
                  )}
                </button>

                {isListening && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center text-sm text-gray-600 bg-gray-50 p-3 rounded-lg"
                  >
                    🎤 Listening... Say your command now
                  </motion.div>
                )}
              </div>
            </div>

            {/* Text Command Section */}
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-medium text-gray-900 mb-3">Text Commands</h3>
              
              <form onSubmit={handleTextCommand} className="space-y-3">
                <textarea
                  value={voiceCommand}
                  onChange={(e) => setVoiceCommand(e.target.value)}
                  placeholder="Type your command here... (e.g., 'Make column A wider', 'Sort by date descending', 'undo')"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-transparent text-gray-900 placeholder-gray-500"
                  rows={3}
                  disabled={isProcessingCommand}
                />
                <button
                  type="submit"
                  disabled={!voiceCommand.trim() || isProcessingCommand}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {isProcessingCommand ? 'Processing...' : 'Execute Command'}
                </button>
              </form>
            </div>

            {/* Command Examples */}
            <div className="p-4 flex-1 overflow-y-auto">
              <h3 className="font-medium text-gray-900 mb-3">Example Commands</h3>
              
              <div className="space-y-2 text-sm">
                {[
                  "Make column A wider",
                  "Sort by date descending", 
                  "Format sales column as currency",
                  "Add sum formula to bottom",
                  "Make header row bold",
                  "Freeze the first row",
                  "Create a chart from this data",
                  "Undo last action"
                ].map((example, index) => (
                  <button
                    key={index}
                    onClick={() => setVoiceCommand(example)}
                    className="w-full text-left p-2 text-gray-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                  >
                    "{example}"
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Spreadsheet Area */}
      <div className="flex-1 relative">
        {/* Toggle Panel Button */}
        {!showCommandPanel && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setShowCommandPanel(true)}
            className="absolute top-4 left-4 z-20 bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-lg shadow-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </motion.button>
        )}

        {/* Processing Indicator */}
        <AnimatePresence>
          {(isProcessingCommand || isUndoing) && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-4 right-4 z-20 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2"
            >
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              {isUndoing ? 'Undoing changes...' : 'EDI is updating your spreadsheet...'}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Command Result */}
        <AnimatePresence>
          {commandResult && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`absolute top-4 right-4 z-20 px-4 py-2 rounded-lg shadow-lg ${
                commandResult.startsWith('✅') ? 'bg-green-600' : 'bg-red-600'
              } text-white`}
            >
              {commandResult}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Native Spreadsheet Message */}
        <div className="flex items-center justify-center h-full bg-gradient-to-br from-emerald-50 to-blue-50">
          <div className="text-center max-w-md mx-auto p-8">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">🚀 Native Spreadsheet Available!</h3>
            <p className="text-gray-600 mb-6 leading-relaxed">
              We've upgraded to a lightning-fast native spreadsheet with instant undo/redo, 
              perfect AI integration, and no Google Sheets limitations!
            </p>
            <div className="bg-white rounded-lg p-4 shadow-sm border border-emerald-200 mb-6">
              <h4 className="font-semibold text-emerald-800 mb-2">✨ New Features:</h4>
              <ul className="text-sm text-gray-700 space-y-1 text-left">
                <li>• Instant Ctrl+Z undo/redo</li>
                <li>• Real-time AI commands</li>
                <li>• No API rate limits</li>
                <li>• Lightning-fast performance</li>
                <li>• Full offline capability</li>
              </ul>
            </div>
            <p className="text-sm text-gray-500">
              Upload your data in the workspace to experience the new native spreadsheet!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 