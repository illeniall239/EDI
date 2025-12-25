'use client';

import { useEffect, useRef, useState } from 'react';

// TypeScript declarations for UnicornStudio
declare global {
  interface Window {
    UnicornStudio?: {
      isInitialized: boolean;
      init?: () => void;
    };
  }
}

// Global state management for UnicornStudio script
class UnicornStudioManager {
  private static instance: UnicornStudioManager;
  private scriptElement: HTMLScriptElement | null = null;
  private loadPromise: Promise<void> | null = null;
  private isLoaded = false;
  private isLoading = false;
  private retryCount = 0;
  private maxRetries = 3;
  private readonly scriptSrc = "https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v1.4.29/dist/unicornStudio.umd.js";
  private readonly scriptId = 'unicornstudio-sdk';

  static getInstance(): UnicornStudioManager {
    if (!UnicornStudioManager.instance) {
      UnicornStudioManager.instance = new UnicornStudioManager();
    }
    return UnicornStudioManager.instance;
  }

  private log(message: string, ...args: any[]): void {
    console.log(`🦄 UnicornStudio: ${message}`, ...args);
  }

  private error(message: string, ...args: any[]): void {
    console.error(`🦄 UnicornStudio: ${message}`, ...args);
  }

  async loadScript(): Promise<void> {
    // Return existing promise if already loading
    if (this.loadPromise) {
      return this.loadPromise;
    }

    // Return immediately if already loaded
    if (this.isLoaded && window.UnicornStudio) {
      return Promise.resolve();
    }

    // Check if script already exists
    const existingScript = document.getElementById(this.scriptId);
    if (existingScript && window.UnicornStudio) {
      this.log('Script already exists and UnicornStudio is available');
      this.isLoaded = true;
      return Promise.resolve();
    }

    this.isLoading = true;
    this.loadPromise = this.createLoadPromise();
    
    try {
      await this.loadPromise;
      this.isLoaded = true;
      this.isLoading = false;
      this.retryCount = 0;
    } catch (error) {
      this.isLoading = false;
      this.loadPromise = null;
      
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        this.error(`Load failed, retrying (${this.retryCount}/${this.maxRetries})`, error);
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * this.retryCount));
        return this.loadScript();
      } else {
        this.error('Max retries reached, giving up', error);
        throw error;
      }
    }

    return this.loadPromise;
  }

  private createLoadPromise(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.log('Starting script load...');

      // Remove any existing failed script
      const existingScript = document.getElementById(this.scriptId);
      if (existingScript && !window.UnicornStudio) {
        this.log('Removing existing failed script');
        existingScript.remove();
        this.scriptElement = null;
      }

      const script = document.createElement("script");
      script.id = this.scriptId;
      script.src = this.scriptSrc;
      script.type = "text/javascript";
      script.async = true;
      
      const timeout = setTimeout(() => {
        this.error('Script load timeout');
        script.remove();
        reject(new Error('Script load timeout'));
      }, 10000); // 10 second timeout
      
      script.onload = () => {
        clearTimeout(timeout);
        this.log('Script loaded successfully!');
        
        try {
          if (window.UnicornStudio) {
            if (!window.UnicornStudio.isInitialized) {
              (window as any).UnicornStudio.init();
              window.UnicornStudio.isInitialized = true;
              this.log('Global initialization complete!');
            } else {
              this.log('UnicornStudio already initialized');
            }
            resolve();
          } else {
            throw new Error('UnicornStudio not available after script load');
          }
        } catch (error) {
          this.error('Initialization failed:', error);
          reject(error);
        }
      };
      
      script.onerror = (event) => {
        clearTimeout(timeout);
        this.error('Failed to load script', event);
        reject(new Error('Failed to load UnicornStudio script'));
      };
      
      this.scriptElement = script;
      document.head.appendChild(script);
    });
  }

  reinitialize(): void {
    if (window.UnicornStudio && typeof window.UnicornStudio.init === 'function') {
      try {
        (window as any).UnicornStudio.init();
        this.log('Re-initialization complete');
      } catch (error) {
        this.error('Re-initialization failed:', error);
      }
    } else {
      this.error('Cannot reinitialize - UnicornStudio not available');
    }
  }

  cleanup(): void {
    this.log('Cleaning up...');
    // Note: We don't remove the script or reset global state
    // as other components might still be using it
  }
}

export const useUnicornStudio = (projectId: string) => {
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const manager = UnicornStudioManager.getInstance();

  useEffect(() => {
    let isMounted = true;

    const initializeUnicornStudio = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Load the script
        await manager.loadScript();
        
        if (!isMounted) return;

        const container = containerRef.current;
        if (!container) {
          throw new Error('Container ref not available');
        }

        // Set up container attributes
        container.setAttribute('data-us-project', projectId);

        // Reinitialize for this specific container
        manager.reinitialize();

        // Set up observer to detect when content is loaded
        let hasRevealed = false;
        const reveal = () => {
          if (!hasRevealed && isMounted) {
            hasRevealed = true;
            setIsReady(true);
            setIsLoading(false);
            console.log(`🦄 UnicornStudio: Project ${projectId} ready!`);
          }
        };

        // Clean up any existing observer
        if (observerRef.current) {
          observerRef.current.disconnect();
        }

        // Create new observer
        observerRef.current = new MutationObserver((mutations) => {
          const hasContent = mutations.some(mutation => 
            mutation.addedNodes.length > 0 || 
            container.childNodes.length > 0
          );
          
          if (hasContent) {
            reveal();
          }
        });

        observerRef.current.observe(container, { 
          childList: true, 
          subtree: true 
        });

        // Fallback timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          if (isMounted) {
            console.warn(`🦄 UnicornStudio: Fallback timeout for project ${projectId}`);
            reveal();
          }
        }, 3000);

        // Check if content already exists
        if (container.childNodes.length > 0) {
          reveal();
        }

      } catch (err) {
        if (isMounted) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          console.error(`🦄 UnicornStudio: Failed to initialize project ${projectId}:`, errorMessage);
          setError(errorMessage);
          setIsLoading(false);
        }
      }
    };

    initializeUnicornStudio();

    // Cleanup function
    return () => {
      isMounted = false;
      
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      manager.cleanup();
    };
  }, [projectId, manager]);

  return { 
    containerRef, 
    isReady, 
    isLoading, 
    error,
    retry: () => {
      setIsReady(false);
      setIsLoading(true);
      setError(null);
      // Re-trigger the effect by updating a state value
      setIsReady(prev => prev);
    }
  };
};