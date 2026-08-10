/**
 * Integration-style seam tests for custom field bundle write outcomes.
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { CustomFieldsAPIClient } from '../../api/domains/custom-fields-api.js';
import type { YouTrackConfig } from '../../api/base/base-client.js';

describe('CustomFieldsAPIClient - Bundle Methods', () => {
  let client: CustomFieldsAPIClient;
  let mockGet: any;
  let mockPost: any;

  beforeEach(() => {
    const config: YouTrackConfig = {
      baseURL: 'https://youtrack.test.com',
      token: 'test-token-123',
    };

    client = new CustomFieldsAPIClient(config);
    mockGet = jest.spyOn((client as any).axios, 'get');
    mockPost = jest.spyOn((client as any).axios, 'post');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('keeps enum as the backward-compatible bundle default and exposes completeness', async () => {
    mockGet.mockResolvedValue({ data: [], status: 200 });

    const result = await client.listEnumBundles();

    expect(mockGet).toHaveBeenCalledWith(
      '/admin/customFieldSettings/bundles/enum',
      {
        params: {
          fields: 'id,name,isUpdateable,$type,values(id,name,description,ordinal,archived)',
          $top: 100,
          $skip: 0,
        },
      }
    );
    const response = JSON.parse(result.content[0].text);
    expect(response.data).toEqual([]);
    expect(Array.isArray(response.data)).toBe(true);
    expect(response.metadata).toMatchObject({
      count: 0,
      totalCount: 0,
      returnedCount: 0,
      completeness: 'complete',
      truncated: false,
      responseSchemaVersion: 2,
      nestedCollections: {
        values: { included: true, completeness: 'unknown', truncated: 'unknown' },
      },
    });
  });

  test('reads state bundles from the state endpoint with isResolved', async () => {
    mockGet.mockResolvedValue({ data: [], status: 200 });

    await client.listBundles('state');

    expect(mockGet).toHaveBeenCalledWith(
      '/admin/customFieldSettings/bundles/state',
      {
        params: {
          fields: 'id,name,isUpdateable,$type,values(id,name,description,ordinal,archived,isResolved)',
          $top: 100,
          $skip: 0,
        },
      }
    );
  });

  test('forces a stable ID into caller-selected list fields for safe pagination', async () => {
    mockGet.mockImplementation((_endpoint: string, config?: any) => Promise.resolve({
      data: (config?.params?.$skip ?? 0) === 0
        ? [{ id: 'bundle-state', name: 'States' }]
        : [],
      status: 200,
    }));

    const result = await client.listBundles('state', 'name,values(name,id,description)');

    expect(mockGet).toHaveBeenCalledWith(
      '/admin/customFieldSettings/bundles/state',
      {
        params: {
          fields: 'id,name,values(name,id,description)',
          $top: 100,
          $skip: 0,
        },
      }
    );
    const response = JSON.parse(result.content[0].text);
    expect(response.data).toEqual([{ id: 'bundle-state', name: 'States' }]);
    expect(response.metadata).toMatchObject({
      count: 1,
      totalCount: 1,
      completeness: 'complete',
      truncated: false,
    });
  });

  test('forces a top-level ID into custom get fields that only contain nested IDs', async () => {
    mockGet.mockResolvedValue({
      data: {
        id: 'bundle-state',
        name: 'States',
        values: [{ name: 'Open', id: 'value-open' }],
      },
      status: 200,
    });

    const result = await client.getBundle(
      'bundle-state',
      'state',
      'name,values(name,id)'
    );

    expect(mockGet).toHaveBeenCalledWith(
      '/admin/customFieldSettings/bundles/state/bundle-state',
      { params: { fields: 'id,name,values(name,id)' } }
    );
    expect(JSON.parse(result.content[0].text).success).toBe(true);
  });

  test('marks a repeated bundle page incomplete instead of inventing a total', async () => {
    mockGet.mockResolvedValue({
      data: [{ id: 'bundle-state', name: 'States' }],
      status: 200,
    });

    const result = await client.listBundles('state');

    const response = JSON.parse(result.content[0].text);
    expect(response.data).toEqual([{ id: 'bundle-state', name: 'States' }]);
    expect(response.metadata).toMatchObject({
      returnedCount: 1,
      completeness: 'unknown',
      truncated: true,
    });
  });

  test('gets a target bundle with fully paged value metadata', async () => {
    mockGet.mockImplementation((endpoint: string) => {
      if (endpoint === '/admin/customFieldSettings/bundles/state/bundle-state') {
        return Promise.resolve({
          data: { id: 'bundle-state', name: 'States', isUpdateable: true },
          status: 200,
        });
      }
      if (endpoint === '/admin/customFieldSettings/bundles/state/bundle-state/values') {
        return Promise.resolve({ data: [], status: 200 });
      }
      return Promise.reject(new Error(`Unexpected GET ${endpoint}`));
    });

    const result = await client.getBundle('bundle-state', 'state');

    expect(mockGet).toHaveBeenCalledWith(
      '/admin/customFieldSettings/bundles/state/bundle-state/values',
      {
        params: {
          fields: 'id,name,description,ordinal,archived,isResolved',
          $top: 100,
          $skip: 0,
        },
      }
    );
    const response = JSON.parse(result.content[0].text);
    expect(response.data.valuesMetadata).toEqual({
      returnedCount: 0,
      completeness: 'complete',
      truncated: false,
    });
  });

  test('creates a bundle only after a complete name preflight and verifies it by fresh GET', async () => {
    let bundleListFirstPageCall = 0;
    mockGet.mockImplementation((endpoint: string, config?: any) => {
      if (endpoint === '/admin/customFieldSettings/bundles/state') {
        if ((config?.params?.$skip ?? 0) > 0) {
          return Promise.resolve({ data: [], status: 200 });
        }
        bundleListFirstPageCall += 1;
        return Promise.resolve({
          data: bundleListFirstPageCall === 1
            ? []
            : [{ id: 'bundle-new', name: 'Delivery states' }],
          status: 200,
        });
      }
      if (endpoint === '/admin/customFieldSettings/bundles/state/bundle-new') {
        return Promise.resolve({
          data: { id: 'bundle-new', name: 'Delivery states', isUpdateable: true },
          status: 200,
        });
      }
      if (endpoint === '/admin/customFieldSettings/bundles/state/bundle-new/values') {
        return Promise.resolve({ data: [], status: 200 });
      }
      return Promise.reject(new Error(`Unexpected GET ${endpoint}`));
    });
    mockPost.mockResolvedValue({
      data: { id: 'bundle-new', name: 'Delivery states' },
      status: 200,
    });

    const result = await client.createBundle({
      name: 'Delivery states',
      bundleType: 'state',
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/admin/customFieldSettings/bundles/state',
      { name: 'Delivery states' },
      {
        retry: false,
        params: {
          fields: 'id,name,isUpdateable,$type,values(id,name,description,ordinal,archived,isResolved)',
        },
      }
    );
    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    expect(response.data).toMatchObject({
      outcome: 'verified',
      writeAttempted: true,
      writeAccepted: true,
      verified: true,
    });
  });

  test('resolves and verifies an accepted create response that omits the bundle ID', async () => {
    let bundleListFirstPageCall = 0;
    mockGet.mockImplementation((endpoint: string, config?: any) => {
      if (endpoint === '/admin/customFieldSettings/bundles/state') {
        if ((config?.params?.$skip ?? 0) > 0) {
          return Promise.resolve({ data: [], status: 200 });
        }
        bundleListFirstPageCall += 1;
        return Promise.resolve({
          data: bundleListFirstPageCall === 1
            ? []
            : [{ id: 'bundle-new', name: 'Delivery states' }],
          status: 200,
        });
      }
      if (endpoint === '/admin/customFieldSettings/bundles/state/bundle-new') {
        return Promise.resolve({
          data: { id: 'bundle-new', name: 'Delivery states' },
          status: 200,
        });
      }
      if (endpoint === '/admin/customFieldSettings/bundles/state/bundle-new/values') {
        return Promise.resolve({ data: [], status: 200 });
      }
      return Promise.reject(new Error(`Unexpected GET ${endpoint}`));
    });
    mockPost.mockResolvedValue({ data: {}, status: 200 });

    const result = await client.createBundle({
      name: 'Delivery states',
      bundleType: 'state',
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    expect(response.data).toMatchObject({
      outcome: 'verified',
      writeAccepted: true,
      verified: true,
      bundleId: 'bundle-new',
      resolution: { matchCount: 1, finalStateVerified: true },
    });
  });

  test('does not verify an ID-less create response when fresh name resolution is ambiguous', async () => {
    let bundleListFirstPageCall = 0;
    mockGet.mockImplementation((endpoint: string, config?: any) => {
      if (endpoint === '/admin/customFieldSettings/bundles/state') {
        if ((config?.params?.$skip ?? 0) > 0) {
          return Promise.resolve({ data: [], status: 200 });
        }
        bundleListFirstPageCall += 1;
        return Promise.resolve({
          data: bundleListFirstPageCall === 1
            ? []
            : [
                { id: 'bundle-new-1', name: 'Delivery states' },
                { id: 'bundle-new-2', name: ' delivery   STATES ' },
              ],
          status: 200,
        });
      }
      return Promise.reject(new Error(`Unexpected GET ${endpoint}`));
    });
    mockPost.mockResolvedValue({ data: {}, status: 200 });

    const result = await client.createBundle({
      name: 'Delivery states',
      bundleType: 'state',
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(false);
    expect(response.context).toMatchObject({
      outcome: 'accepted_but_not_verified',
      writeAccepted: true,
      verified: false,
      resolution: { matchCount: 2, finalStateVerified: false },
    });
  });

  test('reports a definite create rejection without calling it indeterminate', async () => {
    mockGet.mockResolvedValue({ data: [], status: 200 });
    mockPost.mockRejectedValue(new Error('YouTrack API Error (409): duplicate name'));

    const result = await client.createBundle({
      name: 'Delivery states',
      bundleType: 'state',
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(false);
    expect(response.context).toMatchObject({
      outcome: 'rejected',
      writeAttempted: true,
      writeAccepted: false,
      indeterminate: false,
      httpStatus: 409,
    });
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  test('does not create a duplicate when one equivalent bundle already exists', async () => {
    mockGet.mockImplementation((endpoint: string, config?: any) => {
      if (endpoint === '/admin/customFieldSettings/bundles/state') {
        return Promise.resolve({
          data: (config?.params?.$skip ?? 0) === 0
            ? [{ id: 'bundle-existing', name: 'Delivery states' }]
            : [],
          status: 200,
        });
      }
      if (endpoint === '/admin/customFieldSettings/bundles/state/bundle-existing') {
        return Promise.resolve({
          data: { id: 'bundle-existing', name: 'Delivery states' },
          status: 200,
        });
      }
      if (endpoint === '/admin/customFieldSettings/bundles/state/bundle-existing/values') {
        return Promise.resolve({ data: [], status: 200 });
      }
      return Promise.reject(new Error(`Unexpected GET ${endpoint}`));
    });

    const result = await client.createBundle({
      name: 'Delivery states',
      bundleType: 'state',
    });

    expect(mockPost).not.toHaveBeenCalled();
    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    expect(response.data.outcome).toBe('verified_noop');
  });

  test('rejects duplicate normalized initial value names before creating a bundle', async () => {
    const result = await client.createBundle({
      name: 'Delivery states',
      bundleType: 'state',
      values: [
        { name: 'QA on Stage', isResolved: false },
        { name: ' qa   ON stage ', isResolved: false },
      ],
    });

    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(false);
    expect(response.error).toContain('duplicate value names');
    expect(response.context.writeAttempted).toBe(false);
  });

  test('lost create response stays indeterminate after unique final-state resolution', async () => {
    let bundleListCall = 0;
    mockGet.mockImplementation((endpoint: string, config?: any) => {
      if (endpoint === '/admin/customFieldSettings/bundles/state') {
        bundleListCall += 1;
        if (bundleListCall === 1) return Promise.resolve({ data: [], status: 200 });
        return Promise.resolve({
          data: (config?.params?.$skip ?? 0) === 0
            ? [{ id: 'bundle-new', name: 'Delivery states' }]
            : [],
          status: 200,
        });
      }
      if (endpoint === '/admin/customFieldSettings/bundles/state/bundle-new') {
        return Promise.resolve({
          data: { id: 'bundle-new', name: 'Delivery states' },
          status: 200,
        });
      }
      if (endpoint === '/admin/customFieldSettings/bundles/state/bundle-new/values') {
        return Promise.resolve({ data: [], status: 200 });
      }
      return Promise.reject(new Error(`Unexpected GET ${endpoint}`));
    });
    mockPost.mockRejectedValue(new Error('timeout'));

    const result = await client.createBundle({
      name: 'Delivery states',
      bundleType: 'state',
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(false);
    expect(response.context).toMatchObject({
      outcome: 'indeterminate',
      writeAttempted: true,
      writeAccepted: null,
      finalStateVerified: true,
      indeterminate: true,
      resolution: { bundleId: 'bundle-new', finalStateVerified: true },
    });
  });

  test('adds a state value without retry and verifies the specific created value', async () => {
    let valuesFirstPageCall = 0;
    mockGet.mockImplementation((endpoint: string, config?: any) => {
      if (endpoint === '/admin/customFieldSettings/bundles/state/bundle-state') {
        return Promise.resolve({
          data: { id: 'bundle-state', name: 'States', isUpdateable: true },
          status: 200,
        });
      }
      if (endpoint === '/admin/customFieldSettings/bundles/state/bundle-state/values') {
        if ((config?.params?.$skip ?? 0) > 0) {
          return Promise.resolve({ data: [], status: 200 });
        }
        valuesFirstPageCall += 1;
        return Promise.resolve({
          data: valuesFirstPageCall === 1
            ? []
            : [{ id: 'value-qa-dev', name: 'QA on Dev' }],
          status: 200,
        });
      }
      if (endpoint.endsWith('/values/value-qa-dev')) {
        return Promise.resolve({
          data: {
            id: 'value-qa-dev',
            name: 'QA on Dev',
            description: 'Awaiting QA',
            isResolved: false,
            archived: false,
            ordinal: 5,
          },
          status: 200,
        });
      }
      return Promise.reject(new Error(`Unexpected GET ${endpoint}`));
    });
    mockPost.mockResolvedValue({
      data: { id: 'value-qa-dev', name: 'QA on Dev' },
      status: 200,
    });

    const result = await client.addBundleValue(
      'bundle-state',
      {
        name: 'QA on Dev',
        description: 'Awaiting QA',
        isResolved: false,
        archived: false,
        ordinal: 5,
      },
      'state'
    );

    expect(mockPost).toHaveBeenCalledWith(
      '/admin/customFieldSettings/bundles/state/bundle-state/values',
      {
        name: 'QA on Dev',
        description: 'Awaiting QA',
        isResolved: false,
        archived: false,
        ordinal: 5,
      },
      {
        retry: false,
        params: { fields: 'id,name,description,ordinal,archived,isResolved' },
      }
    );
    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    expect(response.data).toMatchObject({
      writeAccepted: true,
      verified: true,
      valueId: 'value-qa-dev',
    });
  });

  test('resolves and verifies an accepted add response that omits the value ID', async () => {
    let valuesFirstPageCall = 0;
    mockGet.mockImplementation((endpoint: string, config?: any) => {
      if (endpoint.endsWith('/bundle-state')) {
        return Promise.resolve({
          data: { id: 'bundle-state', name: 'States', isUpdateable: true },
          status: 200,
        });
      }
      if (endpoint.endsWith('/bundle-state/values')) {
        if ((config?.params?.$skip ?? 0) > 0) {
          return Promise.resolve({ data: [], status: 200 });
        }
        valuesFirstPageCall += 1;
        return Promise.resolve({
          data: valuesFirstPageCall === 1
            ? []
            : [{ id: 'value-qa', name: 'QA', isResolved: false }],
          status: 200,
        });
      }
      if (endpoint.endsWith('/bundle-state/values/value-qa')) {
        return Promise.resolve({
          data: { id: 'value-qa', name: 'QA', isResolved: false },
          status: 200,
        });
      }
      return Promise.reject(new Error(`Unexpected GET ${endpoint}`));
    });
    mockPost.mockResolvedValue({ data: {}, status: 200 });

    const result = await client.addBundleValue(
      'bundle-state',
      { name: 'QA', isResolved: false },
      'state'
    );

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    expect(response.data).toMatchObject({
      outcome: 'verified',
      writeAccepted: true,
      verified: true,
      valueId: 'value-qa',
      resolution: { matchCount: 1, finalStateVerified: true },
    });
  });

  test('does not verify an ID-less add response when fresh name resolution is ambiguous', async () => {
    let valuesFirstPageCall = 0;
    mockGet.mockImplementation((endpoint: string, config?: any) => {
      if (endpoint.endsWith('/bundle-state')) {
        return Promise.resolve({
          data: { id: 'bundle-state', name: 'States', isUpdateable: true },
          status: 200,
        });
      }
      if (endpoint.endsWith('/bundle-state/values')) {
        if ((config?.params?.$skip ?? 0) > 0) {
          return Promise.resolve({ data: [], status: 200 });
        }
        valuesFirstPageCall += 1;
        return Promise.resolve({
          data: valuesFirstPageCall === 1
            ? []
            : [
                { id: 'value-qa-1', name: 'QA', isResolved: false },
                { id: 'value-qa-2', name: ' qa ', isResolved: false },
              ],
          status: 200,
        });
      }
      return Promise.reject(new Error(`Unexpected GET ${endpoint}`));
    });
    mockPost.mockResolvedValue({ data: {}, status: 200 });

    const result = await client.addBundleValue(
      'bundle-state',
      { name: 'QA', isResolved: false },
      'state'
    );

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(false);
    expect(response.context).toMatchObject({
      outcome: 'accepted_but_not_verified',
      writeAccepted: true,
      verified: false,
      resolution: { matchCount: 2, finalStateVerified: false },
    });
  });

  test('returns a verified no-op for one equivalent existing value', async () => {
    mockGet.mockImplementation((endpoint: string, config?: any) => {
      if (endpoint.endsWith('/bundle-state')) {
        return Promise.resolve({
          data: { id: 'bundle-state', name: 'States', isUpdateable: true },
          status: 200,
        });
      }
      if (endpoint.endsWith('/bundle-state/values')) {
        return Promise.resolve({
          data: (config?.params?.$skip ?? 0) === 0
            ? [{ id: 'value-qa', name: 'QA', isResolved: false }]
            : [],
          status: 200,
        });
      }
      return Promise.reject(new Error(`Unexpected GET ${endpoint}`));
    });

    const result = await client.addBundleValue(
      'bundle-state',
      { name: 'QA', isResolved: false },
      'state'
    );

    expect(mockPost).not.toHaveBeenCalled();
    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    expect(response.data.outcome).toBe('verified_noop');
  });

  test('fails before POST when duplicate equivalent value names exist', async () => {
    mockGet.mockImplementation((endpoint: string, config?: any) => {
      if (endpoint.endsWith('/bundle-state')) {
        return Promise.resolve({
          data: { id: 'bundle-state', name: 'States', isUpdateable: true },
          status: 200,
        });
      }
      if (endpoint.endsWith('/bundle-state/values')) {
        return Promise.resolve({
          data: (config?.params?.$skip ?? 0) === 0
            ? [
                { id: 'value-1', name: 'QA on Stage' },
                { id: 'value-2', name: ' qa   ON stage ' },
              ]
            : [],
          status: 200,
        });
      }
      return Promise.reject(new Error(`Unexpected GET ${endpoint}`));
    });

    const result = await client.addBundleValue(
      'bundle-state',
      { name: 'QA ON STAGE', isResolved: false },
      'state'
    );

    expect(mockPost).not.toHaveBeenCalled();
    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(false);
    expect(response.error).toContain('ambiguous');
    expect(response.context.writeAttempted).toBe(false);
  });

  test('lost add response stays indeterminate even when unique final state is verified', async () => {
    let valuesListCall = 0;
    mockGet.mockImplementation((endpoint: string, config?: any) => {
      if (endpoint.endsWith('/bundle-state')) {
        return Promise.resolve({
          data: { id: 'bundle-state', name: 'States', isUpdateable: true },
          status: 200,
        });
      }
      if (endpoint.endsWith('/bundle-state/values')) {
        valuesListCall += 1;
        if (valuesListCall === 1) return Promise.resolve({ data: [], status: 200 });
        return Promise.resolve({
          data: (config?.params?.$skip ?? 0) === 0
            ? [{ id: 'value-qa', name: 'QA', isResolved: false }]
            : [],
          status: 200,
        });
      }
      if (endpoint.endsWith('/bundle-state/values/value-qa')) {
        return Promise.resolve({
          data: { id: 'value-qa', name: 'QA', isResolved: false },
          status: 200,
        });
      }
      return Promise.reject(new Error(`Unexpected GET ${endpoint}`));
    });
    mockPost.mockRejectedValue(new Error('timeout'));

    const result = await client.addBundleValue(
      'bundle-state',
      { name: 'QA', isResolved: false },
      'state'
    );

    expect(mockPost).toHaveBeenCalledTimes(1);
    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(false);
    expect(response.context).toMatchObject({
      outcome: 'indeterminate',
      writeAttempted: true,
      writeAccepted: null,
      finalStateVerified: true,
      indeterminate: true,
    });
  });

  test('reports a definite add rejection without calling it indeterminate', async () => {
    let valuesReadCount = 0;
    mockGet.mockImplementation((endpoint: string) => {
      if (endpoint.endsWith('/bundle-state')) {
        return Promise.resolve({
          data: { id: 'bundle-state', name: 'States', isUpdateable: true },
          status: 200,
        });
      }
      if (endpoint.endsWith('/bundle-state/values')) {
        valuesReadCount += 1;
        return Promise.resolve({ data: [], status: 200 });
      }
      return Promise.reject(new Error(`Unexpected GET ${endpoint}`));
    });
    mockPost.mockRejectedValue(new Error('YouTrack API Error (403): forbidden'));

    const result = await client.addBundleValue(
      'bundle-state',
      { name: 'QA', isResolved: false },
      'state'
    );

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(false);
    expect(response.context).toMatchObject({
      outcome: 'rejected',
      writeAttempted: true,
      writeAccepted: false,
      indeterminate: false,
      httpStatus: 403,
    });
    expect(valuesReadCount).toBe(1);
  });

  test('does not report a successful add when a concurrent duplicate name appears', async () => {
    let valuesFirstPageCall = 0;
    mockGet.mockImplementation((endpoint: string, config?: any) => {
      if (endpoint.endsWith('/bundle-state')) {
        return Promise.resolve({
          data: { id: 'bundle-state', name: 'States', isUpdateable: true },
          status: 200,
        });
      }
      if (endpoint.endsWith('/bundle-state/values')) {
        if ((config?.params?.$skip ?? 0) > 0) {
          return Promise.resolve({ data: [], status: 200 });
        }
        valuesFirstPageCall += 1;
        return Promise.resolve({
          data: valuesFirstPageCall === 1
            ? []
            : [
                { id: 'value-created', name: 'QA' },
                { id: 'value-racing', name: ' qa ' },
              ],
          status: 200,
        });
      }
      if (endpoint.endsWith('/values/value-created')) {
        return Promise.resolve({
          data: { id: 'value-created', name: 'QA', isResolved: false },
          status: 200,
        });
      }
      return Promise.reject(new Error(`Unexpected GET ${endpoint}`));
    });
    mockPost.mockResolvedValue({ data: { id: 'value-created' }, status: 200 });

    const result = await client.addBundleValue(
      'bundle-state',
      { name: 'QA', isResolved: false },
      'state'
    );

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(false);
    expect(response.context).toMatchObject({
      writeAccepted: true,
      verified: false,
      verification: {
        uniqueName: { verified: false, matchCount: 2 },
      },
    });
  });

  test('updates a state value by stable ID and verifies requested properties only', async () => {
    let valueReadCount = 0;
    let valuesFirstPageCall = 0;
    mockGet.mockImplementation((endpoint: string, config?: any) => {
      if (endpoint.endsWith('/bundle-state')) {
        return Promise.resolve({
          data: { id: 'bundle-state', name: 'States', isUpdateable: true },
          status: 200,
        });
      }
      if (endpoint.endsWith('/bundle-state/values')) {
        if ((config?.params?.$skip ?? 0) > 0) {
          return Promise.resolve({ data: [], status: 200 });
        }
        valuesFirstPageCall += 1;
        return Promise.resolve({
          data: valuesFirstPageCall === 1
            ? [{ id: 'value-ready-release', name: 'Old name' }]
            : [{ id: 'value-ready-release', name: 'Ready for Release' }],
          status: 200,
        });
      }
      if (endpoint.endsWith('/values/value-ready-release')) {
        valueReadCount += 1;
        return Promise.resolve({
          data: valueReadCount === 1
            ? { id: 'value-ready-release', name: 'Old name', ordinal: 99 }
            : { id: 'value-ready-release', name: 'Ready for Release', ordinal: 99 },
          status: 200,
        });
      }
      return Promise.reject(new Error(`Unexpected GET ${endpoint}`));
    });
    mockPost.mockResolvedValue({ data: { id: 'value-ready-release' }, status: 200 });

    const result = await client.updateBundleValue(
      'bundle-state',
      'value-ready-release',
      { name: 'Ready for Release' },
      'state'
    );

    expect(mockPost).toHaveBeenCalledWith(
      '/admin/customFieldSettings/bundles/state/bundle-state/values/value-ready-release',
      { name: 'Ready for Release' },
      {
        retry: false,
        params: { fields: 'id,name,description,ordinal,archived,isResolved' },
      }
    );
    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    expect(response.data.verified).toBe(true);
  });

  test('lost update response remains an error even when final state is verified', async () => {
    let valueReadCount = 0;
    mockGet.mockImplementation((endpoint: string) => {
      if (endpoint.endsWith('/bundle-state')) {
        return Promise.resolve({
          data: { id: 'bundle-state', name: 'States', isUpdateable: true },
          status: 200,
        });
      }
      if (endpoint.endsWith('/values/value-qa')) {
        valueReadCount += 1;
        return Promise.resolve({
          data: valueReadCount === 1
            ? { id: 'value-qa', archived: false }
            : { id: 'value-qa', archived: true },
          status: 200,
        });
      }
      return Promise.reject(new Error(`Unexpected GET ${endpoint}`));
    });
    mockPost.mockRejectedValue(new Error('timeout'));

    const result = await client.updateBundleValue(
      'bundle-state',
      'value-qa',
      { archived: true },
      'state'
    );

    expect(mockPost).toHaveBeenCalledTimes(1);
    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(false);
    expect(response.context).toMatchObject({
      outcome: 'indeterminate',
      writeAccepted: null,
      finalStateVerified: true,
      indeterminate: true,
    });
  });

  test('reports a definite update rejection without a second value read', async () => {
    let valueReadCount = 0;
    mockGet.mockImplementation((endpoint: string) => {
      if (endpoint.endsWith('/bundle-state')) {
        return Promise.resolve({
          data: { id: 'bundle-state', name: 'States', isUpdateable: true },
          status: 200,
        });
      }
      if (endpoint.endsWith('/values/value-qa')) {
        valueReadCount += 1;
        return Promise.resolve({
          data: { id: 'value-qa', archived: false },
          status: 200,
        });
      }
      return Promise.reject(new Error(`Unexpected GET ${endpoint}`));
    });
    mockPost.mockRejectedValue(new Error('YouTrack API Error (404): missing'));

    const result = await client.updateBundleValue(
      'bundle-state',
      'value-qa',
      { archived: true },
      'state'
    );

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(false);
    expect(response.context).toMatchObject({
      outcome: 'rejected',
      writeAttempted: true,
      writeAccepted: false,
      indeterminate: false,
      httpStatus: 404,
    });
    expect(valueReadCount).toBe(1);
  });

  test('fails a rename before POST when another value owns the normalized name', async () => {
    mockGet.mockImplementation((endpoint: string, config?: any) => {
      if (endpoint.endsWith('/bundle-state')) {
        return Promise.resolve({
          data: { id: 'bundle-state', name: 'States', isUpdateable: true },
          status: 200,
        });
      }
      if (endpoint.endsWith('/bundle-state/values')) {
        return Promise.resolve({
          data: (config?.params?.$skip ?? 0) === 0
            ? [
                { id: 'value-current', name: 'Current' },
                { id: 'value-other', name: 'Ready' },
              ]
            : [],
          status: 200,
        });
      }
      return Promise.reject(new Error(`Unexpected GET ${endpoint}`));
    });

    const result = await client.updateBundleValue(
      'bundle-state',
      'value-current',
      { name: ' ready ' },
      'state'
    );

    expect(mockPost).not.toHaveBeenCalled();
    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(false);
    expect(response.error).toContain('another value');
    expect(response.context.writeAttempted).toBe(false);
  });

  test('fails before POST when a state bundle is not updateable', async () => {
    mockGet.mockResolvedValue({
      data: { id: 'bundle-state', name: 'Shared states', isUpdateable: false },
      status: 200,
    });

    const result = await client.addBundleValue(
      'bundle-state',
      { name: 'QA on Stage', isResolved: false },
      'state'
    );

    expect(mockPost).not.toHaveBeenCalled();
    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(false);
    expect(response.error).toContain('not updateable');
    expect(response.context).toMatchObject({
      bundleId: 'bundle-state',
      bundleType: 'state',
      bundleName: 'Shared states',
      isUpdateable: false,
      writeAttempted: false,
      indeterminate: false,
    });
  });

  test('fails closed when bundle update permission cannot be confirmed', async () => {
    mockGet.mockResolvedValue({
      data: { id: 'bundle-state', name: 'States' },
      status: 200,
    });

    const result = await client.updateBundleValue(
      'bundle-state',
      'value-qa-stage',
      { name: 'QA on Stage' },
      'state'
    );

    expect(mockPost).not.toHaveBeenCalled();
    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(false);
    expect(response.error).toContain('Cannot confirm update permission');
  });

  test('keeps legacy enum value creation on the enum endpoint', async () => {
    let valuesFirstPageCall = 0;
    mockGet.mockImplementation((endpoint: string, config?: any) => {
      if (endpoint.endsWith('/bundle-enum')) {
        return Promise.resolve({
          data: { id: 'bundle-enum', name: 'Options', isUpdateable: true },
          status: 200,
        });
      }
      if (endpoint.endsWith('/bundle-enum/values')) {
        if ((config?.params?.$skip ?? 0) > 0) {
          return Promise.resolve({ data: [], status: 200 });
        }
        valuesFirstPageCall += 1;
        return Promise.resolve({
          data: valuesFirstPageCall === 1
            ? []
            : [{ id: 'enum-value', name: 'Option' }],
          status: 200,
        });
      }
      if (endpoint.endsWith('/bundle-enum/values/enum-value')) {
        return Promise.resolve({
          data: { id: 'enum-value', name: 'Option', description: 'Legacy option' },
          status: 200,
        });
      }
      return Promise.reject(new Error(`Unexpected GET ${endpoint}`));
    });
    mockPost.mockResolvedValue({ data: { id: 'enum-value', name: 'Option' }, status: 200 });

    const result = await client.addEnumBundleValue('bundle-enum', 'Option', 'Legacy option');

    expect(mockPost).toHaveBeenCalledWith(
      '/admin/customFieldSettings/bundles/enum/bundle-enum/values',
      { name: 'Option', description: 'Legacy option' },
      {
        retry: false,
        params: { fields: 'id,name,description,ordinal,archived' },
      }
    );
    expect(JSON.parse(result.content[0].text).success).toBe(true);
  });
});
