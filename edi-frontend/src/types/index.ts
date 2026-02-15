export interface DataPreview {
    message: string;
    preview: Record<string, any>[];
    columns: string[];
    filename: string;
    data: Array<any>;
    sheet_id?: string;  // Optional Google Sheet ID returned from backend
}

export interface ClarificationOption {
    id: string;
    title: string;
    description: string;
    category: string;
}

export interface ClarificationResponse {
    type: 'clarification' | 'conversational_input';
    message: string;
    options: ClarificationOption[];
    original_query: string;
}

export interface QueryResponse {
    response: string;
    visualization?: {
        type: 'matplotlib_figure' | 'plotly_html';
        path: string;
        original_query?: string;
    };
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
    visualization?: {
        type: 'matplotlib_figure' | 'plotly_html';
        path: string;
        original_query?: string;
    };
    analysis?: {
        chart_type: string;
        patterns: string;
        insights: string;
        full_analysis: string;
        source: 'gemini' | 'fallback' | 'error';
        confidence: 'high' | 'medium' | 'low';
    };
    analysisError?: string;
    clarification?: ClarificationResponse;
}

export interface DataState {
    isLoaded: boolean;
    preview: Record<string, any>[] | null;
    columns: string[] | null;
    filename: string | null;
} 

export type AnalysisStage = 'upload' | 'analysis'; 

export type WorkspaceType = 'work' | 'learn';

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

export interface FileUploadManagerProps {
    onFileUpload: (files: File[]) => Promise<void>;
    isExpanded: boolean;
}

// Learning-specific interfaces for Learn Mode
export type SkillLevel = 'novice' | 'practicing' | 'proficient' | 'mastered';
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

export interface LearningProgress {
    concept_id: string;
    skill_level: SkillLevel;
    attempts_count: number;
    mastery_date?: string;
    created_at: string;
}

export interface LearningDataset {
    id: string;
    name: string;
    concept_category: string;
    difficulty_level: DifficultyLevel;
    prerequisites: string[];
    dataset_json: any[];
    instructions: string[];
    learning_objectives: string[];
}

export interface LearnQueryResponse extends QueryResponse {
    type?: 'teaching' | 'socratic_redirect' | 'prerequisite_redirect';
    guidingQuestions?: string[];
    suggested_concept?: string;
    step_by_step_breakdown?: string[];
}

// Note: TypeAnimation types are now handled by the package's own type definitions

// Prediction-specific interfaces for Predictive Analytics
export interface PredictionConfig {
    targetColumn: string;
    predictionType: 'auto' | 'forecast' | 'regression' | 'classification' | 'trend';
    periods: number;
    featureColumns?: string[];
    confidenceLevel: number;
}

export interface PredictionResult {
    timestamp?: string;
    period?: number;
    predicted_value?: number;
    lower_bound?: number;
    upper_bound?: number;
    confidence?: number;
    row_index?: number;
    actual?: number;
    predicted?: number;
    residual?: number;
    probabilities?: Record<string, number>;
    [key: string]: any;
}

export interface ModelPerformance {
    metrics: {
        rmse?: number;
        mae?: number;
        r2?: number;
        mape?: number;
        accuracy?: number;
        precision?: number;
        recall?: number;
        f1?: number;
        [key: string]: number | undefined;
    };
    models_compared?: Array<{
        name: string;
        score: number;
        metrics?: Record<string, number>;
    }>;
    selection_reason?: string;
    trend_direction?: string;
    trend_strength?: string;
}

export interface PredictionResponse {
    prediction_type: string;
    method: string;
    predictions: PredictionResult[];
    model_performance: ModelPerformance;
    visualization?: {
        type: 'matplotlib_figure' | 'plotly_html';
        path: string;
    };
    summary: string;
    recommendations: string[];
    feature_importance?: Record<string, number>;
    class_distribution?: Record<string, number>;
    description?: string;
}

// Knowledge Base System interfaces
export interface KnowledgeBase {
    id: string;
    user_id: string;
    name: string;
    description?: string;
    created_at: string;
    updated_at: string;
    embedding_model?: string;
    chunk_size?: number;
    chunk_overlap?: number;
}

export interface KBDocument {
    id: string;
    kb_id: string;
    filename: string;
    file_type: 'pdf' | 'docx' | 'txt' | 'csv' | 'xlsx';
    file_size_bytes?: number;
    upload_date: string;
    processing_status: 'pending' | 'processing' | 'completed' | 'failed';
    error_message?: string;
    page_count?: number;
    total_chunks?: number;
    has_tables?: boolean;
    metadata?: Record<string, any>;
}

export interface KBChat {
    id: string;
    kb_id: string;
    workspace_id?: never; // Ensure workspace_id is not set for KB chats
    title: string;
    messages: ChatMessage[];
    created_at: string;
    updated_at: string;
}

export interface KBSource {
    number: number;
    content: string;
    similarity: number;
    document_id: string;
    metadata?: Record<string, any>;
}

export interface KBQueryResponse {
    response: string;
    sources?: KBSource[];
    structured_data_used?: boolean;
    visualization?: {
        type: 'matplotlib_figure' | 'plotly_html';
        path: string;
    };
    num_sources?: number;
    error?: string;
}

export interface KBUploadProgress {
    filename: string;
    progress: number;
    status: 'uploading' | 'processing' | 'completed' | 'failed';
    error?: string;
}