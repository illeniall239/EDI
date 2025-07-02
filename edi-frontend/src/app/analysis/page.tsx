'use client';

import FileUploadStage from '@/components/FileUploadStage';
import ChatInterface from '@/components/ChatInterface';
import AnimatedBackground from '@/components/AnimatedBackground';
import { useState } from 'react';
import { AnalysisStage } from '@/types';

export default function Analysis() {
  const [currentStage, setCurrentStage] = useState<AnalysisStage>('upload');
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [data, setData] = useState<Array<any>>([]);

  const handleUploadComplete = (previewData: Array<any>) => {
    if (previewData && Array.isArray(previewData)) {
      setData(previewData);
      setIsDataLoaded(true);
      setCurrentStage('analysis');
    }
  };

  if (currentStage === 'upload') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <AnimatedBackground />
        <div className="w-full max-w-3xl relative">
          <FileUploadStage onComplete={handleUploadComplete} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden">
      <ChatInterface isDataLoaded={isDataLoaded} data={data} />
    </div>
  );
} 