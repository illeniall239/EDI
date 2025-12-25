import { useRef, useCallback } from 'react';

interface UseAutoResizeTextareaOptions {
  minHeight?: number;
  maxHeight?: number;
}

export const useAutoResizeTextarea = ({
  minHeight = 72,
  maxHeight = 300,
}: UseAutoResizeTextareaOptions = {}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback((reset = false) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (reset) {
      textarea.style.height = `${minHeight}px`;
      return;
    }

    // Reset height to auto to get the actual scroll height
    textarea.style.height = 'auto';
    
    // Calculate the new height
    const scrollHeight = textarea.scrollHeight;
    const newHeight = Math.max(minHeight, Math.min(maxHeight, scrollHeight));
    
    // Set the new height
    textarea.style.height = `${newHeight}px`;
  }, [minHeight, maxHeight]);

  return {
    textareaRef,
    adjustHeight,
  };
};