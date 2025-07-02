import { useState, useRef } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';

interface FileStatus {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress?: number;
  error?: string;
}

interface FileUploadManagerProps {
  onFileUpload: (files: File[]) => Promise<void>;
  isExpanded: boolean;
}

export default function FileUploadManager({ onFileUpload, isExpanded }: FileUploadManagerProps) {
  const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { currentWorkspace } = useWorkspace();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles = Array.from(event.target.files);
      const newFileStatuses = newFiles.map(file => ({
        file,
        status: 'pending' as const,
      }));
      
      setFileStatuses(prev => [...prev, ...newFileStatuses]);
      
      try {
        // Update status to uploading
        newFileStatuses.forEach((status, index) => {
          setFileStatuses(prev => prev.map((s, i) => 
            i === prev.length - newFiles.length + index 
              ? { ...s, status: 'uploading' }
              : s
          ));
        });

        await onFileUpload(newFiles);

        // Update status to success
        newFileStatuses.forEach((status, index) => {
          setFileStatuses(prev => prev.map((s, i) => 
            i === prev.length - newFiles.length + index 
              ? { ...s, status: 'success' }
              : s
          ));
        });
      } catch (error) {
        // Update status to error
        newFileStatuses.forEach((status, index) => {
          setFileStatuses(prev => prev.map((s, i) => 
            i === prev.length - newFiles.length + index 
              ? { ...s, status: 'error', error: error instanceof Error ? error.message : 'Upload failed' }
              : s
          ));
        });
      }
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.files) {
      const newFiles = Array.from(event.dataTransfer.files);
      const newFileStatuses = newFiles.map(file => ({
        file,
        status: 'pending' as const,
      }));
      
      setFileStatuses(prev => [...prev, ...newFileStatuses]);
      
      try {
        // Update status to uploading
        newFileStatuses.forEach((status, index) => {
          setFileStatuses(prev => prev.map((s, i) => 
            i === prev.length - newFiles.length + index 
              ? { ...s, status: 'uploading' }
              : s
          ));
        });

        await onFileUpload(newFiles);

        // Update status to success
        newFileStatuses.forEach((status, index) => {
          setFileStatuses(prev => prev.map((s, i) => 
            i === prev.length - newFiles.length + index 
              ? { ...s, status: 'success' }
              : s
          ));
        });
      } catch (error) {
        // Update status to error
        newFileStatuses.forEach((status, index) => {
          setFileStatuses(prev => prev.map((s, i) => 
            i === prev.length - newFiles.length + index 
              ? { ...s, status: 'error', error: error instanceof Error ? error.message : 'Upload failed' }
              : s
          ));
        });
      }
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const cycleToNextFile = () => {
    if (fileStatuses.length > 1) {
      setCurrentFileIndex((prev) => (prev + 1) % fileStatuses.length);
    }
  };

  const cycleToPreviousFile = () => {
    if (fileStatuses.length > 1) {
      setCurrentFileIndex((prev) => (prev - 1 + fileStatuses.length) % fileStatuses.length);
    }
  };

  const removeFile = (index: number) => {
    setFileStatuses(prev => prev.filter((_, i) => i !== index));
    if (currentFileIndex >= index && currentFileIndex > 0) {
      setCurrentFileIndex(prev => prev - 1);
    }
  };

  const getStatusBadge = (status: FileStatus['status']) => {
    switch (status) {
      case 'uploading':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
            Uploading
            <svg className="ml-1.5 w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </span>
        );
      case 'success':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
            Uploaded
            <svg className="ml-1 w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
            Failed
            <svg className="ml-1 w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
            Pending
            <svg className="ml-1 w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {isExpanded && currentWorkspace && (
        <div className="text-sm font-medium text-gray-900">
          Workspace: {currentWorkspace.name}
        </div>
      )}

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={`
          border-2 border-dashed border-gray-300 rounded-lg
          ${isExpanded ? 'p-4' : 'p-2'}
          hover:border-emerald-500 transition-colors duration-150
          flex flex-col items-center justify-center gap-2
          cursor-pointer
        `}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          multiple
          className="hidden"
        />
        
        <svg
          className={`${isExpanded ? 'w-8 h-8' : 'w-6 h-6'} text-gray-400`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>

        {isExpanded && (
          <div className="text-center">
            <p className="text-sm font-medium text-gray-900">
              Drop files here or click to upload
            </p>
            <p className="text-xs text-gray-500">
              Upload any file type
            </p>
          </div>
        )}
      </div>

      {isExpanded && fileStatuses.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-900">
              Uploaded Files ({fileStatuses.length})
            </span>
          </div>

          <div className="space-y-1">
            {fileStatuses.map((fileStatus, index) => (
              <div
                key={index}
                onClick={() => setCurrentFileIndex(index)}
                className={`
                  flex items-center justify-between py-1.5 px-3 rounded transition-colors duration-150 cursor-pointer
                  ${index === currentFileIndex 
                    ? 'bg-emerald-50 border border-emerald-200' 
                    : 'hover:bg-gray-50'
                  }
                `}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-900 truncate">
                    {fileStatus.file.name}
                  </span>
                  <span className="text-xs text-gray-500">
                    ({(fileStatus.file.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(fileStatus.status)}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(index);
                    }}
                    className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
                    aria-label="Remove file"
                  >
                    <svg className="w-3.5 h-3.5 text-gray-400 hover:text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {fileStatuses.some(fs => fs.status === 'error' && fs.error) && (
            <div className="mt-2 text-sm text-red-600 bg-red-50 rounded-md p-2">
              One or more files failed to upload. Please try again.
            </div>
          )}
        </div>
      )}
    </div>
  );
} 