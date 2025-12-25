import { useState } from 'react';
import { createPortal } from 'react-dom';
import { generateReport, downloadReport, checkReportStatus } from '@/utils/api';

interface ReportGeneratorProps {
  workspaceId: string | null;
  isDataLoaded: boolean;
  collapsed?: boolean;
}

export default function ReportGenerator({ workspaceId, isDataLoaded, collapsed = false }: ReportGeneratorProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [reportTime, setReportTime] = useState<string | null>(null);

  // Polling for report status
  const pollReportStatus = async (reportId: string, maxAttempts = 30, interval = 2000) => {
    let attempts = 0;
    while (attempts < maxAttempts) {
      try {
        const data = await checkReportStatus(reportId);
        if (data.status === 'ready') {
          return true;
        } else if (data.status === 'error') {
          setError(data.error || 'Unknown error while checking report status');
          return false;
        }
      } catch {
        // ignore, will retry
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
      attempts++;
    }
    return false;
  };

  const handleOpen = () => {
    if (!workspaceId) {
      setError('No workspace selected. Please select a workspace.');
      setShowResult(true);
      return;
    }
    setShowPrompt(true);
  };

  const handlePromptYes = async () => {
    setShowPrompt(false);
    await handleGenerate();
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setShowResult(false);
    setWaiting(true);
    try {
      console.log('[ReportGenerator] Generating report for workspaceId:', workspaceId);
      const report = await generateReport();
      setReportId(report.report_id);
      // Poll for report status
      const ready = await pollReportStatus(report.report_id);
      setWaiting(false);
      if (ready) {
        setShowResult(true);
        setReportTime(new Date().toLocaleString());
        console.log('[ReportGenerator] Report generated and ready:', report);
      } else {
        setError('Report generation timed out. Please try again.');
        setShowResult(true);
      }
    } catch (err) {
      console.error('[ReportGenerator] Failed to generate report:', err);
      setError('Failed to generate report');
      setShowResult(true);
      setWaiting(false);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!reportId) return;
    setIsDownloading(true);
    setError(null);
    try {
      console.log('[ReportGenerator] Downloading report:', reportId);
      const reportBlob = await downloadReport(reportId);
      const url = window.URL.createObjectURL(reportBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `report_${reportId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      console.log('[ReportGenerator] Download complete for report:', reportId);
    } catch (err) {
      console.error('[ReportGenerator] Failed to download report:', err);
      setError('Failed to download report');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleOpen}
        disabled={!isDataLoaded}
        className={`${collapsed ? 'w-10 h-10 flex items-center justify-center bg-primary/10 hover:bg-primary/20 border border-primary/30' : 'flex items-center gap-1.5 px-2.5 py-1.5 bg-secondary hover:bg-primary border border-border hover:border-primary text-secondary-foreground hover:text-primary-foreground'} rounded-md text-xs transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed`}
        title={collapsed ? 'Generate Report' : ''}
      >
        <svg className={`w-3.5 h-3.5 ${collapsed ? 'text-primary' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {!collapsed && 'Generate Report'}
      </button>

      {/* Waiting Modal */}
      {waiting && createPortal(
        <div 
          className="fixed bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden z-[9999]"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)'
          }}
        >
          {/* Header */}
          <div className="border-b border-border p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Processing Report
                </h2>
                <p className="text-sm text-muted-foreground">
                  Analyzing data and generating insights
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            <div className="bg-muted/20 rounded-lg p-4 text-center">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-foreground leading-relaxed">
                Please wait while we analyze your data and create a comprehensive report...
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Error/Result Modal */}
      {showResult && !waiting && createPortal(
        <div 
          className="fixed bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden z-[9999]"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)'
          }}
        >
          {/* Header */}
          <div className="border-b border-border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  error 
                    ? 'bg-destructive/10 text-destructive' 
                    : 'bg-primary/10 text-primary'
                }`}>
                  {error ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {error ? 'Report Generation Failed' : 'Report Ready'}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {error 
                      ? 'An error occurred during generation' 
                      : 'Your report has been generated successfully'
                    }
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setShowResult(false); setError(null); }}
                className="p-2 rounded-lg hover:bg-accent text-foreground hover:text-foreground transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {error ? (
              <div className="bg-destructive/10 rounded-lg p-4 mb-6">
                <p className="text-destructive leading-relaxed">
                  {error}
                </p>
              </div>
            ) : reportId ? (
              <div className="bg-muted/20 rounded-lg p-4 mb-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Filename:</span>
                    <span className="text-sm font-mono text-foreground bg-muted/50 px-2 py-1 rounded">
                      report_{reportId}.pdf
                    </span>
                  </div>
                  {reportTime && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">Generated:</span>
                      <span className="text-sm text-muted-foreground">{reportTime}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-muted/20 rounded-lg p-4 mb-6">
                <p className="text-foreground leading-relaxed">
                  No report has been generated yet.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              {error ? (
                <>
                  <button
                    onClick={() => { setShowResult(false); setError(null); }}
                    className="px-4 py-2.5 rounded-lg border border-border bg-secondary hover:bg-accent text-secondary-foreground hover:text-accent-foreground transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium"
                  >
                    Close
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="px-4 py-2.5 rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 bg-primary hover:bg-primary/90 text-primary-foreground focus:ring-primary/20 shadow-sm shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? 'Retrying...' : 'Try Again'}
                  </button>
                </>
              ) : reportId ? (
                <>
                  <button
                    onClick={() => { setShowResult(false); setError(null); }}
                    className="px-4 py-2.5 rounded-lg border border-border bg-secondary hover:bg-accent text-secondary-foreground hover:text-accent-foreground transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium"
                  >
                    Close
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="px-4 py-2.5 rounded-lg border border-border bg-muted hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? 'Regenerating...' : 'Regenerate'}
                  </button>
                  <button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="px-4 py-2.5 rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 bg-primary hover:bg-primary/90 text-primary-foreground focus:ring-primary/20 shadow-sm shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDownloading ? 'Downloading...' : 'Download'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { setShowResult(false); setError(null); }}
                  className="px-4 py-2.5 rounded-lg border border-border bg-secondary hover:bg-accent text-secondary-foreground hover:text-accent-foreground transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Prompt Modal */}
      {showPrompt && createPortal(
        <div 
          className="fixed bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden z-[9999]"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)'
          }}
        >
          {/* Header */}
          <div className="border-b border-border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Generate Report
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Create a comprehensive analysis report
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPrompt(false)}
                className="p-2 rounded-lg hover:bg-accent text-foreground hover:text-foreground transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            <div className="bg-muted/20 rounded-lg p-4 mb-6">
              <p className="text-foreground leading-relaxed">
                Generate a detailed PDF report with insights and visualizations from your current dataset?
              </p>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowPrompt(false)}
                disabled={isGenerating}
                className="px-4 py-2.5 rounded-lg border border-border bg-secondary hover:bg-accent text-secondary-foreground hover:text-accent-foreground transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handlePromptYes}
                disabled={isGenerating}
                className="px-4 py-2.5 rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 bg-primary hover:bg-primary/90 text-primary-foreground focus:ring-primary/20 shadow-sm shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
} 