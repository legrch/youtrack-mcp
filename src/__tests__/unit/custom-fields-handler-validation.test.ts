import { describe, expect, jest, test } from '@jest/globals';
import { YouTrackMCPServer } from '../../server-core.js';

describe('custom_fields handler validation', () => {
  const createHandlerTarget = () => Object.create(YouTrackMCPServer.prototype) as YouTrackMCPServer;

  test('rejects an unsupported bundleType before calling the API client', async () => {
    const server = createHandlerTarget();
    const listBundles = jest.fn();
    const client = { customFields: { listBundles } };

    await expect((server as any).handleCustomFieldsManage(client, {
      action: 'list_bundles',
      bundleType: 'owned',
    })).rejects.toThrow('bundleType must be either enum or state');

    expect(listBundles).not.toHaveBeenCalled();
  });

  test('rejects an empty bundle value update before calling the API client', async () => {
    const server = createHandlerTarget();
    const updateBundleValue = jest.fn();
    const client = { customFields: { updateBundleValue } };

    await expect((server as any).handleCustomFieldsManage(client, {
      action: 'update_bundle_value',
      bundleType: 'state',
      bundleId: 'bundle-state',
      valueId: 'value-qa-dev',
    })).rejects.toThrow('update_bundle_value requires at least one value property to update');

    expect(updateBundleValue).not.toHaveBeenCalled();
  });

  test('rejects state-only isResolved updates for enum bundles', async () => {
    const server = createHandlerTarget();
    const updateBundleValue = jest.fn();
    const client = { customFields: { updateBundleValue } };

    await expect((server as any).handleCustomFieldsManage(client, {
      action: 'update_bundle_value',
      bundleType: 'enum',
      bundleId: 'bundle-enum',
      valueId: 'value-option',
      isResolved: false,
    })).rejects.toThrow('isResolved is only supported for state bundle values');

    expect(updateBundleValue).not.toHaveBeenCalled();
  });
});
