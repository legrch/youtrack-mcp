import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { CacheManager } from './cache-manager.js';
import { ErrorHandler } from './error-handler.js';

export interface YouTrackConfig {
  baseURL: string;
  token: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  enableCache?: boolean;
}

export interface MCPResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
}

export interface APIResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: any;
}

export interface APIRequestOptions {
  params?: any;
  /** Disable the response interceptor retry loop for this request. */
  retry?: boolean;
}

interface RetryAwareAxiosRequestConfig extends AxiosRequestConfig {
  _retry?: boolean;
  _retryCount?: number;
  retry?: boolean;
}

/**
 * Base API Client - Modern foundation for YouTrack API interactions
 * Provides unified HTTP client, caching, error handling, and response formatting
 */
export class BaseAPIClient {
  protected axios: AxiosInstance;
  protected cache: CacheManager;
  protected errorHandler: ErrorHandler;
  protected config: YouTrackConfig;

  constructor(config: YouTrackConfig) {
    this.config = config;
    
    // Ensure baseURL ends with /api (YouTrack REST API requirement)
    let baseURL = config.baseURL;
    if (!baseURL.endsWith('/api')) {
      baseURL = baseURL.replace(/\/$/, '') + '/api';
    }
    
    // Initialize HTTP client
    this.axios = axios.create({
      baseURL: baseURL,
      timeout: config.timeout || 30000,
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'YouTrack-MCP-Client/1.0'
      }
    });

    // Initialize cache if enabled
    this.cache = new CacheManager({
      defaultTTL: 300,
      maxKeys: 1000
    });

    // Initialize error handler
    this.errorHandler = new ErrorHandler();

    // Set up request/response interceptors
    this.setupInterceptors();
  }

  /**
   * Perform GET request with caching support
   */
  protected async get<T = any>(endpoint: string, params?: any): Promise<APIResponse<T>> {
    const cacheKey = this.cache.generateKey('api', endpoint, params);
    
    if (this.config.enableCache !== false) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return {
          data: cached.data,
          status: 200,
          statusText: 'OK',
          headers: {}
        };
      }
    }

    const response = await this.axios.get(endpoint, { params });
    
    if (this.config.enableCache !== false) {
      this.cache.set(cacheKey, response.data);
    }
    
    return {
      data: response.data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    };
  }

  /**
   * Perform POST request
   */
  protected async post<T = any>(
    endpoint: string,
    data?: any,
    options: APIRequestOptions = {}
  ): Promise<APIResponse<T>> {
    const requestConfig: RetryAwareAxiosRequestConfig = {};
    if (options.params !== undefined) requestConfig.params = options.params;
    if (options.retry !== undefined) requestConfig.retry = options.retry;
    const response = Object.keys(requestConfig).length > 0
      ? await this.axios.post(endpoint, data, requestConfig)
      : await this.axios.post(endpoint, data);
    
    // Invalidate related cache entries
    if (this.config.enableCache !== false) {
      this.invalidateCache(endpoint);
    }
    
    return {
      data: response.data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    };
  }

  /**
   * Perform PUT request
   */
  protected async put<T = any>(endpoint: string, data?: any): Promise<APIResponse<T>> {
    const response = await this.axios.put(endpoint, data);
    
    // Invalidate related cache entries
    if (this.config.enableCache !== false) {
      this.invalidateCache(endpoint);
    }
    
    return {
      data: response.data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    };
  }

  /**
   * Perform PATCH request
   */
  protected async patch<T = any>(endpoint: string, data?: any): Promise<APIResponse<T>> {
    const response = await this.axios.patch(endpoint, data);
    
    // Invalidate related cache entries
    if (this.config.enableCache !== false) {
      this.invalidateCache(endpoint);
    }
    
    return {
      data: response.data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    };
  }

  /**
   * Perform DELETE request
   */
  protected async delete<T = any>(endpoint: string): Promise<APIResponse<T>> {
    const response = await this.axios.delete(endpoint);
    
    // Invalidate related cache entries
    if (this.config.enableCache !== false) {
      this.invalidateCache(endpoint);
    }
    
    return {
      data: response.data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    };
  }

  /**
   * Set up axios interceptors for consistent error handling and retries
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.axios.interceptors.request.use(
      (config) => {
        // API request logging removed to prevent MCP client parse warnings
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor with retry logic
    this.axios.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as RetryAwareAxiosRequestConfig | undefined;
        
        // Retry logic for transient errors
        if (originalRequest &&
            !originalRequest._retry &&
            !this.isRetryDisabled(originalRequest) &&
            this.shouldRetry(error)) {
          originalRequest._retry = true;
          const retryCount = originalRequest._retryCount ?? 0;
          const retryAttempts = this.config.retryAttempts ?? 3;

          if (retryCount < retryAttempts) {
            originalRequest._retryCount = retryCount + 1;
            
            // Exponential backoff
            const delay = (this.config.retryDelay ?? 1000) * Math.pow(2, retryCount);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // Retry logging removed to prevent MCP client parse warnings
            return this.axios(originalRequest);
          }
        }
        
        // Handle error through error handler
        throw ErrorHandler.handleApiError(error);
      }
    );
  }

  /**
   * Determine if error should trigger a retry
   */
  private shouldRetry(error: AxiosError): boolean {
    if (!error.response) return true; // Network errors
    
    const status = error.response.status;
    return status >= 500 || status === 429; // Server errors or rate limiting
  }

  /**
   * Commands are name-based mutations and must never be replayed after an
   * ambiguous response. The request flag provides the same protection for
   * other non-idempotent writes.
   */
  private isRetryDisabled(config: RetryAwareAxiosRequestConfig): boolean {
    if (config.retry === false) return true;
    if (config.method?.toLowerCase() !== 'post') return false;

    const path = (config.url ?? '').split('?')[0].replace(/\/+$/, '');
    return /(?:^|\/)commands$/.test(path);
  }

  /**
   * Invalidate cache entries related to an endpoint
   */
  private invalidateCache(endpoint: string): void {
    const domain = this.extractDomainFromEndpoint(endpoint);
    if (domain) {
      this.cache.invalidateDomain(domain);
    }
  }

  /**
   * Extract domain from API endpoint for cache invalidation
   */
  private extractDomainFromEndpoint(endpoint: string): string | null {
    const patterns = [
      { pattern: /\/api\/issues/, domain: 'issues' },
      { pattern: /\/api\/admin\/projects/, domain: 'projects' },
      { pattern: /\/api\/articles/, domain: 'articles' },
      { pattern: /\/api\/users/, domain: 'users' },
      { pattern: /\/api\/agiles/, domain: 'agile' },
      { pattern: /\/api\/workItems/, domain: 'workitems' },
      { pattern: /\/api\/admin/, domain: 'admin' }
    ];

    for (const { pattern, domain } of patterns) {
      if (pattern.test(endpoint)) {
        return domain;
      }
    }
    
    return null;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
