export interface DataPreview {
    message: string;
    preview: Record<string, any>[];
    columns: string[];
    filename: string;
    data: Array<any>;
    sheet_id?: string;  // Optional Google Sheet ID returned from backend
}

export interface ChartSpec {
    type: 'chart_spec';
    chart_type: 'bar' | 'line' | 'area' | 'pie' | 'scatter';
    title?: string;
    x_key: string;
    series: Array<{ key: string; label: string }>;
    data: Array<Record<string, unknown>>;
    sql?: string;
    original_query?: string;
}

/**
 * Charts are returned as data for the client to render. The image variants are
 * legacy: a file path only resolves on the backend instance that wrote it, so
 * it does not survive on serverless.
 */
export type Visualization =
    | ChartSpec
    | {
          type: 'matplotlib_figure' | 'plotly_html';
          path: string;
          original_query?: string;
      };

export interface QueryResponse {
    response: string;
    visualization?: Visualization;
    data_updated?: boolean;
    updated_data?: {
        data: Array<any>;
        columns: string[];
        rows: number;
    };
    success?: boolean;
    clarification_resolved?: boolean;
}

export interface ChatMessage {
    id?: string;
    type?: 'user' | 'assistant';
    role?: 'user' | 'assistant';
    content: string;
    timestamp?: Date | number;
    isAnalyzing?: boolean;
    isTyping?: boolean;
    visualization?: Visualization;
    analysis?: {
        chart_type: string;
        patterns: string;
        insights: string;
        full_analysis: string;
        source: 'model' | 'fallback' | 'error';
        confidence: 'high' | 'medium' | 'low';
    };
    analysisError?: string;
}

export type WorkspaceType = 'work';

export interface Workspace {
    id: string;
    name: string;
    workspace_type: WorkspaceType;
    created_at: string;
    description?: string;
}

export interface Chat {
    id: string;
    workspace_id: string;
    title: string;
    messages: ChatMessage[];
    context_state?: any;  // For storing LangChain memory state
    created_at: string;
    updated_at: string;
}

// Note: TypeAnimation types are now handled by the package's own type definitions