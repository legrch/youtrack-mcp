import { AxiosError } from 'axios';
import { logError } from '../../logger.js';

export interface ErrorContext {
  method?: string;
  endpoint?: string;
  params?: any;
  status?: number;
  url?: string;
  data?: any;
}

/**
 * Unified Error Handler for all YouTrack API interactions
 * Provides consistent error processing, logging, and user-friendly messages
 */
export class ErrorHandler {
  
  /**
   * Process and format API errors consistently
   */
  static handleApiError(error: AxiosError, context?: ErrorContext): never {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as any;
      
      let message = `YouTrack API Error (${status})`;
      
      // Extract meaningful error messages
      if (data?.error_description) {
        message += `: ${data.error_description}`;
      } else if (data?.error) {
        message += `: ${data.error}`;
      } else if (data?.message) {
        message += `: ${data.message}`;
      } else {
        message += `: ${error.message}`;
      }
      
      // Add context-specific information
      if (context?.method) {
        message = `${context.method} failed - ${message}`;
      }
      
      const errorContext = {
        ...context,
        status,
        url: error.config?.url,
        httpMethod: error.config?.method,
        responseData: data
      };
      
      // Only log stack traces for unexpected errors (not 404, 400, 403)
      const isExpectedError = [400, 403, 404].includes(status);
      if (isExpectedError) {
        // Log without stack trace for expected errors
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'warn',
          message,
          service: 'youtrack-mcp',
          context: errorContext
        }));
      } else {
        // Log with stack trace for unexpected errors
        logError(new Error(message), errorContext);
      }
      
      throw new Error(message);
      
    } else if (error.request) {
      const message = 'Network error: Unable to reach YouTrack server';
      logError(new Error(message), {
        errorMessage: error.message,
        errorCode: error.code,
        httpMethod: error.config?.method,
        url: error.config?.url,
        hasRequest: true
      });
      throw new Error(message);
      
    } else {
      const message = `Request setup error: ${error.message}`;
      logError(error, { ...context, type: 'request_setup' });
      throw new Error(message);
    }
  }
  
  /**
   * Handle validation errors for input parameters
   */
  static handleValidationError(field: string, value: any, expected: string, context?: ErrorContext): never {
    const message = `Validation error: ${field} (${value}) ${expected}`;
    
    logError(new Error(message), {
      ...context,
      type: 'validation',
      field,
      value,
      expected
    });
    
    throw new Error(message);
  }
  
  /**
   * Handle business logic errors (e.g., resource not found, permission denied)
   */
  static handleBusinessError(message: string, context?: ErrorContext): never {
    logError(new Error(message), {
      ...context,
      type: 'business_logic'
    });
    
    throw new Error(message);
  }
  
  /**
   * Wrap async operations with consistent error handling
   */
  static async wrapAsync<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Error && error.message.includes('YouTrack API Error')) {
        // Already processed, re-throw
        throw error;
      }
      
      if (error && typeof error === 'object' && 'response' in error) {
        return ErrorHandler.handleApiError(error as AxiosError, context);
      }
      
      // Generic error handling
      const message = `Operation failed: ${error instanceof Error ? error.message : String(error)}`;
      logError(new Error(message), { ...context, originalError: error });
      throw new Error(message);
    }
  }
  
  /**
   * Create error context for method calls
   */
  static createContext(method: string, params?: any): ErrorContext {
    return {
      method,
      params: params ? JSON.stringify(params) : undefined
    };
  }
}
