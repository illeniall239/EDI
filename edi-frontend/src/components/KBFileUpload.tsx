'use client';

import React, { useState, useRef } from 'react';
import {
    Upload,
    X,
    FileText,
    File,
    CheckCircle,
    AlertCircle,
    Loader2
} from 'lucide-react';
import { uploadToKB } from '@/utils/api';
import { KBUploadProgress } from '@/types';

interface KBFileUploadProps {
    kbId: string;
    onUploadComplete: () => void;
    onClose: () => void;
}

const ACCEPTED_FILE_TYPES = [
    '.pdf',
    '.docx',
    '.txt',
    '.csv',
    '.xlsx',
    '.xls'
];

const FILE_TYPE_LABELS: Record<string, string> = {
    'pdf': 'PDF Document',
    'docx': 'Word Document',
    'txt': 'Text File',
    'csv': 'CSV Data',
    'xlsx': 'Excel Spreadsheet',
    'xls': 'Excel Spreadsheet'
};

export default function KBFileUpload({
    kbId,
    onUploadComplete,
    onClose
}: KBFileUploadProps) {
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [uploadProgress, setUploadProgress] = useState<Map<string, KBUploadProgress>>(new Map());
    const [isUploading, setIsUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
        if (event.target.files) {
            const files = Array.from(event.target.files);
            addFiles(files);
        }
    }

    function handleDrop(event: React.DragEvent<HTMLDivElement>) {
        event.preventDefault();
        setIsDragging(false);

        if (event.dataTransfer.files) {
            const files = Array.from(event.dataTransfer.files);
            addFiles(files);
        }
    }

    function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
        event.preventDefault();
        setIsDragging(true);
    }

    function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
        event.preventDefault();
        setIsDragging(false);
    }

    function addFiles(files: File[]) {
        // Filter for accepted file types
        const validFiles = files.filter(file => {
            const extension = '.' + file.name.split('.').pop()?.toLowerCase();
            return ACCEPTED_FILE_TYPES.includes(extension);
        });

        if (validFiles.length < files.length) {
            alert(`Some files were rejected. Accepted types: ${ACCEPTED_FILE_TYPES.join(', ')}`);
        }

        // Add to selected files (avoiding duplicates)
        setSelectedFiles(prev => {
            const existingNames = new Set(prev.map(f => f.name));
            const newFiles = validFiles.filter(f => !existingNames.has(f.name));
            return [...prev, ...newFiles];
        });
    }

    function removeFile(index: number) {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    }

    async function handleUpload() {
        if (selectedFiles.length === 0) return;

        setIsUploading(true);

        // Initialize progress for all files
        const progressMap = new Map<string, KBUploadProgress>();
        selectedFiles.forEach(file => {
            progressMap.set(file.name, {
                filename: file.name,
                progress: 0,
                status: 'uploading'
            });
        });
        setUploadProgress(progressMap);

        // Upload files sequentially (could be parallel with Promise.all)
        for (const file of selectedFiles) {
            try {
                await uploadToKB(kbId, file, (percent) => {
                    setUploadProgress(prev => {
                        const updated = new Map(prev);
                        updated.set(file.name, {
                            filename: file.name,
                            progress: percent,
                            status: 'uploading'
                        });
                        return updated;
                    });
                });

                // Mark as processing (backend will process asynchronously)
                setUploadProgress(prev => {
                    const updated = new Map(prev);
                    updated.set(file.name, {
                        filename: file.name,
                        progress: 100,
                        status: 'processing'
                    });
                    return updated;
                });

                // After a short delay, mark as completed
                setTimeout(() => {
                    setUploadProgress(prev => {
                        const updated = new Map(prev);
                        updated.set(file.name, {
                            filename: file.name,
                            progress: 100,
                            status: 'completed'
                        });
                        return updated;
                    });
                }, 1000);

            } catch (error) {
                console.error(`Failed to upload ${file.name}:`, error);
                setUploadProgress(prev => {
                    const updated = new Map(prev);
                    updated.set(file.name, {
                        filename: file.name,
                        progress: 0,
                        status: 'failed',
                        error: error instanceof Error ? error.message : 'Upload failed'
                    });
                    return updated;
                });
            }
        }

        setIsUploading(false);

        // Check if all uploads completed successfully
        const allCompleted = Array.from(uploadProgress.values()).every(
            p => p.status === 'completed' || p.status === 'processing'
        );

        if (allCompleted) {
            // Notify parent and close after brief delay
            setTimeout(() => {
                onUploadComplete();
                onClose();
            }, 1500);
        }
    }

    function getFileIcon(filename: string) {
        const extension = filename.split('.').pop()?.toLowerCase();
        return <FileText className="w-5 h-5 text-blue-600" />;
    }

    function getFileTypeLabel(filename: string): string {
        const extension = filename.split('.').pop()?.toLowerCase() || '';
        return FILE_TYPE_LABELS[extension] || 'File';
    }

    function formatFileSize(bytes: number): string {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    const hasFiles = selectedFiles.length > 0;
    const uploadedCount = Array.from(uploadProgress.values()).filter(
        p => p.status === 'completed' || p.status === 'processing'
    ).length;

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-card backdrop-blur-md rounded-lg max-w-2xl w-full max-h-[80vh] flex flex-col border border-border">
                {/* Header */}
                <div className="p-6 border-b border-border flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-semibold text-white">
                            Upload Files to Knowledge Base
                        </h2>
                        <p className="text-sm text-white/70 mt-1">
                            Supported: PDF, DOCX, TXT, CSV, Excel
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-white/70" />
                    </button>
                </div>

                {/* Upload Area */}
                <div className="flex-1 overflow-y-auto p-6">
                    {!hasFiles ? (
                        <div
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onClick={() => fileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-all duration-300 ${
                                isDragging
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:border-primary/50'
                            }`}
                        >
                            <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                            <p className="text-lg font-medium text-white mb-2">
                                Drop files here or click to browse
                            </p>
                            <p className="text-sm text-white/70">
                                Upload PDFs, Word documents, text files, or spreadsheets
                            </p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept={ACCEPTED_FILE_TYPES.join(',')}
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {/* File List */}
                            {selectedFiles.map((file, index) => {
                                const progress = uploadProgress.get(file.name);
                                const isUploaded = progress?.status === 'completed' || progress?.status === 'processing';
                                const isFailed = progress?.status === 'failed';

                                return (
                                    <div
                                        key={index}
                                        className="border border-border rounded-lg p-4 bg-card/40 backdrop-blur-sm"
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="flex-shrink-0">
                                                {getFileIcon(file.name)}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <h4 className="text-sm font-medium text-white truncate">
                                                        {file.name}
                                                    </h4>

                                                    {!isUploading && !progress && (
                                                        <button
                                                            onClick={() => removeFile(index)}
                                                            className="p-1 hover:bg-white/10 rounded transition-colors"
                                                        >
                                                            <X className="w-4 h-4 text-white/70" />
                                                        </button>
                                                    )}

                                                    {isUploaded && (
                                                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                                                    )}

                                                    {isFailed && (
                                                        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                                                    )}

                                                    {progress?.status === 'uploading' && (
                                                        <Loader2 className="w-5 h-5 text-primary animate-spin flex-shrink-0" />
                                                    )}

                                                    {progress?.status === 'processing' && (
                                                        <Loader2 className="w-5 h-5 text-amber-600 animate-spin flex-shrink-0" />
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-3 text-xs text-white/70">
                                                    <span>{getFileTypeLabel(file.name)}</span>
                                                    <span>•</span>
                                                    <span>{formatFileSize(file.size)}</span>
                                                </div>

                                                {/* Progress Bar */}
                                                {progress && (
                                                    <div className="mt-2">
                                                        <div className="flex items-center justify-between text-xs mb-1">
                                                            <span className="text-white/70">
                                                                {progress.status === 'uploading' && `Uploading ${Math.round(progress.progress)}%`}
                                                                {progress.status === 'processing' && 'Processing...'}
                                                                {progress.status === 'completed' && 'Completed'}
                                                                {progress.status === 'failed' && progress.error}
                                                            </span>
                                                        </div>
                                                        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full transition-all duration-300 ${
                                                                    progress.status === 'completed'
                                                                        ? 'bg-green-600'
                                                                        : progress.status === 'processing'
                                                                        ? 'bg-amber-600'
                                                                        : progress.status === 'failed'
                                                                        ? 'bg-red-600'
                                                                        : 'bg-primary'
                                                                }`}
                                                                style={{ width: `${progress.progress}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Add More Files Button */}
                            {!isUploading && (
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full p-4 border-2 border-dashed border-border rounded-lg hover:border-primary/50 transition-all duration-300 flex items-center justify-center gap-2 text-white/70"
                                >
                                    <Upload className="w-4 h-4" />
                                    Add More Files
                                </button>
                            )}

                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept={ACCEPTED_FILE_TYPES.join(',')}
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-border">
                    {isUploading && (
                        <div className="mb-4 text-center text-sm text-white/70">
                            Uploading {uploadedCount} of {selectedFiles.length} files...
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            disabled={isUploading}
                            className="flex-1 px-4 py-2 border border-border text-white rounded-lg hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isUploading ? 'Uploading...' : 'Cancel'}
                        </button>
                        <button
                            onClick={handleUpload}
                            disabled={!hasFiles || isUploading}
                            className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
                        >
                            {isUploading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Uploading...
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4" />
                                    Upload {selectedFiles.length} {selectedFiles.length === 1 ? 'File' : 'Files'}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
