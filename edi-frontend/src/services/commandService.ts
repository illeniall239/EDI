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
    type: 'luckysheet_api' | 'data_update' | 'visualization' | 'analysis';
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
    console.log('🔧 === COMMAND SERVICE STARTED ===');
    console.log('📥 Request received:', request);
    console.log('💬 Command:', request.command);
    console.log('🗂️ Context:', request.context);
    
    try {
      const startTime = Date.now();
      console.log('⏰ Request start time:', new Date(startTime).toISOString());
      
      const requestBody = {
        question: request.command,
        is_speech: false // Since we're handling speech locally
      };
      console.log('📦 Request body prepared:', requestBody);
      
      // Use the configured API endpoint that connects to agent_services.py
      console.log('🌐 Making fetch request to:', API_ENDPOINTS.query);
      console.log('🔗 Full URL:', API_ENDPOINTS.query);
      
      const response = await fetch(API_ENDPOINTS.query, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      console.log('📡 === FETCH RESPONSE RECEIVED ===');
      console.log('✅ Response status:', response.status);
      console.log('📋 Response status text:', response.statusText);
      console.log('🏷️ Response headers:', Object.fromEntries(response.headers.entries()));

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

      console.log('📖 Reading response JSON...');
      const data = await response.json();
      console.log('🎉 === JSON RESPONSE PARSED ===');
      console.log('📦 Full response data:', data);
      console.log('💬 Response message:', data.response);
      console.log('🎨 Visualization data:', data.visualization);
      
      const executionTime = Date.now() - startTime;
      console.log('⏱️ Total execution time:', executionTime, 'ms');

      const result = {
        success: true,
        message: data.response || 'Command processed successfully',
        visualization: data.visualization,
        data_updated: data.data_updated,
        updated_data: data.updated_data,
        executionTime
      };
      
      console.log('✅ === COMMAND SERVICE SUCCESS ===');
      console.log('📤 Returning result:', result);
      return result;
      
    } catch (error) {
      console.log('❌ === COMMAND SERVICE ERROR ===');
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
      
      console.log('📤 Returning error result:', errorResult);
      return errorResult;
    }
  }

  // Process spreadsheet commands using LLM
  async processSpreadsheetCommand(command: string): Promise<CommandResponse> {
    console.log('📊 === PROCESS SPREADSHEET COMMAND ===');
    console.log('💬 Spreadsheet command:', command);
    
    try {
      const startTime = Date.now();
      
      // Use the specialized spreadsheet command endpoint
      const requestBody = {
        command: command
      };
      
      console.log('🌐 Making fetch request to:', API_ENDPOINTS.spreadsheetCommand);
      
      const response = await fetch(API_ENDPOINTS.spreadsheetCommand, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Add debugging to check the raw response text
      const responseText = await response.text();
      console.log('📄 Raw response text:', responseText);
      
      // Safely parse the JSON
      let data;
      try {
        data = JSON.parse(responseText);
        console.log('✅ Successfully parsed response JSON:', data);
      } catch (parseError) {
        console.error('❌ JSON parsing error:', parseError);
        console.error('❌ Invalid JSON response:', responseText);
        return {
          success: false,
          message: `Error parsing server response: ${parseError}. Please check server logs.`,
          executionTime: Date.now() - startTime
        };
      }
      
      const executionTime = Date.now() - startTime;
      
      // Check if we have a valid response property
      if (!data.response) {
        console.error('❌ Missing response property in data:', data);
        return {
          success: false,
          message: 'Invalid server response: missing response property',
          executionTime
        };
      }
      
      // Parse the LLM's response to extract Luckysheet API call details
      const apiCallMatch = data.response.match(/luckysheet\.(\w+)\(([^)]*)\)/);
      
      if (apiCallMatch) {
        const method = apiCallMatch[1];
        const paramsString = apiCallMatch[2] || '';
        
        console.log(`📊 Detected Luckysheet API call: ${method} with params: ${paramsString}`);
        
        // Handle different API methods
        if (method === 'autoFitColumns') {
          return {
            success: true,
            message: 'Columns auto-fitted successfully',
            action: {
              type: 'luckysheet_api',
              payload: {
                method,
                params: []
              }
            },
            executionTime
          };
        }
        
        // Handle setColumnWidth method - expects an object like {columnIndex: width}
        if (method === 'setColumnWidth') {
          try {
            // More robust parsing of the params
            let columnWidthObj;
            
            // Clean up the paramsString first to ensure valid JSON
            const cleanParamsString = paramsString
              .replace(/'/g, '"')       // Replace single quotes with double quotes
              .replace(/(\w+):/g, '"$1":') // Add quotes around property names if missing
              .trim();
              
            console.log('🔍 Cleaned params string for JSON parsing:', cleanParamsString);
            
            try {
              columnWidthObj = JSON.parse(cleanParamsString);
            } catch (innerParseError) {
              console.error('❌ Error parsing cleaned params:', innerParseError);
              
              // Fallback: try to extract values using regex
              const columnWidthMatch = paramsString.match(/\{?\s*(\d+)\s*:\s*(\d+)\s*\}?/);
              if (columnWidthMatch) {
                const columnIndex = columnWidthMatch[1];
                const width = parseInt(columnWidthMatch[2]);
                columnWidthObj = { [columnIndex]: width };
                console.log('✅ Extracted column width using regex:', columnWidthObj);
              } else {
                throw new Error(`Could not parse column width parameters: ${paramsString}`);
              }
            }
            
            // Get the first key-value pair from the object
            const columnIndex = Object.keys(columnWidthObj)[0];
            const width = columnWidthObj[columnIndex];
            
            console.log('✅ Final parsed column width:', { columnIndex, width });
            
            return {
              success: true,
              message: `Column width adjusted successfully`,
              action: {
                type: 'luckysheet_api',
                payload: {
                  method,
                  params: [{ [columnIndex]: width }]
                }
              },
              executionTime
            };
          } catch (parseError) {
            console.error('❌ Error parsing setColumnWidth params:', parseError);
            return {
              success: false,
              message: `Error parsing column width parameters: ${parseError}`,
              executionTime
            };
          }
        }
        
        // Split parameters and handle them individually for other methods
        const paramsList = paramsString.split(',').map((p: string): string => p.trim());
        
        // For setCellFormat, we need exactly 4 parameters: row, column, attr, value
        if (method === 'setCellFormat' && paramsList.length === 4) {
          const [row, col, attr, value] = paramsList;
          
          // Convert row and column to numbers
          const rowNum = parseInt(row);
          const colNum = parseInt(col);
          
          // Remove quotes from attr
          const attrClean = attr.replace(/['"]/g, '');
          
          // Handle value based on type
          let finalValue = value;
          if (value === '1' || value === '0') {
            finalValue = parseInt(value);
          } else {
            // Remove quotes from color values
            finalValue = value.replace(/['"]/g, '');
          }
          
          return {
            success: true,
            message: data.response || 'Command processed successfully',
            action: {
              type: 'luckysheet_api',
              payload: {
                method,
                params: [rowNum, colNum, attrClean, finalValue]
              }
            },
            executionTime
          };
        }
        
        // If we couldn't parse the specific method, return a generic success
        return {
          success: true,
          message: `Command processed: ${data.response}`,
          action: {
            type: 'luckysheet_api',
            payload: {
              method,
              params: paramsString ? [paramsString] : []
            }
          },
          executionTime
        };
      }
      
      // If no API call was detected, just return the response as a message
      return {
        success: true,
        message: data.response || 'Command processed but no API call detected',
        executionTime
      };
      
    } catch (error) {
      console.error('❌ Error in processSpreadsheetCommand:', error);
      return {
        success: false,
        message: `Error processing spreadsheet command: ${error}`,
        executionTime: 0
      };
    }
  }

  // Specific method for data analysis commands
  async analyzeData(command: string, data: any[][]): Promise<CommandResponse> {
    console.log('📊 === ANALYZE DATA METHOD ===');
    console.log('💬 Analysis command:', command);
    console.log('📈 Data dimensions:', `${data.length} rows x ${data[0]?.length || 0} columns`);
    console.log('📋 Data sample (first row):', data[0]);
    
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
    
    console.log('✅ analyzeData completed, returning:', result);
    return result;
  }

  // Method for visualization commands
  async createVisualization(command: string, data: any[][]): Promise<CommandResponse> {
    console.log('🎨 === CREATE VISUALIZATION METHOD ===');
    console.log('🖼️ Visualization command:', command);
    console.log('📈 Data dimensions:', `${data.length} rows x ${data[0]?.length || 0} columns`);
    
    const result = await this.processComplexCommand({
      command: `Create visualization: ${command}`,
      context: {
        currentData: data
      }
    });
    
    console.log('✅ createVisualization completed, returning:', result);
    return result;
  }

  // Method for data transformation commands
  async transformData(command: string, data: any[][]): Promise<CommandResponse> {
    console.log('🔄 === TRANSFORM DATA METHOD ===');
    console.log('⚙️ Transform command:', command);
    console.log('📈 Data dimensions:', `${data.length} rows x ${data[0]?.length || 0} columns`);
    
    const result = await this.processComplexCommand({
      command: `Transform data: ${command}`,
      context: {
        currentData: data
      }
    });
    
    console.log('✅ transformData completed, returning:', result);
    return result;
  }
}

// Utility function to determine if a command needs backend processing
export function requiresBackendProcessing(command: string): boolean {
  const complexPatterns = [
    /\b(analyze|analysis|insights?|trends?|patterns?)\b/i,
    /\b(chart|graph|plot|visualiz|histogram|scatter)\b/i,
    /\b(calculate|compute|sum|average|mean|median|count)\b/i,
    /\b(filter|search|find|where|contains)\b/i,
    /\b(group|aggregate|pivot|summarize)\b/i,
    /\b(correlation|regression|statistics|stats)\b/i,
    /\b(export|save|download)\b/i,
    /\b(format|style|color|highlight|bold|italic)\b/i
  ];

  return complexPatterns.some(pattern => pattern.test(command));
}

// Export singleton instance
export const commandService = new CommandService(); 