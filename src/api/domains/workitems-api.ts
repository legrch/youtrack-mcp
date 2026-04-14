import { BaseAPIClient, MCPResponse } from '../base/base-client.js';
import { ResponseFormatter } from '../base/response-formatter.js';

export interface WorkItem {
  id: string;
  issue?: {
    id: string;
    summary: string;
    project?: {
      id: string;
      name: string;
      shortName: string;
    };
  };
  author?: {
    id: string;
    login: string;
    fullName?: string;
  };
  date: number; // timestamp
  duration: number; // minutes
  description?: string;
  type?: {
    id: string;
    name: string;
  };
  created: number; // timestamp
  updated: number; // timestamp
}

export interface TimeEntry {
  id: string;
  duration: number; // minutes
  date: number; // timestamp
  description?: string;
  type?: {
    id: string;
    name: string;
  };
  author?: {
    id: string;
    login: string;
    fullName?: string;
  };
  issue?: {
    id: string;
    summary: string;
  };
}

export interface WorkItemCreateParams {
  issueId: string;
  duration: string; // "2h", "1d", "30m"
  description?: string;
  date?: string; // YYYY-MM-DD
  workType?: string;
}

export interface WorkItemUpdateParams {
  duration?: string;
  description?: string;
  date?: string;
  workType?: string;
}

/**
 * WorkItems API Client - Handles time tracking and work item operations
 * Simplified implementation focused on core functionality
 */
export class WorkItemsAPIClient extends BaseAPIClient {

  /**
   * Log time to an issue
   * NOTE: YouTrack API requires creating work items directly, not as issue subresources
   */
  async logTimeToIssue(issueId: string, duration: string, description?: string, date?: string, workType?: string): Promise<MCPResponse> {
    try {
      // Use per-issue endpoint (accepts readable IDs like SC-1687)
      const fields = 'id,date,duration(minutes,presentation),text,type(id,name),author(id,login,fullName)';
      const endpoint = `/issues/${issueId}/timeTracking/workItems?fields=${fields}`;

      const workData: any = {
        duration: { minutes: this.parseDurationToMinutes(duration) },
        text: description || '',
        date: date ? new Date(date).getTime() : Date.now()
      };

      if (workType) {
        // Resolve work type name to ID via API
        const typeId = await this.resolveWorkTypeId(workType);
        if (typeId) {
          workData.type = { id: typeId };
        }
      }

      const response = await this.post(endpoint, workData);
      
      // Extract work item ID from response
      const workItemId = response.data?.id || 'created';
      const message = `Logged ${duration} to issue ${issueId}${workItemId !== 'created' ? ` (Work Item: ${workItemId})` : ''}`;
      
      return ResponseFormatter.formatCreated(response.data, 'Time Entry', message);
      
    } catch (error: any) {
      throw new Error(`Failed to log time: ${error.message}`);
    }
  }

  /**
   * Get time entries for an issue or project
   */
  async getTimeEntries(issueId?: string, startDate?: string, endDate?: string, userId?: string): Promise<MCPResponse> {
    try {
      const fields = 'id,duration(minutes,presentation),date,text,type(id,name),author(id,login,fullName)';

      // Use per-issue endpoint when issueId is provided (accepts readable IDs)
      if (issueId) {
        const endpoint = `/issues/${issueId}/timeTracking/workItems?fields=${fields}`;
        const response = await this.get<TimeEntry[]>(endpoint);
        const timeEntries = response.data || [];
        return ResponseFormatter.formatList(timeEntries, 'time entry', {
          totalCount: timeEntries.length
        });
      }

      // Global endpoint for cross-issue queries
      const endpoint = `/workItems`;
      const params: any = {
        fields: fields + ',issue(id,summary)',
        $top: 100
      };

      const queryParts: string[] = [];
      if (userId) queryParts.push(`author: ${userId}`);
      if (queryParts.length > 0) {
        params.query = queryParts.join(' ');
      }

      if (startDate) params.startDate = new Date(startDate).getTime();
      if (endDate) params.endDate = new Date(endDate).getTime();

      const response = await this.get<TimeEntry[]>(endpoint, params);
      const timeEntries = response.data || [];

      return ResponseFormatter.formatList(timeEntries, 'time entry', {
        totalCount: timeEntries.length
      });
      
    } catch (error: any) {
      throw new Error(`Failed to get time entries: ${error.message}`);
    }
  }

  /**
   * Update a time entry
   */
  async updateTimeEntry(timeEntryId: string, params: WorkItemUpdateParams, issueId?: string): Promise<MCPResponse> {
    try {
      // Use per-issue endpoint if issueId provided, otherwise global
      const endpoint = issueId
        ? `/issues/${issueId}/timeTracking/workItems/${timeEntryId}`
        : `/workItems/${timeEntryId}`;

      const updateData: any = {};
      if (params.duration) updateData.duration = { minutes: this.parseDurationToMinutes(params.duration) };
      if (params.description) updateData.text = params.description;
      if (params.date) updateData.date = new Date(params.date).getTime();
      if (params.workType) {
        const typeId = await this.resolveWorkTypeId(params.workType);
        if (typeId) updateData.type = { id: typeId };
      }

      const response = await this.put(endpoint, updateData);
      return ResponseFormatter.formatUpdated(response.data, 'Time Entry', updateData, `Time entry ${timeEntryId} updated`);

    } catch (error: any) {
      throw new Error(`Failed to update time entry: ${error.message}`);
    }
  }

  /**
   * Delete a time entry
   */
  async deleteTimeEntry(timeEntryId: string, issueId?: string): Promise<MCPResponse> {
    try {
      // Use per-issue endpoint if issueId provided, otherwise global
      const endpoint = issueId
        ? `/issues/${issueId}/timeTracking/workItems/${timeEntryId}`
        : `/workItems/${timeEntryId}`;
      await this.delete(endpoint);
      return ResponseFormatter.formatDeleted(timeEntryId, 'Time Entry');

    } catch (error: any) {
      throw new Error(`Failed to delete time entry: ${error.message}`);
    }
  }

  /**
   * Get work items (generic version of time entries)
   */
  async getWorkItems(issueId?: string, projectId?: string, userId?: string): Promise<MCPResponse> {
    try {
      const fields = 'id,duration(minutes,presentation),date,text,type(id,name),author(id,login,fullName)';

      // Use per-issue endpoint when issueId is provided
      if (issueId) {
        const endpoint = `/issues/${issueId}/timeTracking/workItems?fields=${fields}`;
        const response = await this.get<WorkItem[]>(endpoint);
        const workItems = response.data || [];
        return ResponseFormatter.formatList(workItems, 'work item', {
          totalCount: workItems.length
        });
      }

      // Global endpoint for cross-issue queries
      const endpoint = `/workItems`;
      const params: any = {
        fields: fields + ',issue(id,summary,project(id,name,shortName))',
        $top: 100
      };

      const queryParts: string[] = [];
      if (projectId) queryParts.push(`project: ${projectId}`);
      if (userId) queryParts.push(`author: ${userId}`);

      if (queryParts.length > 0) {
        params.query = queryParts.join(' ');
      }

      const response = await this.get<WorkItem[]>(endpoint, params);
      const workItems = response.data || [];

      return ResponseFormatter.formatList(workItems, 'work item', {
        totalCount: workItems.length
      });
      
    } catch (error: any) {
      throw new Error(`Failed to get work items: ${error.message}`);
    }
  }

  /**
   * Create a new work item
   */
  async createWorkItem(params: WorkItemCreateParams): Promise<MCPResponse> {
    try {
      // Use per-issue endpoint (accepts readable IDs like SC-1687)
      const fields = 'id,date,duration(minutes,presentation),text,type(id,name),author(id,login,fullName)';
      const endpoint = `/issues/${params.issueId}/timeTracking/workItems?fields=${fields}`;

      const workData: any = {
        duration: { minutes: this.parseDurationToMinutes(params.duration) },
        text: params.description || '',
        date: params.date ? new Date(params.date).getTime() : Date.now()
      };

      if (params.workType) {
        const typeId = await this.resolveWorkTypeId(params.workType);
        if (typeId) {
          workData.type = { id: typeId };
        }
      }

      const response = await this.post(endpoint, workData);
      const workItemId = response.data?.id || 'created';
      const message = `Work item created for issue ${params.issueId}${workItemId !== 'created' ? ` (ID: ${workItemId})` : ''}`;
      
      return ResponseFormatter.formatCreated(response.data, 'Work Item', message);
      
    } catch (error: any) {
      throw new Error(`Failed to create work item: ${error.message}`);
    }
  }

  /**
   * Update a work item
   */
  async updateWorkItem(workItemId: string, params: WorkItemUpdateParams): Promise<MCPResponse> {
    try {
      const endpoint = `/workItems/${workItemId}`;
      
      const updateData: any = {};
      if (params.duration) updateData.duration = this.parseDurationToMinutes(params.duration);
      if (params.description) updateData.description = params.description;
      if (params.date) updateData.date = new Date(params.date).getTime();
      if (params.workType) updateData.type = { name: params.workType };

      const response = await this.put(endpoint, updateData);
      return ResponseFormatter.formatUpdated(response.data, 'Work Item', updateData, `Work item ${workItemId} updated`);
      
    } catch (error: any) {
      throw new Error(`Failed to update work item: ${error.message}`);
    }
  }

  /**
   * Generate time tracking report
   */
  async generateTimeReport(projectId?: string, startDate?: string, endDate?: string, userId?: string): Promise<MCPResponse> {
    try {
      const endpoint = `/reports/time`;
      
      const params: any = {};
      if (projectId) params.project = projectId;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (userId) params.author = userId;

      const response = await this.get(endpoint, params);
      
      return ResponseFormatter.formatSuccess(response.data, 'Time tracking report generated successfully');
      
    } catch (error: any) {
      throw new Error(`Failed to generate time report: ${error.message}`);
    }
  }

  /**
   * Resolve work type name to ID via API
   */
  private async resolveWorkTypeId(workTypeName: string): Promise<string | null> {
    try {
      const response = await this.get<Array<{ id: string; name: string }>>('/admin/timeTrackingSettings/workItemTypes', {
        fields: 'id,name'
      });
      const types = response.data || [];
      const found = types.find((t: any) => t.name.toLowerCase() === workTypeName.toLowerCase());
      return found?.id || null;
    } catch {
      return null;
    }
  }

  /**
   * Helper method to parse duration strings like "2h", "1d", "30m" to minutes
   */
  private parseDurationToMinutes(duration: string): number {
    const match = duration.match(/^(\d+(?:\.\d+)?)\s*([hdm])$/i);
    if (!match) {
      throw new Error(`Invalid duration format: ${duration}. Expected format: "2h", "1d", "30m"`);
    }

    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 'm': return value; // minutes
      case 'h': return value * 60; // hours to minutes
      case 'd': return value * 60 * 8; // days to minutes (8 hour workday)
      default:
        throw new Error(`Unknown duration unit: ${unit}`);
    }
  }

  /**
   * Helper method to format minutes to readable duration
   */
  private formatMinutesToDuration(minutes: number): string {
    if (minutes < 60) {
      return `${minutes}m`;
    } else if (minutes < 480) { // Less than 8 hours
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    } else {
      const days = Math.floor(minutes / 480);
      const remainingHours = Math.floor((minutes % 480) / 60);
      const remainingMinutes = minutes % 60;
      
      let result = `${days}d`;
      if (remainingHours > 0) result += ` ${remainingHours}h`;
      if (remainingMinutes > 0) result += ` ${remainingMinutes}m`;
      
      return result;
    }
  }
}
