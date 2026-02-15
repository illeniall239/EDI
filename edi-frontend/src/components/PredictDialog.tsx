'use client';

import React, { useState } from 'react';
import { X, TrendingUp, Activity, Target, Sparkles, BarChart3 } from 'lucide-react';
import { PredictionConfig } from '../types';

interface PredictDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onPredict: (config: PredictionConfig) => void;
    columns: string[];
    workspaceId: string;
}

export default function PredictDialog({
    isOpen,
    onClose,
    onPredict,
    columns,
    workspaceId
}: PredictDialogProps) {
    const [targetColumn, setTargetColumn] = useState('');
    const [predictionType, setPredictionType] = useState<'auto' | 'forecast' | 'regression' | 'classification' | 'trend'>('auto');
    const [periods, setPeriods] = useState(10);
    const [featureColumns, setFeatureColumns] = useState<string[]>([]);
    const [confidenceLevel, setConfidenceLevel] = useState(0.95);
    const [isProcessing, setIsProcessing] = useState(false);

    if (!isOpen) return null;

    const handlePredict = async () => {
        if (!targetColumn) {
            alert('Please select a target column');
            return;
        }

        setIsProcessing(true);
        try {
            await onPredict({
                targetColumn,
                predictionType,
                periods,
                featureColumns: featureColumns.length > 0 ? featureColumns : undefined,
                confidenceLevel
            });
            onClose();
        } catch (error) {
            console.error('Prediction error:', error);
            alert(`Prediction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleFeatureToggle = (column: string) => {
        setFeatureColumns(prev => {
            if (prev.includes(column)) {
                return prev.filter(c => c !== column);
            } else {
                return [...prev, column];
            }
        });
    };

    // Filter numeric columns for target selection (heuristic)
    const availableColumns = columns.filter(col =>
        !col.toLowerCase().includes('id') &&
        !col.toLowerCase().includes('name') &&
        col !== targetColumn
    );

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-lg">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-6 h-6 text-purple-600" />
                        <h2 className="text-xl font-semibold text-gray-900">Predictive Analysis</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                        disabled={isProcessing}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    {/* Target Column */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            <Target className="w-4 h-4 inline mr-1" />
                            Target Column (what to predict) *
                        </label>
                        <select
                            value={targetColumn}
                            onChange={(e) => setTargetColumn(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            disabled={isProcessing}
                        >
                            <option value="">Select column...</option>
                            {columns.map(col => (
                                <option key={col} value={col}>{col}</option>
                            ))}
                        </select>
                    </div>

                    {/* Prediction Type */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            <Activity className="w-4 h-4 inline mr-1" />
                            Prediction Type
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {[
                                { value: 'auto', label: 'Auto-Detect', icon: Sparkles, description: 'Let AI choose' },
                                { value: 'forecast', label: 'Time Series', icon: TrendingUp, description: 'Future values' },
                                { value: 'regression', label: 'Regression', icon: Activity, description: 'Numeric prediction' },
                                { value: 'classification', label: 'Classification', icon: Target, description: 'Category prediction' },
                                { value: 'trend', label: 'Trend Analysis', icon: BarChart3, description: 'Trend projection' }
                            ].map(({ value, label, icon: Icon, description }) => (
                                <button
                                    key={value}
                                    onClick={() => setPredictionType(value as any)}
                                    disabled={isProcessing}
                                    className={`px-4 py-3 rounded-lg border-2 transition-all text-left ${
                                        predictionType === value
                                            ? 'border-purple-600 bg-purple-50 ring-2 ring-purple-200'
                                            : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                                    } ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                >
                                    <Icon className={`w-4 h-4 mb-1 ${predictionType === value ? 'text-purple-600' : 'text-gray-500'}`} />
                                    <div className="text-xs font-medium text-gray-900">{label}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">{description}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Periods (for time series) */}
                    {(predictionType === 'forecast' || predictionType === 'trend' || predictionType === 'auto') && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Number of Periods to Predict: <span className="text-purple-600 font-semibold">{periods}</span>
                            </label>
                            <input
                                type="range"
                                value={periods}
                                onChange={(e) => setPeriods(parseInt(e.target.value))}
                                min="1"
                                max="100"
                                step="1"
                                disabled={isProcessing}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                            />
                            <div className="flex justify-between text-xs text-gray-500 mt-1">
                                <span>1</span>
                                <span>50</span>
                                <span>100</span>
                            </div>
                        </div>
                    )}

                    {/* Feature Columns (for regression/classification) */}
                    {(predictionType === 'regression' || predictionType === 'classification') && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Feature Columns (optional - auto-selected if empty)
                            </label>
                            <div className="border border-gray-300 rounded-lg p-3 max-h-40 overflow-y-auto">
                                {availableColumns.length === 0 ? (
                                    <p className="text-sm text-gray-500">No feature columns available</p>
                                ) : (
                                    <div className="space-y-2">
                                        {availableColumns.map(col => (
                                            <label key={col} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                                                <input
                                                    type="checkbox"
                                                    checked={featureColumns.includes(col)}
                                                    onChange={() => handleFeatureToggle(col)}
                                                    disabled={isProcessing}
                                                    className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                                                />
                                                <span className="text-sm text-gray-700">{col}</span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                Leave empty for automatic feature selection based on correlations
                            </p>
                        </div>
                    )}

                    {/* Confidence Level */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Confidence Level: <span className="text-purple-600 font-semibold">{(confidenceLevel * 100).toFixed(0)}%</span>
                        </label>
                        <input
                            type="range"
                            value={confidenceLevel}
                            onChange={(e) => setConfidenceLevel(parseFloat(e.target.value))}
                            min="0.80"
                            max="0.99"
                            step="0.01"
                            disabled={isProcessing}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>80%</span>
                            <span>90%</span>
                            <span>99%</span>
                        </div>
                    </div>

                    {/* Info Box */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-start gap-2">
                            <Sparkles className="w-5 h-5 text-blue-600 mt-0.5" />
                            <div className="text-sm text-blue-800">
                                <p className="font-medium mb-1">How it works:</p>
                                <ul className="list-disc list-inside space-y-1 text-blue-700">
                                    <li>The system will automatically select the best ML model for your data</li>
                                    <li>Multiple algorithms are tested and compared for accuracy</li>
                                    <li>Results include predictions, confidence intervals, and model performance metrics</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t rounded-b-lg">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors text-gray-700 font-medium"
                        disabled={isProcessing}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handlePredict}
                        disabled={!targetColumn || isProcessing}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2"
                    >
                        {isProcessing ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                Processing...
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-4 h-4" />
                                Generate Predictions
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
