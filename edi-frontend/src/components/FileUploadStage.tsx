'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadFile } from '@/utils/api';
import { DataPreview } from '@/types';
import UserProfile from './UserProfile';

interface FileUploadStageProps {
  workspaceId: string;
  onComplete?: (data: Array<any>) => void;
}

interface UploadedFile {
  name: string;
  progress: number;
  size: string;
  status: 'uploading' | 'complete' | 'error';
  error?: string;
  preview?: DataPreview;
}

export default function FileUploadStage({ workspaceId, onComplete }: FileUploadStageProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      const newFile: UploadedFile = {
        name: file.name,
        progress: 0,
        size: formatFileSize(file.size),
        status: 'uploading'
      };

      setUploadedFiles(prev => [...prev, newFile]);

      try {
        const response = await uploadFile(file, workspaceId);
        setUploadedFiles(prev =>
          prev.map(f =>
            f.name === file.name ? { 
              ...f, 
              progress: 100, 
              status: 'complete',
              preview: response
            } : f
          )
        );
      } catch (error) {
        setUploadedFiles(prev =>
          prev.map(f =>
            f.name === file.name ? { 
              ...f, 
              progress: 0, 
              status: 'error',
              error: error instanceof Error ? error.message : 'Upload failed'
            } : f
          )
        );
      }
    }
  }, [workspaceId]);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    onDragEnter: () => setIsDragActive(true),
    onDragLeave: () => setIsDragActive(false),
    accept: {
      'text/csv': ['.csv'],
      'application/json': ['.json'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    }
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const allUploadsComplete = uploadedFiles.length > 0 && 
    uploadedFiles.every(file => file.status === 'complete');

  const handleAnalyzeClick = () => {
    const completedFile = uploadedFiles.find(file => file.status === 'complete');
    if (completedFile && completedFile.preview && onComplete) {
      onComplete(completedFile.preview.preview);
    }
  };

  return (
    <div className="fixed inset-0 bg-emerald-950 flex flex-col">
      <div className="p-4 flex justify-end">
        <UserProfile variant="dark" />
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-4xl mx-auto px-4">
          <div className="bg-white rounded-3xl p-12 shadow-xl">
            <div className="text-center space-y-4 mb-8">
              <h1 className="text-4xl font-bold text-gray-900">
                Upload Files
              </h1>
              <p className="text-gray-600 text-lg">
                Upload documents you want to analyze with EDI.ai
              </p>
            </div>

            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-2xl p-12 transition-all duration-300 cursor-pointer
                ${isDragActive 
                  ? 'border-emerald-500 bg-emerald-50' 
                  : 'border-gray-300 hover:border-emerald-500 hover:bg-emerald-50'
                }
              `}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center justify-center text-center space-y-6">
                <div className="bg-emerald-100 rounded-full p-6">
                  <svg 
                    className="w-10 h-10 text-emerald-600"
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                </div>
                <div className="space-y-2">
                  <p className="text-xl text-gray-700 font-medium">
                    Drag & Drop your files here
                  </p>
                  <p className="text-emerald-600">
                    OR
                  </p>
                </div>
                <button
                  type="button"
                  className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-full text-base font-medium transition-all duration-200 inline-flex items-center gap-2 group"
                >
                  Browse Files
                  <svg 
                    className="w-5 h-5 transform transition-transform group-hover:translate-x-1" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" 
                    />
                  </svg>
                </button>
              </div>
            </div>

            {uploadedFiles.length > 0 && (
              <div className="space-y-4 mt-8">
                {uploadedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="p-2 bg-emerald-100 rounded-lg">
                        <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{file.name}</p>
                        <p className="text-sm text-gray-500">{file.size}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      {file.status === 'uploading' && (
                        <div className="flex items-center space-x-2">
                          <div className="w-24 h-1 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-emerald-500 transition-all duration-200"
                              style={{ width: `${file.progress}%` }}
                            />
                          </div>
                          <span className="text-sm text-gray-600">{file.progress}%</span>
                        </div>
                      )}
                      {file.status === 'complete' && (
                        <div className="bg-emerald-100 p-2 rounded-full">
                          <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                      {file.status === 'error' && (
                        <div className="flex items-center space-x-2 text-red-500">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-sm">{file.error}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {allUploadsComplete && (
              <div className="text-center mt-8">
                <button
                  onClick={handleAnalyzeClick}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg text-base font-medium transition-colors duration-200 inline-flex items-center gap-2"
                >
                  Let&apos;s Analyze
                  <svg 
                    className="w-5 h-5" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 