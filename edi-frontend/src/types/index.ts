import React from 'react';

export interface DataPreview {
    message: string;
    preview: Record<string, any>[];
    columns: string[];
    filename: string;
    data: Array<any>;
    sheet_id?: string;  // Optional Google Sheet ID returned from backend
}

export interface QueryResponse {
    response: string;
    visualization?: {
        type: 'matplotlib_figure' | 'plotly_html';
        path: string;
    };
    data_updated?: boolean;
    updated_data?: {
        data: Array<any>;
        columns: string[];
        rows: number;
    };
}

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    isAnalyzing?: boolean;
    isTyping?: boolean;
    visualization?: {
        type: 'matplotlib_figure' | 'plotly_html';
        path: string;
    };
}

export interface DataState {
    isLoaded: boolean;
    preview: Record<string, any>[] | null;
    columns: string[] | null;
    filename: string | null;
} 

export type AnalysisStage = 'upload' | 'analysis'; 

export interface Workspace {
    id: string;
    name: string;
    created_at: string;
}

export interface FileUploadManagerProps {
    onFileUpload: (files: File[]) => Promise<void>;
    isExpanded: boolean;
}

export interface ChatInterfaceProps {
    isDataLoaded: boolean;
    data?: Array<any>;
    onFileUpload?: (files: File[]) => Promise<void>;
}

// Note: TypeAnimation types are now handled by the package's own type definitions 