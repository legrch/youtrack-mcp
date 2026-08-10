/**
 * Integration Tests for BaseAPIClient and Infrastructure
 * 
 * Tests HTTP client, cache, error handling, and response formatting
 */

import { BaseAPIClient, type YouTrackConfig } from '../../api/base/base-client.js';
import { CacheManager } from '../../api/base/cache-manager.js';
import { ErrorHandler } from '../../api/base/error-handler.js';
import { ResponseFormatter } from '../../api/base/response-formatter.js';
import { AxiosError } from 'axios';
import { jest } from '@jest/globals';

class RetryTestClient extends BaseAPIClient {
  postEndpoint(endpoint: string, retry?: boolean) {
    return retry === undefined
      ? this.post(endpoint, { query: 'test' })
      : this.post(endpoint, { query: 'test' }, { retry });
  }
}

describe('BaseAPIClient - Integration Tests', () => {
  let config: YouTrackConfig;
  let client: BaseAPIClient;

  beforeEach(() => {
    config = {
      baseURL: 'https://youtrack.example.com',
      token: 'test-token-123',
      timeout: 5000,
      enableCache: true,
    };
    client = new BaseAPIClient(config);
  });

  describe('Initialization', () => {
    test('should initialize with correct configuration', () => {
      expect(client).toBeInstanceOf(BaseAPIClient);
      expect((client as any).config).toMatchObject({
        baseURL: 'https://youtrack.example.com',
        token: 'test-token-123',
        timeout: 5000,
      });
    });

    test('should append /api to baseURL if missing', () => {
      const testClient = new BaseAPIClient({
        baseURL: 'https://youtrack.example.com',
        token: 'test-token',
      });
      
      const axiosConfig = (testClient as any).axios.defaults;
      expect(axiosConfig.baseURL).toBe('https://youtrack.example.com/api');
    });

    test('should not duplicate /api in baseURL', () => {
      const testClient = new BaseAPIClient({
        baseURL: 'https://youtrack.example.com/api',
        token: 'test-token',
      });
      
      const axiosConfig = (testClient as any).axios.defaults;
      expect(axiosConfig.baseURL).toBe('https://youtrack.example.com/api');
      expect(axiosConfig.baseURL).not.toContain('/api/api');
    });

    test('should set default timeout', () => {
      const axiosConfig = (client as any).axios.defaults;
      expect(axiosConfig.timeout).toBe(5000);
    });

    test('should use default timeout when not specified', () => {
      const defaultClient = new BaseAPIClient({
        baseURL: 'https://youtrack.example.com',
        token: 'test-token',
      });
      
      const axiosConfig = (defaultClient as any).axios.defaults;
      expect(axiosConfig.timeout).toBe(30000); // Default timeout
    });
  });

  describe('HTTP Client Configuration', () => {
    test('should configure authorization header', () => {
      const axiosConfig = (client as any).axios.defaults;
      expect(axiosConfig.headers.Authorization).toBe('Bearer test-token-123');
    });

    test('should set correct content-type', () => {
      const axiosConfig = (client as any).axios.defaults;
      expect(axiosConfig.headers['Content-Type']).toBe('application/json');
    });

    test('should set accept header', () => {
      const axiosConfig = (client as any).axios.defaults;
      expect(axiosConfig.headers.Accept).toBe('application/json');
    });

    test('does not retry a request whose retry flag is false', async () => {
      const retryClient = new RetryTestClient({
        ...config,
        retryAttempts: 3,
        retryDelay: 0,
      });
      const adapter = jest.fn((requestConfig: any) => Promise.reject(
        new AxiosError('timeout', 'ECONNABORTED', requestConfig, {})
      ));
      (retryClient as any).axios.defaults.adapter = adapter;

      await expect(retryClient.postEndpoint('/other-mutation', false))
        .rejects.toThrow('Network error');

      expect(adapter).toHaveBeenCalledTimes(1);
    });

    test('never retries POST /commands with query parameters even when retry is enabled', async () => {
      const retryClient = new RetryTestClient({
        ...config,
        retryAttempts: 3,
        retryDelay: 0,
      });
      const adapter = jest.fn((requestConfig: any) => Promise.reject(
        new AxiosError('timeout', 'ECONNABORTED', requestConfig, {})
      ));
      (retryClient as any).axios.defaults.adapter = adapter;

      await expect(retryClient.postEndpoint('/commands?muteUpdateNotifications=true', true))
        .rejects.toThrow('Network error');

      expect(adapter).toHaveBeenCalledTimes(1);
    });

    test.each([503, 429])('never retries POST /commands after HTTP %i', async status => {
      const retryClient = new RetryTestClient({
        ...config,
        retryAttempts: 3,
        retryDelay: 0,
      });
      const adapter = jest.fn((requestConfig: any) => {
        const error = new AxiosError(`HTTP ${status}`, undefined, requestConfig);
        (error as any).response = {
          status,
          statusText: String(status),
          data: {},
          headers: {},
          config: requestConfig,
        };
        return Promise.reject(error);
      });
      (retryClient as any).axios.defaults.adapter = adapter;

      await expect(retryClient.postEndpoint('/commands'))
        .rejects.toThrow(`YouTrack API Error (${status})`);

      expect(adapter).toHaveBeenCalledTimes(1);
    });

    test('preserves the historical single-retry budget for retryable requests', async () => {
      const retryClient = new RetryTestClient({
        ...config,
        retryAttempts: 2,
        retryDelay: 0,
      });
      const adapter = jest.fn((requestConfig: any) => Promise.reject(
        new AxiosError('timeout', 'ECONNABORTED', requestConfig, {})
      ));
      (retryClient as any).axios.defaults.adapter = adapter;

      await expect(retryClient.postEndpoint('/other-mutation'))
        .rejects.toThrow('Network error');

      expect(adapter).toHaveBeenCalledTimes(2);
    });

    test('allows retryAttempts to disable retries with zero', async () => {
      const retryClient = new RetryTestClient({
        ...config,
        retryAttempts: 0,
        retryDelay: 0,
      });
      const adapter = jest.fn((requestConfig: any) => Promise.reject(
        new AxiosError('timeout', 'ECONNABORTED', requestConfig, {})
      ));
      (retryClient as any).axios.defaults.adapter = adapter;

      await expect(retryClient.postEndpoint('/other-mutation'))
        .rejects.toThrow('Network error');

      expect(adapter).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cache Integration', () => {
    test('should initialize cache manager', () => {
      expect((client as any).cache).toBeInstanceOf(CacheManager);
    });

    test('should enable cache when configured', () => {
      const cachedClient = new BaseAPIClient({
        ...config,
        enableCache: true,
      });
      
      const cache = (cachedClient as any).cache;
      expect(cache).toBeDefined();
    });

    test('should support cache even when disabled by default', () => {
      const noCacheClient = new BaseAPIClient({
        ...config,
        enableCache: false,
      });
      
      // Cache manager should still exist, just not used
      const cache = (noCacheClient as any).cache;
      expect(cache).toBeDefined();
    });
  });

    describe('Error Handler Integration', () => {
    test('should initialize error handler', () => {
      expect((client as any).errorHandler).toBeInstanceOf(ErrorHandler);
    });

    test('should have error handler available for all clients', () => {
      const handler = (client as any).errorHandler;
      expect(handler).toBeDefined();
      expect(handler).toBeInstanceOf(ErrorHandler);
    });
  });

  describe('Multiple Client Instances', () => {
    test('should create independent client instances', () => {
      const client1 = new BaseAPIClient({
        baseURL: 'https://server1.example.com',
        token: 'token1',
      });

      const client2 = new BaseAPIClient({
        baseURL: 'https://server2.example.com',
        token: 'token2',
      });

      const config1 = (client1 as any).axios.defaults;
      const config2 = (client2 as any).axios.defaults;

      expect(config1.baseURL).toBe('https://server1.example.com/api');
      expect(config2.baseURL).toBe('https://server2.example.com/api');
      expect(config1.headers.Authorization).toBe('Bearer token1');
      expect(config2.headers.Authorization).toBe('Bearer token2');
    });

    test('should have independent cache instances', () => {
      const testConfig = {
        baseURL: 'https://youtrack.example.com',
        token: 'test-token',
      };
      const client1 = new BaseAPIClient(testConfig);
      const client2 = new BaseAPIClient(testConfig);

      const cache1 = (client1 as any).cache;
      const cache2 = (client2 as any).cache;

      expect(cache1).not.toBe(cache2);
    });
  });
});

describe('CacheManager - Integration Tests', () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager();
  });

  describe('Cache Operations', () => {
    test('should store and retrieve values', () => {
      cache.set('test-key', { data: 'test-value' });
      const result = cache.get('test-key');
      
      expect(result).toBeDefined();
      expect(result?.data).toEqual({ data: 'test-value' });
    });

    test('should return null for missing keys', () => {
      const result = cache.get('nonexistent-key');
      expect(result).toBeNull();
    });

    test('should overwrite existing keys', () => {
      cache.set('test-key', { data: 'value1' });
      cache.set('test-key', { data: 'value2' });
      
      const result = cache.get('test-key');
      expect(result?.data).toEqual({ data: 'value2' });
    });

    test('should handle multiple keys independently', () => {
      cache.set('key1', { value: 1 });
      cache.set('key2', { value: 2 });
      cache.set('key3', { value: 3 });

      expect(cache.get('key1')?.data).toEqual({ value: 1 });
      expect(cache.get('key2')?.data).toEqual({ value: 2 });
      expect(cache.get('key3')?.data).toEqual({ value: 3 });
    });

    test('should clear all cached values', () => {
      cache.set('key1', { value: 1 });
      cache.set('key2', { value: 2 });
      
      cache.clear();

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });

    test('should delete specific keys', () => {
      cache.set('key1', { value: 1 });
      cache.set('key2', { value: 2 });
      
      cache.delete('key1');

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeDefined();
    });
  });

  describe('Cache TTL', () => {
    test('should respect TTL when set', async () => {
      cache.set('expiring-key', { data: 'test' }, 1); // 1 second TTL
      
      // Value should be available immediately
      const immediate = cache.get('expiring-key');
      expect(immediate).toBeDefined();
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      expect(cache.get('expiring-key')).toBeNull();
    });

    test('should not expire without TTL or with long TTL', async () => {
      cache.set('permanent-key', { data: 'test' }, 3600); // 1 hour TTL
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const result = cache.get('permanent-key');
      expect(result).toBeDefined();
    });
  });

  describe('Cache Statistics', () => {
    test('should check key existence', () => {
      expect(cache.has('test-key')).toBe(false);
      
      cache.set('test-key', { data: 'test' });
      expect(cache.has('test-key')).toBe(true);
      
      cache.delete('test-key');
      expect(cache.has('test-key')).toBe(false);
    });

    test('should get cache statistics', () => {
      const stats = cache.getStats();
      
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('sets');
      expect(typeof stats.hits).toBe('number');
    });
  });
});

describe('ErrorHandler - Integration Tests', () => {
  describe('Static Error Handling', () => {
    test('should have static handleApiError method', () => {
      expect(typeof ErrorHandler.handleApiError).toBe('function');
    });

    test('should throw on handleApiError call', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 404,
          data: { error: 'Not found' },
        },
        config: { url: '/test' },
        name: 'AxiosError',
        message: 'Not found',
        toJSON: () => ({}),
      } as any;

      expect(() => {
        ErrorHandler.handleApiError(axiosError);
      }).toThrow();
    });

    test('should preserve the network error when the Axios request is circular', () => {
      const request: any = {};
      const agent = {
        sockets: {
          'youtrack.example.com:443': [{ _httpMessage: request }],
        },
      };
      request.agent = agent;

      const axiosError = new AxiosError(
        'socket hang up',
        'ECONNRESET',
        { method: 'get', url: '/agiles/board-1' } as any,
        request
      );

      expect(() => ErrorHandler.handleApiError(axiosError))
        .toThrow('Network error: Unable to reach YouTrack server');
    });
  });
});

describe('ResponseFormatter - Integration Tests', () => {
  describe('Success Responses', () => {
    test('should format success response', () => {
      const data = { id: '123', name: 'Test' };
      const response = ResponseFormatter.formatSuccess(data, 'Operation successful');

      expect(response).toHaveProperty('content');
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content[0].type).toBe('text');
      expect(response.content[0].text).toContain('Test');
    });

    test('should format created response', () => {
      const data = { id: 'NEW-1', title: 'New Item' };
      const response = ResponseFormatter.formatCreated(data, 'Item', 'Item created');

      expect(response.content[0].text).toContain('created');
      expect(response.content[0].text).toContain('NEW-1');
    });

    test('should format list response', () => {
      const items = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
        { id: '3', name: 'Item 3' },
      ];
      
      const response = ResponseFormatter.formatList(items, 'Items');

      expect(response.content[0].text).toContain('3');
      expect(response.content[0].text).toContain('Item');
    });

    test('should handle empty lists', () => {
      const response = ResponseFormatter.formatList([], 'Items');

      expect(response.content[0].text).toContain('0');
    });
  });

  describe('Error Responses', () => {
    test('should format error response', () => {
      const response = ResponseFormatter.formatError('Something went wrong', {
        code: 'ERROR_CODE',
      });

      expect(response.content[0].text).toContain('Something went wrong');
      expect(response.content[0].text).toContain('ERROR_CODE');
    });
  });

  describe('Response Structure', () => {
    test('should always include content array', () => {
      const response = ResponseFormatter.formatSuccess({}, 'Test');
      
      expect(response).toHaveProperty('content');
      expect(Array.isArray(response.content)).toBe(true);
    });

    test('should always include text type', () => {
      const response = ResponseFormatter.formatSuccess({}, 'Test');
      
      expect(response.content[0]).toHaveProperty('type');
      expect(response.content[0].type).toBe('text');
    });

    test('should always include text content', () => {
      const response = ResponseFormatter.formatSuccess({}, 'Test');
      
      expect(response.content[0]).toHaveProperty('text');
      expect(typeof response.content[0].text).toBe('string');
    });
  });
});
