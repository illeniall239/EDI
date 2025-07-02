import { useState } from 'react';
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
      } catch (e) {
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
        className={`${collapsed ? 'w-10 h-10 flex items-center justify-center bg-blue-600/10 hover:bg-blue-600/20 border border-blue-600/30' : 'w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white'} rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed`}
        title={collapsed ? 'Generate Report' : ''}
      >
        <svg className={`w-5 h-5 ${collapsed ? 'text-blue-400' : 'text-white mr-1'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {!collapsed && 'Generate Report'}
      </button>

      {/* Waiting Modal */}
      {waiting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white bg-opacity-100 rounded-xl shadow-2xl p-8 max-w-sm w-full flex flex-col items-center pointer-events-auto">
            <div className="text-lg font-semibold mb-4 text-gray-800">Generating report, please wait...</div>
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
          </div>
        </div>
      )}

      {/* Error/Result Modal */}
      {showResult && !waiting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white bg-opacity-100 rounded-xl shadow-2xl p-8 max-w-sm w-full flex flex-col items-center pointer-events-auto">
            {error ? (
              <div className="text-lg font-semibold mb-4 text-red-600">{error}</div>
            ) : reportId ? (
              <>
                <div className="text-lg font-semibold mb-2 text-green-700">Report generated!</div>
                <div className="text-sm text-gray-700 mb-1">Filename: <span className="font-mono">report_{reportId}.pdf</span></div>
                {reportTime && (
                  <div className="text-xs text-gray-500 mb-2">Generated at: {reportTime}</div>
                )}
                <div className="flex gap-4 mt-2">
                  <button
                    className="px-4 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700"
                    onClick={handleDownload}
                    disabled={isDownloading}
                  >
                    {isDownloading ? 'Downloading...' : 'Download'}
                  </button>
                  <button
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                  >
                    {isGenerating ? 'Regenerating...' : 'Regenerate'}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-lg font-semibold mb-4 text-gray-800">No report generated yet.</div>
            )}
            <button
              className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 mt-6"
              onClick={() => { setShowResult(false); setError(null); }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Prompt Modal */}
      {showPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white bg-opacity-100 rounded-xl shadow-2xl p-8 max-w-sm w-full flex flex-col items-center pointer-events-auto">
            <div className="text-lg font-semibold mb-4 text-gray-800">Generate a report?</div>
            <div className="flex gap-4 mt-2">
              <button
                className="px-4 py-2 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700"
                onClick={handlePromptYes}
                disabled={isGenerating}
              >
                {isGenerating ? 'Generating...' : 'Yes'}
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200"
                onClick={() => setShowPrompt(false)}
                disabled={isGenerating}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 