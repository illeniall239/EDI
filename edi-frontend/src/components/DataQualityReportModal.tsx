'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { BarChart3, AlertTriangle, Search, Settings, CheckCircle, FileText, Wrench, Target, X } from 'lucide-react';

interface DataQualityReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: any;
  onRefresh?: () => void;
  onFixDuplicates?: () => void;
  onFixMissingValues?: () => void;
}

export default function DataQualityReportModal({
  isOpen,
  onClose,
  report,
  onRefresh,
  onFixDuplicates,
  onFixMissingValues
}: DataQualityReportModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dialogPos, setDialogPos] = useState<{left: number, top: number} | null>(null);
  const [dragOffset, setDragOffset] = useState<{x: number, y: number}>({x: 0, y: 0});
  const modalRef = useRef<HTMLDivElement>(null);

  // Drag handlers
  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!modalRef.current) return;

    const rect = modalRef.current.getBoundingClientRect();
    const offset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };

    setDragOffset(offset);
    setIsDragging(true);

    if (!dialogPos) {
      setDialogPos({
        left: rect.left,
        top: rect.top
      });
    }
  };

  const handleDrag = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    const newLeft = e.clientX - dragOffset.x;
    const newTop = e.clientY - dragOffset.y;

    // Keep modal within viewport bounds
    const maxLeft = window.innerWidth - 600;
    const maxTop = window.innerHeight - 400;

    const boundedPos = {
      left: Math.max(0, Math.min(newLeft, maxLeft)),
      top: Math.max(0, Math.min(newTop, maxTop))
    };

    setDialogPos(boundedPos);
  }, [dragOffset, isDragging]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDrag);
      window.addEventListener('mouseup', handleDragEnd);

      return () => {
        window.removeEventListener('mousemove', handleDrag);
        window.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isDragging, handleDrag, handleDragEnd]);

  // Early return after all hooks
  if (!isOpen || !report) return null;

  return (
    <div
      ref={modalRef}
      className="fixed bg-card border border-border rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col z-[9999]"
      style={{
        top: dialogPos?.top && dialogPos.top < window.innerHeight - 500 ? dialogPos.top : '50%',
        left: dialogPos?.left && dialogPos.left < window.innerWidth - 500 ? dialogPos.left : '50%',
        transform: dialogPos ? 'none' : 'translate(-50%, -50%)',
        cursor: isDragging ? 'grabbing' : 'default',
      }}
    >
      {/* Header */}
      <div
        className="bg-card border-b border-border p-6 flex justify-between items-center"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-lg">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Data Quality Report</h2>
            <p className="text-muted-foreground mt-1">Comprehensive analysis of your data quality</p>
            {report.generatedAt && (
              <div className="text-xs text-muted-foreground mt-1">
                <span>Generated: {new Date(report.generatedAt).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-3xl font-bold text-foreground">{report.summary.overallQuality.score}%</div>
            <div className="text-sm text-muted-foreground">{report.summary.overallQuality.grade}</div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary/80 rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-muted/50 border border-border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-foreground">{report.summary.totalRows}</div>
            <div className="text-sm text-muted-foreground">Total Rows</div>
          </div>
          <div className="bg-muted/50 border border-border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-foreground">{report.summary.totalColumns}</div>
            <div className="text-sm text-muted-foreground">Total Columns</div>
          </div>
          <div className="bg-muted/50 border border-border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-foreground">{report.duplicates.count}</div>
            <div className="text-sm text-muted-foreground">Duplicate Rows</div>
          </div>
          <div className="bg-muted/50 border border-border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-foreground">{report.missingValues.totalMissing}</div>
            <div className="text-sm text-muted-foreground">Missing Values</div>
          </div>
        </div>

        {/* Quality Score Breakdown */}
        {report.summary.overallQuality.breakdown && (
          <div className="bg-muted/50 border border-border rounded-lg p-6">
            <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <Target className="w-5 h-5" />
              Quality Score Breakdown
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-card/40 border border-border rounded p-3">
                <span className="text-foreground">Base Score</span>
                <span className="font-bold text-foreground">100%</span>
              </div>
              {report.summary.overallQuality.breakdown.duplicatesImpact > 0 && (
                <div className="flex items-center justify-between bg-card/40 border border-border rounded p-3">
                  <span className="text-foreground">Duplicate Rows Penalty</span>
                  <span className="font-bold text-foreground">-{report.summary.overallQuality.breakdown.duplicatesImpact.toFixed(1)}%</span>
                </div>
              )}
              {report.summary.overallQuality.breakdown.missingValuesImpact > 0 && (
                <div className="flex items-center justify-between bg-card/40 border border-border rounded p-3">
                  <span className="text-foreground">Missing Values Penalty</span>
                  <span className="font-bold text-foreground">-{report.summary.overallQuality.breakdown.missingValuesImpact.toFixed(1)}%</span>
                </div>
              )}
              {report.summary.overallQuality.breakdown.typeIssuesImpact > 0 && (
                <div className="flex items-center justify-between bg-card/40 border border-border rounded p-3">
                  <span className="text-foreground">Data Type Issues Penalty</span>
                  <span className="font-bold text-foreground">-{report.summary.overallQuality.breakdown.typeIssuesImpact.toFixed(1)}%</span>
                </div>
              )}
              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between bg-muted/50 border border-border rounded p-3">
                  <span className="text-foreground font-bold">Final Quality Score</span>
                  <span className="font-bold text-2xl text-foreground">{report.summary.overallQuality.score}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Duplicate Rows Section */}
        {report.duplicates.count > 0 && (
          <div className="bg-muted/50 border border-border rounded-lg p-6">
            <h3 className="text-lg font-bold text-foreground mb-4 flex items-center">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4" />
                Duplicate Rows Found
              </div>
            </h3>
            <p className="text-muted-foreground mb-4">{report.duplicates.summary}</p>
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {report.duplicates.locations.map((dup: any, index: number) => (
                <div key={index} className="bg-card/40 border border-border rounded p-3 border-l-4 border-border">
                  <div className="font-medium text-foreground">
                    Row {dup.duplicateRow} duplicates Row {dup.originalRow}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Data: {JSON.stringify(dup.data).slice(0, 100)}...
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Missing Values Section */}
        {report.missingValues.totalMissing > 0 && (
          <div className="bg-muted/50 border border-border rounded-lg p-6">
            <h3 className="text-lg font-bold text-foreground mb-4 flex items-center">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Missing Values Found
              </div>
            </h3>
            <p className="text-muted-foreground mb-4">{report.missingValues.summary}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(report.missingValues.byColumn).map(([column, info]: [string, any]) => (
                info.count > 0 && (
                  <div key={column} className="bg-card/40 border border-border rounded p-4 border-l-4 border-border">
                    <div className="font-medium text-foreground mb-2">
                      {column} ({info.count} missing)
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Cells: {info.cells.slice(0, 10).join(', ')}
                      {info.cells.length > 10 && ` (+${info.cells.length - 10} more)`}
                    </div>
                  </div>
                )
              ))}
            </div>
          </div>
        )}

        {/* Data Type Issues */}
        {report.dataTypeIssues.length > 0 && (
          <div className="bg-muted/50 border border-border rounded-lg p-6">
            <h3 className="text-lg font-bold text-foreground mb-4 flex items-center">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Data Type Inconsistencies
              </div>
            </h3>
            <div className="space-y-4">
              {report.dataTypeIssues.map((issue: any, index: number) => (
                <div key={index} className="bg-card/40 border border-border rounded p-4 border-l-4 border-border">
                  <div className="font-medium text-foreground mb-2">
                    Column: {issue.column}
                  </div>
                  <div className="text-sm text-muted-foreground mb-2">
                    Mixed types: {issue.types.join(', ')}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Examples: {issue.examples.map((ex: any) => `Row ${ex.row}: ${ex.value} (${ex.type})`).join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Issues Found */}
        {report.duplicates.count === 0 &&
         report.missingValues.totalMissing === 0 &&
         report.dataTypeIssues.length === 0 && (
          <div className="bg-muted/50 border border-border rounded-lg p-6 text-center">
            <div className="mb-4">
              <CheckCircle className="w-16 h-16 text-foreground mx-auto" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">Excellent Data Quality!</h3>
            <p className="text-muted-foreground">No major data quality issues were found in your dataset.</p>
          </div>
        )}

        {/* Data Types Summary */}
        <div className="bg-muted/50 border border-border rounded-lg p-6">
          <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Data Types Summary
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(report.summary.dataTypes).map(([column, info]: [string, any]) => (
              <div key={column} className="bg-card/40 border border-border rounded p-3">
                <div className="font-medium text-foreground">{column}</div>
                <div className="text-sm text-muted-foreground">Type: {info.dominantType}</div>
                <div className="text-xs text-muted-foreground">
                  {Object.entries(info.typeCounts).map(([type, count]: [string, any]) =>
                    `${type}: ${count}`
                  ).join(', ')}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recommended Actions */}
        <div className="bg-muted/50 border border-border rounded-lg p-6">
          <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            Recommended Actions
          </h3>
          <div className="space-y-2">
            {report.duplicates.count > 0 && onFixDuplicates && (
              <div className="flex items-center justify-between bg-card/40 border border-border rounded p-3">
                <span className="text-foreground">Remove {report.duplicates.count} duplicate rows</span>
                <button
                  onClick={onFixDuplicates}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded transition-colors text-sm"
                >
                  Fix Now
                </button>
              </div>
            )}
            {report.missingValues.totalMissing > 0 && onFixMissingValues && (
              <div className="flex items-center justify-between bg-card/40 border border-border rounded p-3">
                <span className="text-foreground">Handle {report.missingValues.totalMissing} missing values</span>
                <button
                  onClick={onFixMissingValues}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded transition-colors text-sm"
                >
                  Get Help
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border p-4 bg-card/40 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="px-6 py-2 border border-border text-muted-foreground rounded-lg hover:bg-secondary/80 transition-colors"
        >
          Close
        </button>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
          >
            Refresh Report
          </button>
        )}
      </div>
    </div>
  );
}
