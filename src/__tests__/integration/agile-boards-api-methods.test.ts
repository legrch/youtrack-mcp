/**
 * Integration Tests for AgileAPIClient Methods
 * Tests agile boards and sprint management
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AgileAPIClient } from '../../api/domains/agile-boards-api.js';
import type { YouTrackConfig } from '../../api/base/base-client.js';

describe('AgileAPIClient - Method Logic Tests', () => {
  let client: AgileAPIClient;
  let mockGet: any;
  let mockPost: any;

  beforeEach(() => {
    const config: YouTrackConfig = {
      baseURL: 'https://youtrack.test.com',
      token: 'test-token-123',
    };
    
    client = new AgileAPIClient(config);
    mockGet = jest.spyOn((client as any).axios, 'get');
    mockPost = jest.spyOn((client as any).axios, 'post');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('listAgileBoards', () => {
    test('should list all agile boards', async () => {
      const mockBoards = [
        { id: 'board-1', name: 'Sprint Board', projects: [] },
        { id: 'board-2', name: 'Kanban Board', projects: [] },
      ];

      mockGet.mockResolvedValue({
        data: mockBoards,
        status: 200,
      });

      const result = await client.listAgileBoards();

      expect(mockGet).toHaveBeenCalledWith(
        '/agiles',
        expect.any(Object)
      );

      expect(result.content[0].text).toContain('2');
      expect(JSON.parse(result.content[0].text).data).toMatchObject({
        count: 2,
        totalCount: null,
        returnedCount: 2,
        entityName: 'agile board',
      });
    });

    test('should handle empty board list', async () => {
      mockGet.mockResolvedValue({
        data: [],
        status: 200,
      });

      const result = await client.listAgileBoards();

      expect(result.content[0].text).toContain('0');
    });

    test('should include details when requested', async () => {
      mockGet.mockResolvedValue({
        data: [],
        status: 200,
      });

      await client.listAgileBoards({ includeDetails: true });

      const call = mockGet.mock.calls.find((call: any) => 
        call[1]?.params?.fields?.includes('sprints')
      );

      expect(call).toBeDefined();
    });

    test('should filter by project ID', async () => {
      const mockBoards = [
        { id: 'board-1', name: 'Board 1', projects: [{ id: 'proj-1' }] },
        { id: 'board-2', name: 'Board 2', projects: [{ id: 'proj-2' }] },
      ];

      mockGet.mockResolvedValue({
        data: mockBoards,
        status: 200,
      });

      const result = await client.listAgileBoards({ projectId: 'proj-1' });

      expect(result.content[0].text).toContain('1');
    });

    test('should handle API errors', async () => {
      mockGet.mockRejectedValue({
        message: 'Unauthorized',
        response: { status: 401 },
      });

      const result = await client.listAgileBoards();

      expect(result.content[0].text).toContain('error');
    });
  });

  describe('getBoardDetails', () => {
    test('should fetch board details', async () => {
      const mockBoard = {
        id: 'board-1',
        name: 'Sprint Board',
        estimationField: { id: 'field-story-points', name: 'Story points' },
        originalEstimationField: null,
        projects: [],
        sprints: [],
      };

      mockGet.mockResolvedValue({
        data: mockBoard,
        status: 200,
      });

      const result = await client.getBoardDetails({ boardId: 'board-1' });

      expect(mockGet).toHaveBeenCalledWith(
        '/agiles/board-1',
        expect.objectContaining({
          params: expect.objectContaining({
            fields: expect.stringContaining(
              'estimationField(id,name),originalEstimationField(id,name)'
            ),
          }),
        })
      );

      expect(result.content[0].text).toContain('Sprint Board');
      expect(JSON.parse(result.content[0].text).data.board).toMatchObject({
        estimationField: { id: 'field-story-points', name: 'Story points' },
        originalEstimationField: null,
      });
    });

    test('should include columns when requested', async () => {
      mockGet.mockResolvedValue({
        data: { id: 'board-1', name: 'Test', columnSettings: { columns: [] } },
        status: 200,
      });

      await client.getBoardDetails({ 
        boardId: 'board-1', 
        includeColumns: true 
      });

      const call = mockGet.mock.calls.find((call: any) => 
        call[1]?.params?.fields?.includes('columnSettings(id,field(id,name),columns(id,presentation,isResolved,ordinal,wipLimit(min,max),fieldValues(id,name)))')
      );

      expect(call).toBeDefined();
    });

    test('should include sprints when requested', async () => {
      mockGet.mockResolvedValue({
        data: { id: 'board-1', name: 'Test', sprints: [] },
        status: 200,
      });

      await client.getBoardDetails({ 
        boardId: 'board-1', 
        includeSprints: true 
      });

      const call = mockGet.mock.calls.find((call: any) => 
        call[1]?.params?.fields?.includes('sprints')
      );

      expect(call).toBeDefined();
      expect(call[1].params.fields).toContain(
        'sprintsSettings(id,isExplicit,cardOnSeveralSprints,disableSprints,defaultSprint(id,name),sprintSyncField($type,id,name))'
      );
    });

    test('should handle board not found', async () => {
      mockGet.mockRejectedValue({
        message: 'Board not found',
        response: { status: 404 },
      });

      const result = await client.getBoardDetails({ boardId: 'nonexistent' });

      expect(result.content[0].text).toContain('not found');
    });

    test('should compute metrics', async () => {
      const mockBoard = {
        id: 'board-1',
        name: 'Test Board',
        sprints: [
          { id: 's1', archived: false },
          { id: 's2', archived: true },
        ],
        columnSettings: {
          field: { id: 'field-state', name: 'State' },
          columns: [{ id: 'c1' }, { id: 'c2' }],
        },
        projects: [{ id: 'p1' }],
      };

      mockGet.mockResolvedValue({
        data: mockBoard,
        status: 200,
      });

      const result = await client.getBoardDetails({ 
        boardId: 'board-1',
        includeSprints: true,
        includeColumns: true
      });

      expect(result.content[0].text).toContain('Test Board');
      expect(JSON.parse(result.content[0].text).data.metrics).toMatchObject({
        returnedColumnCount: 2,
        columnCollectionCompleteness: 'unknown',
        returnedSprintCount: 2,
        sprintCollectionCompleteness: 'unknown',
      });
    });
  });

  describe('createSprint', () => {
    test('should create sprint with required fields', async () => {
      const mockSprint = {
        id: 'sprint-new',
        name: 'New Sprint',
      };

      mockPost.mockResolvedValue({
        data: mockSprint,
        status: 200,
      });

      const result = await client.createSprint({
        boardId: 'board-1',
        name: 'New Sprint',
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/agiles/board-1/sprints',
        expect.objectContaining({
          name: 'New Sprint',
        })
      );

      expect(result.content[0].text).toContain('created');
    });

    test('should include start date when provided', async () => {
      mockPost.mockResolvedValue({
        data: { id: 'sprint-1' },
        status: 200,
      });

      await client.createSprint({
        boardId: 'board-1',
        name: 'Sprint',
        start: '2025-10-01',
      });

      const call = mockPost.mock.calls.find((call: any) => 
        call[1]?.start !== undefined
      );

      expect(call).toBeDefined();
      expect(call[1].start).toBeGreaterThan(0);
    });

    test('should include finish date when provided', async () => {
      mockPost.mockResolvedValue({
        data: { id: 'sprint-1' },
        status: 200,
      });

      await client.createSprint({
        boardId: 'board-1',
        name: 'Sprint',
        finish: '2025-10-14',
      });

      const call = mockPost.mock.calls.find((call: any) => 
        call[1]?.finish !== undefined
      );

      expect(call).toBeDefined();
      expect(call[1].finish).toBeGreaterThan(0);
    });

    test('should include goal when provided', async () => {
      mockPost.mockResolvedValue({
        data: { id: 'sprint-1' },
        status: 200,
      });

      await client.createSprint({
        boardId: 'board-1',
        name: 'Sprint',
        goal: 'Complete user authentication',
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/agiles/board-1/sprints',
        expect.objectContaining({
          goal: 'Complete user authentication',
        })
      );
    });

    test('should handle creation errors', async () => {
      mockPost.mockRejectedValue({
        message: 'Invalid sprint data',
        response: { status: 400 },
      });

      const result = await client.createSprint({
        boardId: 'board-1',
        name: 'Sprint',
      });

      expect(result.content[0].text).toContain('error');
    });
  });

  describe('listSprints', () => {
    test('pages board sprints and reports collection completeness', async () => {
      mockGet.mockImplementation((_endpoint: string, config?: any) => Promise.resolve({
        data: (config?.params?.$skip ?? 0) === 0
          ? [
              { id: 'sprint-active', name: 'Active', archived: false },
              { id: 'sprint-old', name: 'Old', archived: true },
            ]
          : [],
        status: 200,
      }));

      const result = await client.listSprints({
        boardId: 'board-1',
        includeArchived: false,
        includeIssues: false,
      });

      expect(mockGet).toHaveBeenCalledWith('/agiles/board-1/sprints', {
        params: {
          fields: 'id,name,start,finish,archived,goal',
          $top: 100,
          $skip: 0,
        },
      });
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data).toMatchObject({
        returnedCount: 1,
        fetchedCount: 2,
        completeness: 'complete',
        truncated: false,
      });
      expect(response.data.items.map((sprint: any) => sprint.id)).toEqual(['sprint-active']);
    });
  });

  describe('sprint membership commands', () => {
    const mockBoardAndSprintReads = (
      sprintSyncField: unknown,
      sprintIssueIds: string[],
      options: {
        truncatedIssueIds?: string[];
        failedReadIssueIds?: string[];
        boardList?: Array<{ id: string; name: string }>;
        sprintList?: Array<{ id: string; name: string }>;
        repeatBoardPage?: boolean;
        repeatSprintPage?: boolean;
      } = {}
    ) => {
      mockGet.mockImplementation((endpoint: string, config?: any) => {
        if (endpoint === '/agiles/board-1') {
          return Promise.resolve({
            data: {
              id: 'board-1',
              name: 'Product Board',
              sprintsSettings: { sprintSyncField },
            },
            status: 200,
          });
        }

        if (endpoint === '/agiles/board-1/sprints/sprint-2') {
          return Promise.resolve({
            data: { id: 'sprint-2', name: 'Sprint Alpha' },
            status: 200,
          });
        }

        if (endpoint === '/agiles') {
          if ((config?.params?.$skip ?? 0) > 0 && !options.repeatBoardPage) {
            return Promise.resolve({ data: [], status: 200 });
          }
          return Promise.resolve({
            data: options.boardList ?? [{ id: 'board-1', name: 'Product Board' }],
            status: 200,
          });
        }

        if (endpoint === '/agiles/board-1/sprints') {
          if ((config?.params?.$skip ?? 0) > 0 && !options.repeatSprintPage) {
            return Promise.resolve({ data: [], status: 200 });
          }
          return Promise.resolve({
            data: options.sprintList ?? [
              { id: 'sprint-2', name: 'Sprint Alpha' },
            ],
            status: 200,
          });
        }

        const issueSprintMatch = endpoint.match(/^\/issues\/([^/]+)\/sprints$/);
        if (issueSprintMatch) {
          const issueId = decodeURIComponent(issueSprintMatch[1]);
          if (options.failedReadIssueIds?.includes(issueId)) {
            return Promise.reject(new Error('readback unavailable'));
          }
          const isMember = sprintIssueIds.includes(issueId);
          const isTruncated = options.truncatedIssueIds?.includes(issueId);
          if ((config?.params?.$skip ?? 0) > 0 && !isTruncated) {
            return Promise.resolve({ data: [], status: 200 });
          }
          return Promise.resolve({
            data: isMember
              ? [{ id: 'sprint-2', agile: { id: 'board-1' } }]
              : isTruncated
                ? Array.from({ length: 100 }, (_, index) => ({
                    id: `other-sprint-${index}`,
                    agile: { id: 'other-board' },
                  }))
              : [],
            status: 200,
          });
        }

        return Promise.reject(new Error(`Unexpected GET ${endpoint}`));
      });
    };

    test('assigns all readable issue IDs on a manual sprint board', async () => {
      mockBoardAndSprintReads(null, ['DEMO-1821', 'DEMO-2028', 'DEMO-2034']);
      mockPost.mockResolvedValue({ data: null, status: 200 });

      const result = await client.assignIssuesToSprint({
        boardId: 'board-1',
        sprintId: 'sprint-2',
        issueIds: ['DEMO-1821', 'DEMO-2028', 'DEMO-2034'],
      });

      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(mockPost).toHaveBeenCalledWith('/commands', {
        query: 'Board Product Board Sprint Alpha',
        issues: [
          { idReadable: 'DEMO-1821' },
          { idReadable: 'DEMO-2028' },
          { idReadable: 'DEMO-2034' },
        ],
      }, { retry: false });
      const membershipGetIndex = mockGet.mock.calls.findIndex((call: any) =>
        call[0] === '/issues/DEMO-1821/sprints'
      );
      expect(membershipGetIndex).toBeGreaterThanOrEqual(0);
      expect(mockGet.mock.invocationCallOrder[membershipGetIndex])
        .toBeGreaterThan(mockPost.mock.invocationCallOrder[0]);
      expect(mockGet.mock.calls[membershipGetIndex][1]).toEqual({
        params: { fields: 'id,agile(id)', $top: 100, $skip: 0 },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data.commandAccepted).toBe(true);
      expect(response.data.targetResolution).toMatchObject({
        mode: 'fresh_name_uniqueness_proof',
        board: { requestedId: 'board-1', matchedId: 'board-1', matchCount: 1 },
        sprint: { requestedId: 'sprint-2', matchedId: 'sprint-2', matchCount: 1 },
      });
      expect(response.data.targetResolution.limitation).toContain('names, not board or sprint IDs');
      expect(response.data.verification).toEqual({
        total: 3,
        verified: ['DEMO-1821', 'DEMO-2028', 'DEMO-2034'],
        verifiedCount: 3,
        verificationComplete: true,
        inconclusive: [],
        readErrors: [],
        missing: [],
      });
    });

    test('removes all readable issue IDs from an explicit sprint', async () => {
      mockBoardAndSprintReads(null, ['DEMO-1821']);
      mockPost.mockResolvedValue({ data: null, status: 200 });

      const result = await client.unassignIssuesFromSprint({
        boardId: 'board-1',
        sprintId: 'sprint-2',
        issueIds: ['DEMO-1956', 'DEMO-1957'],
      });

      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(mockPost).toHaveBeenCalledWith('/commands', {
        query: 'remove Board Product Board Sprint Alpha',
        issues: [
          { idReadable: 'DEMO-1956' },
          { idReadable: 'DEMO-1957' },
        ],
      }, { retry: false });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data.commandAccepted).toBe(true);
      expect(response.data.verification).toEqual({
        total: 2,
        verified: ['DEMO-1956', 'DEMO-1957'],
        verifiedCount: 2,
        verificationComplete: true,
        inconclusive: [],
        readErrors: [],
        remaining: [],
      });
    });

    test('uses the same command path for sprint-sync boards', async () => {
      mockBoardAndSprintReads({ id: 'field-sprint', name: 'Sprint' }, ['DEMO-1821']);
      mockPost.mockResolvedValue({ data: null, status: 200 });

      await client.assignIssuesToSprint({
        boardId: 'board-1',
        sprintId: 'sprint-2',
        issueIds: ['DEMO-1821'],
      });

      expect(mockPost).toHaveBeenCalledWith('/commands', {
        query: 'Board Product Board Sprint Alpha',
        issues: [{ idReadable: 'DEMO-1821' }],
      }, { retry: false });
    });

    test('preserves database issue IDs in the command and readback', async () => {
      mockBoardAndSprintReads(null, ['2-17']);
      mockPost.mockResolvedValue({ data: null, status: 200 });

      const result = await client.assignIssuesToSprint({
        boardId: 'board-1',
        sprintId: 'sprint-2',
        issueIds: ['2-17'],
      });

      expect(mockPost).toHaveBeenCalledWith('/commands', {
        query: 'Board Product Board Sprint Alpha',
        issues: [{ id: '2-17' }],
      }, { retry: false });
      expect(mockGet).toHaveBeenCalledWith('/issues/2-17/sprints', {
        params: { fields: 'id,agile(id)', $top: 100, $skip: 0 },
      });
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data.verification.verified).toEqual(['2-17']);
    });

    test('reports command acceptance separately from partial assignment readback', async () => {
      mockBoardAndSprintReads(null, ['DEMO-1821']);
      mockPost.mockResolvedValue({ data: null, status: 200 });

      const result = await client.assignIssuesToSprint({
        boardId: 'board-1',
        sprintId: 'sprint-2',
        issueIds: ['DEMO-1821', 'DEMO-2028'],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.context.commandAccepted).toBe(true);
      expect(response.context.verification).toEqual({
        total: 2,
        verified: ['DEMO-1821'],
        verifiedCount: 1,
        verificationComplete: true,
        inconclusive: [],
        readErrors: [],
        missing: ['DEMO-2028'],
      });
    });

    test('does not claim complete absence when issue sprint readback is truncated', async () => {
      mockBoardAndSprintReads(null, [], { truncatedIssueIds: ['DEMO-2028'] });
      mockPost.mockResolvedValue({ data: null, status: 200 });

      const result = await client.assignIssuesToSprint({
        boardId: 'board-1',
        sprintId: 'sprint-2',
        issueIds: ['DEMO-2028'],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.context.verification).toEqual({
        total: 1,
        verified: [],
        verifiedCount: 0,
        verificationComplete: false,
        inconclusive: ['DEMO-2028'],
        readErrors: [],
        missing: [],
      });
    });

    test('records a per-target read error without losing command acceptance', async () => {
      mockBoardAndSprintReads(null, [], { failedReadIssueIds: ['DEMO-2028'] });
      mockPost.mockResolvedValue({ data: null, status: 200 });

      const result = await client.assignIssuesToSprint({
        boardId: 'board-1',
        sprintId: 'sprint-2',
        issueIds: ['DEMO-2028'],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('readback verified only 0 of 1');
      expect(response.context.commandAccepted).toBe(true);
      expect(response.context.command).toBe('Board Product Board Sprint Alpha');
      expect(response.context.verification).toMatchObject({
        inconclusive: ['DEMO-2028'],
        readErrors: [{ issueId: 'DEMO-2028', error: 'readback unavailable' }],
      });
    });

    test('continues later readback batches after one target read fails', async () => {
      const issueIds = Array.from({ length: 12 }, (_, index) => `DEMO-${index + 1}`);
      mockBoardAndSprintReads(null, issueIds.slice(1), { failedReadIssueIds: ['DEMO-1'] });
      mockPost.mockResolvedValue({ data: null, status: 200 });

      const result = await client.assignIssuesToSprint({
        boardId: 'board-1',
        sprintId: 'sprint-2',
        issueIds,
      });

      expect(mockGet).toHaveBeenCalledWith('/issues/DEMO-12/sprints', expect.any(Object));
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.context.verification.verifiedCount).toBe(11);
      expect(response.context.verification.inconclusive).toEqual(['DEMO-1']);
      expect(response.context.verification.readErrors).toEqual([
        { issueId: 'DEMO-1', error: 'readback unavailable' },
      ]);
    });

    test('returns an indeterminate write outcome after a lost response even when final state converged', async () => {
      mockBoardAndSprintReads(null, ['DEMO-1821']);
      mockPost.mockRejectedValue(new Error('timeout'));

      const result = await client.assignIssuesToSprint({
        boardId: 'board-1',
        sprintId: 'sprint-2',
        issueIds: ['DEMO-1821'],
      });

      expect(mockPost).toHaveBeenCalledTimes(1);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('write outcome is indeterminate');
      expect(response.context).toMatchObject({
        outcome: 'indeterminate',
        writeAttempted: true,
        writeAccepted: null,
        verified: true,
        finalStateVerified: true,
        indeterminate: true,
      });
    });

    test('returns an indeterminate write outcome after a lost response when final state did not converge', async () => {
      mockBoardAndSprintReads(null, []);
      mockPost.mockRejectedValue(new Error('timeout'));

      const result = await client.assignIssuesToSprint({
        boardId: 'board-1',
        sprintId: 'sprint-2',
        issueIds: ['DEMO-1821'],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.context).toMatchObject({
        outcome: 'indeterminate',
        writeAttempted: true,
        writeAccepted: null,
        verified: false,
        finalStateVerified: false,
      });
      expect(response.context.verification.missing).toEqual(['DEMO-1821']);
    });

    test('reports a definite command rejection without post-write readback', async () => {
      mockBoardAndSprintReads(null, []);
      mockPost.mockRejectedValue(new Error('YouTrack API Error (409): command rejected'));

      const result = await client.assignIssuesToSprint({
        boardId: 'board-1',
        sprintId: 'sprint-2',
        issueIds: ['DEMO-1821'],
      });

      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(mockGet.mock.calls.some((call: any) => call[0] === '/issues/DEMO-1821/sprints'))
        .toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.context).toMatchObject({
        outcome: 'rejected',
        writeAttempted: true,
        writeAccepted: false,
        commandAccepted: false,
        finalStateVerified: false,
        indeterminate: false,
        httpStatus: 409,
      });
    });

    test('rejects duplicate normalized board names before POST', async () => {
      mockBoardAndSprintReads(null, [], {
        boardList: [
          { id: 'board-1', name: 'Product Board' },
          { id: 'board-2', name: ' product   BOARD ' },
        ],
      });

      const result = await client.assignIssuesToSprint({
        boardId: 'board-1',
        sprintId: 'sprint-2',
        issueIds: ['DEMO-1'],
      });

      expect(mockPost).not.toHaveBeenCalled();
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('ambiguous');
      expect(response.context.writeAttempted).toBe(false);
      expect(response.context.targetResolution.board.matchCount).toBe(2);
    });

    test('rejects duplicate normalized sprint names before POST', async () => {
      mockBoardAndSprintReads(null, [], {
        sprintList: [
          { id: 'sprint-2', name: 'Sprint Alpha' },
          { id: 'sprint-3', name: ' sprint alpha ' },
        ],
      });

      const result = await client.assignIssuesToSprint({
        boardId: 'board-1',
        sprintId: 'sprint-2',
        issueIds: ['DEMO-1'],
      });

      expect(mockPost).not.toHaveBeenCalled();
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('ambiguous inside board');
      expect(response.context.targetResolution.sprint.matchCount).toBe(2);
    });

    test('rejects a sprint name that uniquely resolves to a different ID', async () => {
      mockBoardAndSprintReads(null, [], {
        sprintList: [
          { id: 'sprint-other', name: 'Sprint Alpha' },
        ],
      });

      const result = await client.assignIssuesToSprint({
        boardId: 'board-1',
        sprintId: 'sprint-2',
        issueIds: ['DEMO-1'],
      });

      expect(mockPost).not.toHaveBeenCalled();
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('not requested sprint sprint-2');
      expect(response.context.targetResolution.sprint.matchedId).toBe('sprint-other');
    });

    test('rejects an incomplete name lookup before POST', async () => {
      mockBoardAndSprintReads(null, [], { repeatBoardPage: true });

      const result = await client.assignIssuesToSprint({
        boardId: 'board-1',
        sprintId: 'sprint-2',
        issueIds: ['DEMO-1'],
      });

      expect(mockPost).not.toHaveBeenCalled();
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('truncated or incomplete');
      expect(response.context.targetResolution.board).toMatchObject({
        completeness: 'unknown',
        truncated: true,
      });
    });

    test('rejects unbounded sprint membership batches before any API write', async () => {
      const issueIds = Array.from({ length: 101 }, (_, index) => `DEMO-${index + 1}`);

      const result = await client.assignIssuesToSprint({
        boardId: 'board-1',
        sprintId: 'sprint-2',
        issueIds,
      });

      expect(mockGet).not.toHaveBeenCalled();
      expect(mockPost).not.toHaveBeenCalled();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('at most 100 issues');
    });

    test('rejects malformed issue IDs before any API call', async () => {
      const result = await client.assignIssuesToSprint({
        boardId: 'board-1',
        sprintId: 'sprint-2',
        issueIds: ['not an issue'],
      });

      expect(mockGet).not.toHaveBeenCalled();
      expect(mockPost).not.toHaveBeenCalled();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.context.invalidIssueIds).toEqual(['not an issue']);
    });

    test('rejects duplicate issue IDs before any API call', async () => {
      const result = await client.assignIssuesToSprint({
        boardId: 'board-1',
        sprintId: 'sprint-2',
        issueIds: ['DEMO-1', 'DEMO-1'],
      });

      expect(mockGet).not.toHaveBeenCalled();
      expect(mockPost).not.toHaveBeenCalled();
      const response = JSON.parse(result.content[0].text);
      expect(response.context.duplicateIssueIds).toEqual(['DEMO-1']);
      expect(response.context.indeterminate).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors', async () => {
      mockGet.mockRejectedValue(new Error('Network failure'));

      const result = await client.listAgileBoards();

      expect(result.content[0].text).toContain('error');
    });

    test('should handle timeout errors', async () => {
      mockGet.mockRejectedValue({
        message: 'timeout',
        code: 'ECONNABORTED',
      });

      const result = await client.getBoardDetails({ boardId: 'board-1' });

      expect(result.content[0].text).toContain('error');
    });

    test('should handle permission errors', async () => {
      mockGet.mockRejectedValue({
        message: 'Forbidden',
        response: { status: 403 },
      });

      const result = await client.listAgileBoards();

      expect(result.content[0].text).toContain('error');
    });

    test('should handle malformed responses', async () => {
      mockGet.mockResolvedValue({
        data: null,
        status: 200,
      });

      const result = await client.listAgileBoards();

      expect(result).toHaveProperty('content');
    });
  });
});
