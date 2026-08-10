import { BaseAPIClient, MCPResponse, YouTrackConfig } from '../base/base-client.js';
import { ResponseFormatter } from '../base/response-formatter.js';

export interface AgileBoard {
  id: string;
  name: string;
  estimationField?: {
    id: string;
    name: string;
  } | null;
  originalEstimationField?: {
    id: string;
    name: string;
  } | null;
  projects?: Array<{
    id: string;
    name: string;
    shortName: string;
  }>;
  sprints?: Sprint[];
  /** @deprecated YouTrack exposes board columns through columnSettings. */
  columns?: BoardColumn[];
  columnSettings?: {
    id?: string;
    field?: {
      id: string;
      name: string;
    };
    columns?: BoardColumn[];
  };
  sprintsSettings?: {
    id?: string;
    isExplicit?: boolean;
    cardOnSeveralSprints?: boolean;
    disableSprints?: boolean;
    defaultSprint?: {
      id: string;
      name: string;
    } | null;
    sprintSyncField?: {
      $type?: string;
      id: string;
      name: string;
    } | null;
  };
  currentSprint?: Sprint;
}

export interface Sprint {
  id: string;
  name: string;
  agile?: {
    id: string;
    name?: string;
  };
  start?: number; // timestamp
  finish?: number; // timestamp
  archived?: boolean;
  goal?: string;
  issues?: Array<{
    id: string;
    idReadable?: string;
    summary: string;
    state?: string;
    priority?: string;
  }>;
}

export interface BoardColumn {
  id: string;
  presentation?: string;
  isResolved?: boolean;
  ordinal?: number;
  wipLimit?: {
    min?: number | null;
    max?: number | null;
  } | null;
  fieldValues?: Array<{
    id: string;
    name: string;
  }>;
}

export interface SprintParams {
  boardId: string;
  name: string;
  start?: string; // ISO date string
  finish?: string; // ISO date string
  goal?: string;
}

type CollectionCompleteness = 'complete' | 'unknown';

interface PagedCollection<T> {
  items: T[];
  returnedCount: number;
  completeness: CollectionCompleteness;
  truncated: boolean;
}

interface CommandTargetResolution {
  mode: 'fresh_name_uniqueness_proof';
  source: 'noncached_id_lookup_and_paged_list';
  limitation: string;
  board: {
    requestedId: string;
    name: string;
    matchedId?: string;
    matchCount: number;
    returnedCount: number;
    completeness: CollectionCompleteness;
    truncated: boolean;
  };
  sprint: {
    requestedId: string;
    name: string;
    matchedId?: string;
    matchCount: number;
    returnedCount: number;
    completeness: CollectionCompleteness;
    truncated: boolean;
  };
}

interface MembershipVerification {
  total: number;
  verified: string[];
  verifiedCount: number;
  verificationComplete: boolean;
  inconclusive: string[];
  readErrors: Array<{ issueId: string; error: string }>;
  missing?: string[];
  remaining?: string[];
}

/**
 * Agile API Client - Handles agile board and sprint operations
 * Provides comprehensive sprint management and board functionality
 */
export class AgileAPIClient extends BaseAPIClient {
  
  constructor(config: YouTrackConfig) {
    super(config);
  }

  /**
   * List all agile boards with optional project filtering
   */
  async listAgileBoards(params: { 
    projectId?: string; 
    includeDetails?: boolean 
  } = {}): Promise<MCPResponse> {
    try {
      const endpoint = '/agiles';
      const queryParams: any = {
        fields: params.includeDetails 
          ? 'id,name,favorite,orphansAtTheTop,hideOrphansSwimlane,projects(id,name,shortName),sprints(id,name,archived,start,finish)'
          : 'id,name,favorite,projects(id,name,shortName)'
      };

      const page = await this.readAllPages<AgileBoard>(endpoint, queryParams.fields);
      let boards = page.items;

      // Filter by project if specified
      if (params.projectId) {
        boards = boards.filter((board: any) => 
          board.projects?.some((p: any) => p.id === params.projectId)
        );
      }

      return ResponseFormatter.formatSuccess({
        items: boards,
        count: boards.length,
        totalCount: page.completeness === 'complete' ? boards.length : null,
        entityName: 'agile board',
        returnedCount: boards.length,
        fetchedCount: page.returnedCount,
        completeness: page.completeness,
        truncated: page.truncated,
        filters: params.projectId ? { projectId: params.projectId } : undefined,
        nestedCollections: {
          sprints: {
            included: params.includeDetails === true,
            completeness: params.includeDetails ? 'unknown' : 'not_requested'
          },
          projects: {
            included: true,
            completeness: 'unknown'
          }
        }
      }, page.completeness === 'complete'
        ? `Retrieved ${boards.length} agile board${boards.length === 1 ? '' : 's'}`
        : `Returned ${boards.length} agile board${boards.length === 1 ? '' : 's'}; the full collection could not be proven complete`);

    } catch (error: any) {
      return ResponseFormatter.formatError(
        `Failed to list agile boards: ${error.message}`,
        { method: 'listAgileBoards', params }
      );
    }
  }

  /**
   * Get detailed information about a specific agile board
   */
  async getBoardDetails(params: {
    boardId: string;
    includeColumns?: boolean;
    includeSprints?: boolean;
  }): Promise<MCPResponse> {
    try {
      let fieldsParam = 'id,name,favorite,estimationField(id,name),originalEstimationField(id,name),projects(id,name,shortName)';
      
      if (params.includeColumns) {
        // YouTrack exposes board columns through columnSettings. Reading the
        // complete ordered list (including stable column IDs) is a prerequisite
        // for any future safe write that must preserve untouched columns.
        fieldsParam += ',columnSettings(id,field(id,name),columns(id,presentation,isResolved,ordinal,wipLimit(min,max),fieldValues(id,name)))';
      }
      
      if (params.includeSprints) {
        fieldsParam += ',sprints(id,name,start,finish,archived,goal),sprintsSettings(id,isExplicit,cardOnSeveralSprints,disableSprints,defaultSprint(id,name),sprintSyncField($type,id,name))';
      }

      const board = await this.get<AgileBoard>(
        `/agiles/${params.boardId}`,
        { fields: fieldsParam }
      );

      // Enhance response with computed metrics
      const metrics = {
        returnedSprintCount: board.data.sprints?.length || 0,
        returnedActiveSprintCount: board.data.sprints?.filter((s: any) => !s.archived).length || 0,
        sprintCollectionCompleteness: params.includeSprints ? 'unknown' : 'not_requested',
        returnedColumnCount: board.data.columnSettings?.columns?.length || board.data.columns?.length || 0,
        columnCollectionCompleteness: params.includeColumns ? 'unknown' : 'not_requested',
        returnedProjectCount: board.data.projects?.length || 0,
        projectCollectionCompleteness: 'unknown',
        // Backward-compatible aliases. They count only the nested subset that
        // YouTrack returned; the completeness fields above are authoritative.
        totalSprints: board.data.sprints?.length || 0,
        activeSprints: board.data.sprints?.filter((s: any) => !s.archived).length || 0,
        totalColumns: board.data.columnSettings?.columns?.length || board.data.columns?.length || 0,
        projectCount: board.data.projects?.length || 0,
        legacyCountSemantics: 'returned_subset_only'
      };

      return ResponseFormatter.formatSuccess({
        board: board.data,
        metrics
      }, `Retrieved details for agile board: ${board.data.name}`);

    } catch (error: any) {
      return ResponseFormatter.formatError(
        `Failed to get board details: ${error.message}`,
        { method: 'getBoardDetails', params }
      );
    }
  }

  /**
   * List sprints for a board without relying on a capped nested collection.
   */
  async listSprints(params: {
    boardId: string;
    includeArchived?: boolean;
    includeIssues?: boolean;
  }): Promise<MCPResponse> {
    try {
      const fields = params.includeIssues
        ? 'id,name,start,finish,archived,goal,issues(id,idReadable,summary)'
        : 'id,name,start,finish,archived,goal';
      const page = await this.readAllPages<Sprint>(
        `/agiles/${params.boardId}/sprints`,
        fields
      );
      const sprints = params.includeArchived
        ? page.items
        : page.items.filter(sprint => !sprint.archived);

      return ResponseFormatter.formatSuccess({
        items: sprints,
        returnedCount: sprints.length,
        fetchedCount: page.items.length,
        completeness: page.completeness,
        truncated: page.truncated,
        filters: {
          boardId: params.boardId,
          includeArchived: params.includeArchived === true
        },
        nestedCollections: {
          issues: {
            included: params.includeIssues === true,
            completeness: params.includeIssues ? 'unknown' : 'not_requested'
          }
        }
      }, page.completeness === 'complete'
        ? `Retrieved ${sprints.length} sprint${sprints.length === 1 ? '' : 's'} for board ${params.boardId}`
        : `Returned ${sprints.length} sprint${sprints.length === 1 ? '' : 's'} for board ${params.boardId}; the full collection could not be proven complete`);
    } catch (error: any) {
      return ResponseFormatter.formatError(
        `Failed to list sprints: ${error.message}`,
        { method: 'listSprints', params }
      );
    }
  }

  /**
   * Create a new sprint in an agile board
   */
  async createSprint(params: SprintParams): Promise<MCPResponse> {
    try {
      const sprintData: any = {
        name: params.name
      };

      if (params.start) {
        sprintData.start = new Date(params.start).getTime();
      }
      
      if (params.finish) {
        sprintData.finish = new Date(params.finish).getTime();
      }
      
      if (params.goal) {
        sprintData.goal = params.goal;
      }

      const response = await this.post(
        `/agiles/${params.boardId}/sprints`,
        sprintData
      );

      return ResponseFormatter.formatCreated(
        response.data,
        'Sprint',
        `Sprint "${params.name}" created successfully in board ${params.boardId}`
      );

    } catch (error: any) {
      return ResponseFormatter.formatError(
        `Failed to create sprint: ${error.message}`,
        { method: 'createSprint', params }
      );
    }
  }

  /**
   * Get detailed information about a specific sprint
   */
  async getSprintDetails(params: {
    boardId: string;
    sprintId: string;
  }): Promise<MCPResponse> {
    try {
      const sprint = await this.get<Sprint>(
        `/agiles/${params.boardId}/sprints/${params.sprintId}`,
        { fields: 'id,name,start,finish,archived,goal,issues(id,idReadable,summary,customFields(name,value))' }
      );

      return ResponseFormatter.formatSuccess(
        sprint.data,
        `Retrieved sprint details: ${sprint.data.name}`
      );

    } catch (error: any) {
      return ResponseFormatter.formatError(
        `Failed to get sprint details: ${error.message}`,
        { method: 'getSprintDetails', params }
      );
    }
  }

  /**
   * Update sprint details
   */
  async updateSprint(params: {
    boardId: string;
    sprintId: string;
    name?: string;
    start?: string;
    finish?: string;
    goal?: string;
  }): Promise<MCPResponse> {
    try {
      const sprintData: any = {};

      if (params.name) sprintData.name = params.name;
      if (params.goal !== undefined) sprintData.goal = params.goal;
      
      if (params.start) {
        sprintData.start = new Date(params.start).getTime();
      }
      
      if (params.finish) {
        sprintData.finish = new Date(params.finish).getTime();
      }

      const response = await this.post(
        `/agiles/${params.boardId}/sprints/${params.sprintId}`,
        sprintData
      );

      return ResponseFormatter.formatUpdated(
        response.data,
        'Sprint',
        { ...sprintData },
        `Sprint updated successfully`
      );

    } catch (error: any) {
      return ResponseFormatter.formatError(
        `Failed to update sprint: ${error.message}`,
        { method: 'updateSprint', params }
      );
    }
  }

  /**
   * Archive a sprint
   */
  async archiveSprint(params: {
    boardId: string;
    sprintId: string;
  }): Promise<MCPResponse> {
    try {
      const response = await this.post(
        `/agiles/${params.boardId}/sprints/${params.sprintId}`,
        { archived: true }
      );

      return ResponseFormatter.formatSuccess(
        response.data,
        `Sprint archived successfully`
      );

    } catch (error: any) {
      return ResponseFormatter.formatError(
        `Failed to archive sprint: ${error.message}`,
        { method: 'archiveSprint', params }
      );
    }
  }

  /**
   * Delete a sprint
   */
  async deleteSprint(params: {
    boardId: string;
    sprintId: string;
  }): Promise<MCPResponse> {
    try {
      await this.delete(`/agiles/${params.boardId}/sprints/${params.sprintId}`);

      return ResponseFormatter.formatDeleted(
        params.sprintId,
        'Sprint'
      );

    } catch (error: any) {
      return ResponseFormatter.formatError(
        `Failed to delete sprint: ${error.message}`,
        { method: 'deleteSprint', params }
      );
    }
  }

  /**
   * Get all issues in a sprint
   */
  async getSprintIssues(params: {
    boardId: string;
    sprintId: string;
  }): Promise<MCPResponse> {
    try {
      const sprint = await this.get<Sprint>(
        `/agiles/${params.boardId}/sprints/${params.sprintId}`,
        { 
          fields: 'id,name,issues($type,id,idReadable,summary,customFields($type,name,value($type,name,presentation)),created,updated)'
        }
      );

      const issues = sprint.data.issues || [];

      return ResponseFormatter.formatSuccess({
        issues,
        count: issues.length,
        returnedCount: issues.length,
        completeness: 'unknown',
        truncated: 'unknown',
        sprint: {
          id: params.sprintId,
          name: sprint.data.name
        }
      }, `Returned ${issues.length} issue${issues.length !== 1 ? 's' : ''} from sprint "${sprint.data.name}"; nested collection completeness is unknown`);

    } catch (error: any) {
      return ResponseFormatter.formatError(
        `Failed to get sprint issues: ${error.message}`,
        { method: 'getSprintIssues', params }
      );
    }
  }

  /**
   * Assign issues to a sprint using YouTrack's Board command.
   *
   * Commands work for both explicit/manual sprint boards (where
   * sprintSyncField is null) and boards backed by a sprint sync field.
   */
  async assignIssuesToSprint(params: {
    boardId: string;
    sprintId: string;
    issueIds: string[];
  }): Promise<MCPResponse> {
    return this.applySprintMembershipCommand(params, 'assign');
  }

  /**
   * Remove issues from a sprint using YouTrack's remove Board command.
   */
  async unassignIssuesFromSprint(params: {
    boardId: string;
    sprintId: string;
    issueIds: string[];
  }): Promise<MCPResponse> {
    return this.applySprintMembershipCommand(params, 'unassign');
  }

  private async applySprintMembershipCommand(
    params: {
      boardId: string;
      sprintId: string;
      issueIds: string[];
    },
    operation: 'assign' | 'unassign'
  ): Promise<MCPResponse> {
    const method = operation === 'assign'
      ? 'assignIssuesToSprint'
      : 'unassignIssuesFromSprint';
    let writeAttempted = false;
    let writeAccepted: boolean | null = false;
    let appliedCommand: string | undefined;
    let board: AgileBoard | undefined;
    let sprint: Sprint | undefined;
    let targetResolution: CommandTargetResolution | undefined;

    try {
      if (!params.boardId?.trim() || !params.sprintId?.trim()) {
        return ResponseFormatter.formatError(
          'Non-empty boardId and sprintId are required',
          {
            method,
            boardId: params.boardId,
            sprintId: params.sprintId,
            writeAttempted: false,
            writeAccepted: false,
            indeterminate: false
          }
        );
      }
      if (params.issueIds.length === 0) {
        return ResponseFormatter.formatError(
          'At least one issue ID is required',
          { method, params, writeAttempted: false, writeAccepted: false, indeterminate: false }
        );
      }
      if (params.issueIds.length > 100) {
        return ResponseFormatter.formatError(
          'A sprint membership command supports at most 100 issues per call',
          {
            method,
            issueCount: params.issueIds.length,
            maxIssueCount: 100,
            writeAttempted: false,
            writeAccepted: false,
            indeterminate: false
          }
        );
      }
      const issueIdPattern = /^(?:[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+|\d+-\d+)$/i;
      const invalidIssueIds = params.issueIds.filter(issueId => !issueIdPattern.test(issueId));
      if (invalidIssueIds.length > 0) {
        return ResponseFormatter.formatError(
          'Every issue ID must be a readable ID (for example, DEMO-1821) or a database ID (for example, 2-17)',
          {
            method,
            invalidIssueIds,
            writeAttempted: false,
            writeAccepted: false,
            indeterminate: false
          }
        );
      }
      const duplicateIssueIds = params.issueIds.filter(
        (issueId, index) => params.issueIds.indexOf(issueId) !== index
      );
      if (duplicateIssueIds.length > 0) {
        return ResponseFormatter.formatError(
          'Duplicate issue IDs are not allowed in a sprint membership command',
          {
            method,
            duplicateIssueIds: [...new Set(duplicateIssueIds)],
            writeAttempted: false,
            writeAccepted: false,
            indeterminate: false
          }
        );
      }

      const [boardResponse, sprintResponse] = await Promise.all([
        this.axios.get<AgileBoard>(
          `/agiles/${params.boardId}`,
          { params: { fields: 'id,name,sprintsSettings(sprintSyncField($type,id,name))' } }
        ),
        this.axios.get<Sprint>(
          `/agiles/${params.boardId}/sprints/${params.sprintId}`,
          { params: { fields: 'id,name' } }
        )
      ]);
      board = boardResponse.data;
      sprint = sprintResponse.data;

      if (!board?.name || !sprint?.name) {
        return ResponseFormatter.formatError(
          'Board and sprint names are required to apply a sprint command',
          {
            method,
            boardId: params.boardId,
            sprintId: params.sprintId,
            writeAttempted: false,
            writeAccepted: false,
            indeterminate: false
          }
        );
      }
      if (board.id !== params.boardId || sprint.id !== params.sprintId) {
        return ResponseFormatter.formatError(
          'Fresh target lookup returned IDs that do not match the requested board and sprint',
          {
            method,
            requested: { boardId: params.boardId, sprintId: params.sprintId },
            resolved: { boardId: board.id, sprintId: sprint.id },
            writeAttempted: false,
            writeAccepted: false,
            indeterminate: false
          }
        );
      }

      const resolution = await this.resolveCommandTargets(board, sprint);
      targetResolution = resolution.targetResolution;
      if (!resolution.ok) {
        return ResponseFormatter.formatError(
          resolution.error,
          {
            method,
            params,
            targetResolution,
            writeAttempted: false,
            writeAccepted: false,
            indeterminate: false
          }
        );
      }

      const command = operation === 'assign'
        ? `Board ${board.name} ${sprint.name}`
        : `remove Board ${board.name} ${sprint.name}`;
      appliedCommand = command;

      writeAttempted = true;
      const response = await this.post('/commands', {
        query: command,
        issues: params.issueIds.map(issueId =>
          /^\d+-\d+$/.test(issueId)
            ? { id: issueId }
            : { idReadable: issueId }
        )
      }, { retry: false });
      writeAccepted = true;

      const verification = await this.verifySprintMembership(params, operation);
      const failed = operation === 'assign'
        ? verification.missing ?? []
        : verification.remaining ?? [];

      const result = {
        outcome: failed.length === 0 && verification.inconclusive.length === 0
          ? 'verified'
          : 'accepted_but_not_verified',
        writeAttempted,
        writeAccepted,
        verified: failed.length === 0 && verification.inconclusive.length === 0,
        finalStateVerified: failed.length === 0 && verification.inconclusive.length === 0,
        indeterminate: verification.inconclusive.length > 0,
        commandAccepted: true,
        command,
        targetResolution,
        board: { id: params.boardId, name: board.name },
        sprint: { id: params.sprintId, name: sprint.name },
        commandResponse: response.data ?? null,
        verification
      };

      if (failed.length > 0 || verification.inconclusive.length > 0) {
        return ResponseFormatter.formatError(
          `Sprint command was accepted, but readback verified only ${verification.verifiedCount} of ${params.issueIds.length} issues`,
          result
        );
      }

      return ResponseFormatter.formatSuccess(
        result,
        `${operation === 'assign' ? 'Assigned' : 'Unassigned'} and verified ${verification.verifiedCount} issue${verification.verifiedCount === 1 ? '' : 's'} ${operation === 'assign' ? 'in' : 'outside'} sprint`
      );
    } catch (error: any) {
      if (writeAttempted) {
        const rejectionStatus = writeAccepted !== true
          ? this.definiteWriteRejectionStatus(error)
          : null;
        if (rejectionStatus !== null) {
          return ResponseFormatter.formatError(
            `Sprint command was rejected by YouTrack (${rejectionStatus}): ${error.message}`,
            {
              method,
              params,
              outcome: 'rejected',
              writeAttempted: true,
              writeAccepted: false,
              verified: false,
              finalStateVerified: false,
              indeterminate: false,
              commandAccepted: false,
              httpStatus: rejectionStatus,
              command: appliedCommand,
              targetResolution,
              board: board ? { id: board.id, name: board.name } : undefined,
              sprint: sprint ? { id: sprint.id, name: sprint.name } : undefined
            }
          );
        }

        let verification: MembershipVerification;
        try {
          verification = await this.verifySprintMembership(params, operation);
        } catch (verificationError: any) {
          verification = this.inconclusiveVerification(
            params.issueIds,
            operation,
            `Verification setup failed: ${verificationError.message}`
          );
        }

        const accepted = writeAccepted === true;
        const failed = operation === 'assign'
          ? verification.missing ?? []
          : verification.remaining ?? [];
        const finalStateVerified = failed.length === 0 && verification.inconclusive.length === 0;
        return ResponseFormatter.formatError(
          accepted
            ? `Sprint command was accepted, but post-write verification failed: ${error.message}`
            : `Sprint command write outcome is indeterminate after the request failed: ${error.message}`,
          {
            method,
            params,
            outcome: accepted ? 'accepted_but_not_verified' : 'indeterminate',
            writeAttempted: true,
            writeAccepted: accepted ? true : null,
            verified: finalStateVerified,
            finalStateVerified,
            indeterminate: !accepted || verification.inconclusive.length > 0,
            commandAccepted: accepted ? true : null,
            command: appliedCommand,
            targetResolution,
            board: board ? { id: board.id, name: board.name } : undefined,
            sprint: sprint ? { id: sprint.id, name: sprint.name } : undefined,
            verification
          }
        );
      }

      return ResponseFormatter.formatError(
        `Failed to ${operation} issues ${operation === 'assign' ? 'to' : 'from'} sprint: ${error.message}`,
        {
          method,
          params,
          writeAttempted: false,
          writeAccepted: false,
          indeterminate: false
        }
      );
    }
  }

  private async resolveCommandTargets(
    board: AgileBoard,
    sprint: Sprint
  ): Promise<{
    ok: true;
    targetResolution: CommandTargetResolution;
  } | {
    ok: false;
    error: string;
    targetResolution: CommandTargetResolution;
  }> {
    const [boards, sprints] = await Promise.all([
      this.readAllPages<AgileBoard>('/agiles', 'id,name'),
      this.readAllPages<Sprint>(`/agiles/${board.id}/sprints`, 'id,name')
    ]);
    const normalizedBoardName = this.normalizeCommandTargetName(board.name);
    const normalizedSprintName = this.normalizeCommandTargetName(sprint.name);
    const boardMatches = boards.items.filter(candidate =>
      this.normalizeCommandTargetName(candidate.name) === normalizedBoardName
    );
    const sprintMatches = sprints.items.filter(candidate =>
      this.normalizeCommandTargetName(candidate.name) === normalizedSprintName
    );
    const targetResolution: CommandTargetResolution = {
      mode: 'fresh_name_uniqueness_proof',
      source: 'noncached_id_lookup_and_paged_list',
      limitation: 'YouTrack Board commands carry names, not board or sprint IDs, so the mutation is not ID-bound. This conservative, case-and-whitespace-normalized preflight proves one caller-visible name-to-ID mapping immediately before the request; hidden targets, parser differences, or a concurrent rename after preflight cannot be excluded.',
      board: {
        requestedId: board.id,
        name: board.name,
        matchedId: boardMatches.length === 1 ? boardMatches[0].id : undefined,
        matchCount: boardMatches.length,
        returnedCount: boards.returnedCount,
        completeness: boards.completeness,
        truncated: boards.truncated
      },
      sprint: {
        requestedId: sprint.id,
        name: sprint.name,
        matchedId: sprintMatches.length === 1 ? sprintMatches[0].id : undefined,
        matchCount: sprintMatches.length,
        returnedCount: sprints.returnedCount,
        completeness: sprints.completeness,
        truncated: sprints.truncated
      }
    };

    if (boards.completeness !== 'complete' || sprints.completeness !== 'complete') {
      return {
        ok: false,
        error: 'Cannot safely apply a name-based sprint command because target-name lookup was truncated or incomplete',
        targetResolution
      };
    }
    if (boardMatches.length !== 1) {
      return {
        ok: false,
        error: boardMatches.length > 1
          ? `Board name "${board.name}" is ambiguous`
          : `Board name "${board.name}" no longer resolves to the requested board`,
        targetResolution
      };
    }
    if (boardMatches[0].id !== board.id) {
      return {
        ok: false,
        error: `Board name "${board.name}" resolves to ${boardMatches[0].id}, not requested board ${board.id}`,
        targetResolution
      };
    }
    if (sprintMatches.length !== 1) {
      return {
        ok: false,
        error: sprintMatches.length > 1
          ? `Sprint name "${sprint.name}" is ambiguous inside board ${board.id}`
          : `Sprint name "${sprint.name}" no longer resolves inside board ${board.id}`,
        targetResolution
      };
    }
    if (sprintMatches[0].id !== sprint.id) {
      return {
        ok: false,
        error: `Sprint name "${sprint.name}" resolves to ${sprintMatches[0].id}, not requested sprint ${sprint.id}`,
        targetResolution
      };
    }

    return { ok: true, targetResolution };
  }

  private normalizeCommandTargetName(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
  }

  private definiteWriteRejectionStatus(error: any): number | null {
    const responseStatus = error?.response?.status;
    if (Number.isInteger(responseStatus) && responseStatus >= 400 && responseStatus < 500) {
      return responseStatus;
    }

    const messageMatch = String(error?.message ?? error).match(/YouTrack API Error \((4\d{2})\)/);
    return messageMatch ? Number(messageMatch[1]) : null;
  }

  private async verifySprintMembership(
    params: { boardId: string; sprintId: string; issueIds: string[] },
    operation: 'assign' | 'unassign'
  ): Promise<MembershipVerification> {
    const verificationConcurrency = 10;
    const reads: Array<{
      issueId: string;
      isMember: boolean | null;
      complete: boolean;
      readError?: string;
    }> = [];

    for (let offset = 0; offset < params.issueIds.length; offset += verificationConcurrency) {
      const batch = params.issueIds.slice(offset, offset + verificationConcurrency);
      const settled = await Promise.allSettled(batch.map(async issueId => {
        const page = await this.readAllPages<Sprint>(
          `/issues/${encodeURIComponent(issueId)}/sprints`,
          'id,agile(id)'
        );
        const isMember = page.items.some(candidate =>
          candidate.id === params.sprintId &&
          (!candidate.agile || candidate.agile.id === params.boardId)
        );

        return {
          issueId,
          isMember,
          complete: page.completeness === 'complete'
        };
      }));

      settled.forEach((result, index) => {
        const issueId = batch[index];
        if (result.status === 'fulfilled') {
          reads.push(result.value);
        } else {
          reads.push({
            issueId,
            isMember: null,
            complete: false,
            readError: result.reason instanceof Error
              ? result.reason.message
              : String(result.reason)
          });
        }
      });
    }

    const inconclusive = reads
      .filter(read => read.isMember === null || (!read.complete && read.isMember === false))
      .map(read => read.issueId);
    const verified = reads
      .filter(read => !inconclusive.includes(read.issueId))
      .filter(read => operation === 'assign' ? read.isMember === true : read.isMember === false)
      .map(read => read.issueId);
    const failed = reads
      .filter(read => !inconclusive.includes(read.issueId))
      .filter(read => operation === 'assign' ? read.isMember === false : read.isMember === true)
      .map(read => read.issueId);
    const readErrors = reads
      .filter((read): read is typeof read & { readError: string } => read.readError !== undefined)
      .map(read => ({ issueId: read.issueId, error: read.readError }));

    return {
      total: params.issueIds.length,
      verified,
      verifiedCount: verified.length,
      verificationComplete: inconclusive.length === 0,
      inconclusive,
      readErrors,
      ...(operation === 'assign' ? { missing: failed } : { remaining: failed })
    };
  }

  private inconclusiveVerification(
    issueIds: string[],
    operation: 'assign' | 'unassign',
    error: string
  ): MembershipVerification {
    return {
      total: issueIds.length,
      verified: [],
      verifiedCount: 0,
      verificationComplete: false,
      inconclusive: [...issueIds],
      readErrors: issueIds.map(issueId => ({ issueId, error })),
      ...(operation === 'assign' ? { missing: [] } : { remaining: [] })
    };
  }

  private async readAllPages<T extends { id?: string }>(
    endpoint: string,
    fields: string
  ): Promise<PagedCollection<T>> {
    const pageSize = 100;
    const maxItems = 10000;
    const items: T[] = [];
    const seenIds = new Set<string>();
    let skip = 0;

    while (items.length < maxItems) {
      const response = await this.axios.get<T[]>(endpoint, {
        params: { fields, $top: pageSize, $skip: skip }
      });
      if (!Array.isArray(response.data)) {
        throw new Error(`Expected a collection response from ${endpoint}`);
      }
      if (response.data.length === 0) {
        return {
          items,
          returnedCount: items.length,
          completeness: 'complete',
          truncated: false
        };
      }

      for (const item of response.data) {
        const key = item.id;
        if (!key || seenIds.has(key)) {
          return {
            items,
            returnedCount: items.length,
            completeness: 'unknown',
            truncated: true
          };
        }
        items.push(item);
        seenIds.add(key);
      }
      skip += response.data.length;
    }

    return {
      items,
      returnedCount: items.length,
      completeness: 'unknown',
      truncated: true
    };
  }
}
