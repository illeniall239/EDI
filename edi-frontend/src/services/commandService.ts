// Command Service for Backend Integration
import { API_ENDPOINTS } from '@/config';

export interface CommandRequest {
  command: string;
  context?: {
    currentData?: any[][];
    selectedRange?: any;
    sheetInfo?: any;
  };
}

export interface CommandResponse {
  success: boolean;
  message: string;
  action?: {
    type: 'data_update' | 'visualization' | 'analysis';
    payload: any;
  };
  executionTime?: number;
  visualization?: {
    type: string;
    path: string;
    original_query?: string;
  };
  data_updated?: boolean;
  updated_data?: {
    data: Array<any>;
    columns: string[];
    rows: number;
  };
}

export class CommandService {
  async processComplexCommand(request: CommandRequest): Promise<CommandResponse> {
    
    try {
      const startTime = Date.now();
      
      const requestBody = {
        question: request.command,
        is_speech: false // Since we're handling speech locally
      };
      
      // Use the configured API endpoint that connects to agent_services.py
      
      const response = await fetch(API_ENDPOINTS.query, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });


      if (!response.ok) {
        console.error('❌ HTTP Error detected');
        console.error('🔢 Status code:', response.status);
        console.error('📝 Status text:', response.statusText);
        
        let errorText = 'Unknown error';
        try {
          errorText = await response.text();
          console.error('📄 Error response body:', errorText);
        } catch (textError) {
          console.error('💥 Failed to read error response:', textError);
        }
        
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      const executionTime = Date.now() - startTime;

      const result = {
        success: true,
        message: data.response || 'Command processed successfully',
        visualization: data.visualization,
        data_updated: data.data_updated,
        updated_data: data.updated_data,
        executionTime
      };
      
      return result;
      
    } catch (error) {
      console.error('💥 Error caught:', error);
      console.error('🔍 Error type:', typeof error);
      console.error('📋 Error message:', error instanceof Error ? error.message : 'Unknown error');
      console.error('🗂️ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      
      if (error instanceof TypeError && error.message.includes('fetch')) {
        console.error('🌐 Network error detected - likely backend server is not running');
      }
      
      const errorResult = {
        success: false,
        message: `Failed to process command: ${error instanceof Error ? error.message : 'Unknown error'}`,
        executionTime: 0
      };
      
      return errorResult;
    }
  }

  // Specific method for data analysis commands
  async analyzeData(command: string, data: any[][]): Promise<CommandResponse> {
    
    const result = await this.processComplexCommand({
      command,
      context: {
        currentData: data,
        sheetInfo: {
          rows: data.length,
          columns: data[0]?.length || 0
        }
      }
    });
    
    return result;
  }

  // Method for visualization commands
  async createVisualization(command: string, data: any[][]): Promise<CommandResponse> {
    
    const result = await this.processComplexCommand({
      command: `Create visualization: ${command}`,
      context: {
        currentData: data
      }
    });
    
    return result;
  }

  // Method for data transformation commands
  async transformData(command: string, data: any[][]): Promise<CommandResponse> {
    
    const result = await this.processComplexCommand({
      command: `Transform data: ${command}`,
      context: {
        currentData: data
      }
    });
    
    return result;
  }

}

// Export singleton instance
export const commandService = new CommandService(); 