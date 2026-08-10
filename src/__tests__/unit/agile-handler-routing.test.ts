import { describe, expect, jest, test } from '@jest/globals';
import { YouTrackMCPServer } from '../../server-core.js';

describe('agile handler routing', () => {
  const createHandlerTarget = () => Object.create(YouTrackMCPServer.prototype) as YouTrackMCPServer;

  test('routes the sprints action to the implemented paged listSprints method', async () => {
    const server = createHandlerTarget();
    const expected = { content: [{ type: 'text' as const, text: 'sprints' }] };
    const listSprints = jest.fn<() => Promise<typeof expected>>()
      .mockResolvedValue(expected);
    const client = { agile: { listSprints } };

    const result = await (server as any).handleAgileManage(client, {
      action: 'sprints',
      boardId: 'board-1',
    });

    expect(listSprints).toHaveBeenCalledWith({
      boardId: 'board-1',
      includeArchived: false,
      includeIssues: false,
    });
    expect(result).toBe(expected);
  });
});
