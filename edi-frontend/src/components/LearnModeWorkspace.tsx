'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Workspace } from '@/types';
import { SKILL_CONCEPTS } from '@/components/learn/SkillTreePanel';
import { useRouter } from 'next/navigation';
import { API_ENDPOINTS } from '@/config';
import { useLearnMode } from '@/contexts/LearnModeContext';
import SpreadsheetWrapper from '@/components/SpreadsheetWrapper';
import { loadWorkspaceData, saveWorkspaceData } from '@/utils/api';

interface LearnModeWorkspaceProps {
  workspace: Workspace;
}

export default function LearnModeWorkspace({ workspace }: LearnModeWorkspaceProps) {
  const [activeView, setActiveView] = useState<'onboarding' | 'cards' | 'topic' | 'sandbox'>('sandbox');
  const [onboardStep, setOnboardStep] = useState<number>(0);
  const { initialize, selectedConcept, selectConcept, getPracticeChallenge, activeChallenge, datasets } = useLearnMode();
  const router = useRouter();
  const [practiceData, setPracticeData] = useState<any[]>([]);
  const [practiceFilename, setPracticeFilename] = useState<string | undefined>();
  const [isGenerating, setIsGenerating] = useState<boolean>(true);
  const generatedOnceRef = React.useRef(false);
  const [initialSheets, setInitialSheets] = useState<any[] | undefined>(undefined);

  // Store Univer adapter reference for state persistence
  const univerAdapterRef = useRef<any>(null);

  // Callback to receive Univer adapter reference
  const handleAdapterReady = (adapter: any) => {
    console.log('📊 [LearnModeWorkspace] Univer adapter ready for persistence');
    univerAdapterRef.current = adapter;
  };

  // Helper function to save data to workspace
  const saveDataToWorkspace = useCallback(async (newData: any[], filename?: string) => {
    if (!workspace?.id) return;

    try {
      // Capture full sheet state if available (for both Luckysheet and Univer)
      let sheetState: any = undefined;

      try {
        // Try Luckysheet first (for backward compatibility)
        if (typeof window !== 'undefined' && (window as any).luckysheet?.getAllSheets) {
          const sheets = (window as any).luckysheet.getAllSheets();
          if (Array.isArray(sheets) && sheets.length > 0) {
            sheetState = sheets;
            console.log('💾 [LearnMode] Captured Luckysheet sheet_state snapshot');
          }
        }
        // Try Univer adapter if available
        else if (univerAdapterRef.current && typeof univerAdapterRef.current.getWorkbookSnapshot === 'function') {
          console.log('💾 [LearnMode] Getting Univer workbook snapshot...');
          sheetState = await univerAdapterRef.current.getWorkbookSnapshot();
          if (sheetState) {
            console.log('💾 [LearnMode] Captured Univer sheet_state snapshot');
          }
        }
      } catch (error) {
        console.warn('⚠️ [LearnMode] Failed to capture sheet_state:', error);
        // Continue with data-only save if sheet state capture fails
      }

      await saveWorkspaceData(workspace.id, newData, filename, sheetState);
      console.log('💾 [LearnMode] Data saved to workspace successfully');
    } catch (error) {
      console.error('❌ [LearnMode] Failed to save data to workspace:', error);
      // Don't show error to user as this is auto-save
    }
  }, [workspace?.id]);

  // Load initial data
  useEffect(() => {
    if (workspace?.id) {
      initialize(workspace.id);
      loadWorkspaceData(workspace.id)
        .then((saved) => {
          if (saved && saved.data) {
            console.log('📥 [Load] Loaded data from workspace:', saved.data.length, 'rows');
            console.log('📥 [Load] First 2 rows loaded:', JSON.stringify(saved.data.slice(0, 2), null, 2));
            setPracticeData(saved.data);
            setPracticeFilename(saved.filename);
            setIsGenerating(false);
            // If a full sheet snapshot is available, prefer it for exact restore
            if (saved.sheetState && Array.isArray(saved.sheetState)) {
              console.log('📥 [Load] sheet_state detected for Learn mode; passing to SpreadsheetWrapper');
              setInitialSheets(saved.sheetState);
            } else {
              setInitialSheets(undefined);
            }
          } else {
            setPracticeData([]);
            setPracticeFilename(undefined);
            // No saved data, generate a generic practice dataset (20 rows)
            if (!generatedOnceRef.current) {
              generatedOnceRef.current = true;
              (async () => {
                try {
                  setIsGenerating(true);
                  await fetch(API_ENDPOINTS.resetState, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                  const body = {
                    description: 'Generate a generic business dataset with a mix of text and numeric columns suitable for spreadsheet practice. Include columns like Date, Product, Quantity, Unit Price, Sales with realistic values.',
                    rows: 20
                  } as any;
                  const res = await fetch(API_ENDPOINTS.generateSyntheticDataset, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                  });
                  const result = await res.json();
                  const ds = result?.data || [];
                  setPracticeData(Array.isArray(ds) ? ds : []);
                  setPracticeFilename('practice_learn_mode.csv');

                  // Save the generated dataset immediately so it persists across reloads
                  console.log('💾 [LearnMode] Saving initial generated dataset...');
                  await saveDataToWorkspace(Array.isArray(ds) ? ds : [], 'practice_learn_mode.csv');
                  console.log('✅ [LearnMode] Initial dataset saved successfully');
                } catch (e) {
                  console.error('LearnMode initial dataset generation failed:', e);
                } finally {
                  setIsGenerating(false);
                }
              })();
            }
          }
        })
        .catch(() => setPracticeData([]));
    }
  }, [workspace?.id, initialize, saveDataToWorkspace]);

  // When entering sandbox or challenge updates, prefer curated dataset for the selected concept
  useEffect(() => {
    if (activeView !== 'sandbox') return;

    // 1) Use practice challenge dataset if available
    const challengeDataset = activeChallenge && (activeChallenge.dataset || activeChallenge.data || activeChallenge.dataset_json);
    if (challengeDataset && Array.isArray(challengeDataset) && challengeDataset.length > 0) {
      setPracticeData(challengeDataset);
      setPracticeFilename(`practice_${selectedConcept || 'concept'}.csv`);
      return;
    }

    // 2) Try curated datasets list by concept
    if (datasets && Array.isArray(datasets) && datasets.length > 0) {
      const match = datasets.find((d: any) => d.concept_category === (selectedConcept || '').toString());
      const ds = match && (match.dataset || match.dataset_json || match.data);
      if (ds && Array.isArray(ds) && ds.length > 0) {
        setPracticeData(ds);
        setPracticeFilename(`practice_${selectedConcept || 'concept'}.csv`);
        return;
      }
    }
    // 3) Otherwise keep current data (possibly user's saved copy)
  }, [activeView, activeChallenge, selectedConcept, datasets]);

  // Event listener for dataUpdate events (for synthetic dataset generation)
  useEffect(() => {
    const handleDataUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { data: newData, filename: newFilename } = customEvent.detail || {};

      if (newData && Array.isArray(newData)) {
        console.log('📊 [LearnMode] Data update event received, saving to workspace...');
        setPracticeData(newData);
        if (newFilename) {
          setPracticeFilename(newFilename);
        }

        // Save to workspace in background
        saveDataToWorkspace(newData, newFilename || practiceFilename)
          .then(() => {
            console.log('✅ [LearnMode] Background save completed');
          })
          .catch((error) => {
            console.error('❌ [LearnMode] Background save failed:', error);
          });
      }
    };

    window.addEventListener('dataUpdate', handleDataUpdate as EventListener);

    return () => {
      window.removeEventListener('dataUpdate', handleDataUpdate as EventListener);
    };
  }, [workspace?.id, practiceFilename, saveDataToWorkspace]);

  // Handle data updates from spreadsheet (manual edits, etc.)
  const handleDataUpdate = (newData: any[]) => {
    console.log('📝 [LearnMode] Data updated, persisting changes...');
    setPracticeData(newData);

    // Save to workspace (background operation)
    saveDataToWorkspace(newData, practiceFilename)
      .then(() => {
        console.log('✅ [LearnMode] Manual edit saved successfully');
      })
      .catch((error) => {
        console.error('❌ [LearnMode] Failed to save manual edit:', error);
      });
  };

  return (
    <div className="h-screen bg-background overflow-hidden">
      {/* Header removed per request */}

      {/* Main Learning Area */}
      <div className="flex h-full bg-background relative">
        {(activeView === 'onboarding' || activeView === 'cards') && (
          <div className="absolute inset-0 z-0 pointer-events-none bg-[linear-gradient(135deg,rgba(34,211,238,0.18),transparent_40%),linear-gradient(225deg,rgba(236,72,153,0.18),transparent_45%),linear-gradient(180deg,#000,#000)]" />
        )}
        {activeView === 'onboarding' ? (
          <div className="flex-1 px-6 md:px-10 lg:px-14 overflow-y-auto flex items-center justify-center relative z-10">
            <div className="max-w-3xl w-full">
              {/* Step container */}
              <motion.div initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.35, ease: 'easeOut' }} className="rounded-2xl border border-border bg-card/40 p-8 md:p-10 shadow-lg">
                <AnimatePresence mode="wait">
                  {onboardStep === 0 && (
                    <motion.div key="step-0" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.3 }} className="text-center">
                      <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">Welcome to EDI.ai Learn Mode</h1>
                      <p className="text-white/70 md:text-lg mb-8">Let’s tailor your journey. This takes less than a minute.</p>
                      <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        {['Beginner', 'Intermediate', 'Advanced'].map(level => (
                          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }} key={level} onClick={() => setOnboardStep(1)} className="px-5 py-3 rounded-lg border border-border bg-white/10 hover:bg-white/15 text-white transition-colors">
                            {level}
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                  {onboardStep === 1 && (
                    <motion.div key="step-1" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.3 }} className="text-center">
                      <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">What do you want to achieve?</h2>
                      <p className="text-white/70 mb-8">Pick the goal closest to your needs.</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {['Learn formulas', 'Data analysis', 'Automate reports', 'Improve speed'].map(goal => (
                          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} key={goal} onClick={() => setOnboardStep(2)} className="px-5 py-3 rounded-lg border border-border bg-white/10 hover:bg-white/15 text-white text-sm transition-colors text-left">
                            {goal}
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                  {onboardStep === 2 && (
                    <motion.div key="step-2" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.3 }} className="text-center">
                      <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">How much time today?</h2>
                      <p className="text-white/70 mb-8">We’ll suggest the right size of lessons.</p>
                      <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        {['15 min', '30 min', '45 min+'].map(t => (
                          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }} key={t} onClick={() => setActiveView('cards')} className="px-5 py-3 rounded-lg border border-border bg-white/10 hover:bg-white/15 text-white transition-colors">
                            {t}
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                {/* Back/Skip controls */}
                <div className="mt-8 flex items-center justify-between text-white/60 text-sm">
                  <button disabled={onboardStep === 0} onClick={() => setOnboardStep(s => Math.max(0, s - 1))} className={`px-3 py-1.5 rounded-md border border-border ${onboardStep === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/10'}`}>Back</button>
                  <div className="flex gap-2">
                    {[0,1,2].map(i => (
                      <span key={i} className={`h-1.5 w-8 rounded-full ${i <= onboardStep ? 'bg-white' : 'bg-white/20'}`}/>
                    ))}
                  </div>
                  <button onClick={() => setActiveView('cards')} className="px-3 py-1.5 rounded-md border border-border hover:bg-white/10">Skip</button>
                </div>
              </motion.div>
            </div>
          </div>
        ) : activeView === 'cards' ? (
          <div className="flex-1 py-12 px-6 md:px-10 lg:px-14 overflow-y-auto relative z-10">
            <div className="max-w-4xl mx-auto">
              {/* Welcome Heading with animation */}
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }} className="mb-10 md:mb-12 text-center">
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Welcome to Learn Mode</h1>
                <p className="text-white/70 text-base md:text-lg max-w-3xl mx-auto">Choose a topic to explore. Read the concepts, then click Practice to open a ready-to-go sheet.</p>
              </motion.div>

              {/* Topic Cards */}
              <motion.div initial="hidden" animate="show" variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } }} className="flex flex-col gap-6">
                {SKILL_CONCEPTS.map(concept => (
                  <motion.div
                    key={concept.id}
                    variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                    className="relative group rounded-2xl border border-border bg-card/40 p-7 md:p-8 min-h-[180px] transition-all duration-300 cursor-pointer flex flex-col justify-between w-full hover:bg-card/60 hover:shadow-xl hover:border-white/30 hover:-translate-y-0.5"
                    onClick={() => { selectConcept(concept.id); router.push(`/workspace/${workspace.id}/learn/${concept.id}`); }}
                  >
                    {/* Subtle top accent line */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                    {/* Hover glow overlay */}
                    <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-[radial-gradient(600px_200px_at_20%_-20%,rgba(255,255,255,0.06),transparent_60%)]" />
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-white font-semibold text-lg">{concept.name}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/80 capitalize">{concept.difficulty}</span>
                    </div>
                    <p className="text-white/70 text-sm mb-4 leading-relaxed">{concept.description}</p>
                    <div className="text-white/50 text-xs">Prerequisites: {concept.prerequisites.length ? concept.prerequisites.join(', ') : 'None'}</div>
                    {/* Chevron appears on hover */}
                    <div className="absolute right-5 bottom-5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-5 h-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </div>
        ) : activeView === 'topic' ? (
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-4xl mx-auto">
              <div className="bg-card/40 rounded-xl border border-border p-6">
                <h2 className="text-2xl font-bold text-white mb-2">{selectedConcept === 'basic_functions' ? 'Basic Functions Mastery' : selectedConcept === 'vlookup' ? 'VLOOKUP Fundamentals' : 'Topic'}</h2>
                <p className="text-white/70 mb-6">Comprehensive explanation with examples to build intuition before practice.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="p-4 bg-black/40 rounded-lg border border-border">
                    <h4 className="font-medium text-white mb-1">Example 1</h4>
                    <p className="text-white/70 text-sm">Walkthrough of a core use case.</p>
                  </div>
                  <div className="p-4 bg-black/40 rounded-lg border border-border">
                    <h4 className="font-medium text-white mb-1">Example 2</h4>
                    <p className="text-white/70 text-sm">Another perspective with edge cases.</p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button className="px-5 py-2.5 rounded-md bg-white text-black font-semibold hover:bg-white/90" onClick={() => { if (selectedConcept) { getPracticeChallenge(selectedConcept, 'beginner'); } setActiveView('sandbox'); }}>Practice</button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            <div className="flex-1">
              {isGenerating ? (
                <div className="h-full w-full flex items-center justify-center">
                  <div className="text-center text-white/80">
                    <div className="w-10 h-10 border-4 border-white/40 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <div className="text-sm">Preparing your practice sheet...</div>
                  </div>
                </div>
              ) : (
                <SpreadsheetWrapper
                  data={practiceData}
                  onDataUpdate={handleDataUpdate}
                  isDataEmpty={practiceData.length === 0}
                  filename={practiceFilename}
                  mode="learn"
                  learnChatMinimal={true}
                  initialSheets={initialSheets}
                  onAdapterReady={handleAdapterReady}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}