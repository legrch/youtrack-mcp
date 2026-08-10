/**
 * Custom Fields API Client
 * Handles custom field management and configuration
 */

import { BaseAPIClient, MCPResponse } from '../base/base-client.js';
import { ResponseFormatter, type ResponseMetadata } from '../base/response-formatter.js';

export interface CustomFieldCreateParams {
  name: string;
  fieldType: string;
  isPublic?: boolean;
  ordinal?: number;
}

export type BundleType = 'enum' | 'state';

export interface BundleValueParams {
  name: string;
  description?: string;
  isResolved?: boolean;
  archived?: boolean;
  ordinal?: number;
}

export interface BundleValueUpdateParams {
  name?: string;
  description?: string;
  isResolved?: boolean;
  archived?: boolean;
  ordinal?: number;
}

export interface BundleCreateParams {
  name: string;
  bundleType?: BundleType;
  values?: BundleValueParams[];
}

interface BundleValueRecord extends BundleValueUpdateParams {
  id: string;
}

interface BundleRecord {
  id: string;
  name: string;
  isUpdateable?: boolean;
  $type?: string;
  values?: BundleValueRecord[];
}

interface PagedBundleCollection<T> {
  items: T[];
  returnedCount: number;
  completeness: 'complete' | 'unknown';
  truncated: boolean;
}

interface BundleListResponseMetadata extends ResponseMetadata {
  count: number;
  totalCount: number | null;
  returnedCount: number;
  completeness: 'complete' | 'unknown';
  truncated: boolean;
  responseSchemaVersion: 2;
  nestedCollections: {
    values: {
      included: boolean;
      completeness: 'unknown' | 'not_requested';
      truncated: 'unknown' | false;
      note?: string;
    };
  };
}

/**
 * Custom Fields API Client - Handles custom field operations
 */
export class CustomFieldsAPIClient extends BaseAPIClient {

  // ==================== CUSTOM FIELD OPERATIONS ====================

  /**
   * List all custom fields
   */
  async listCustomFields(fields?: string): Promise<MCPResponse> {
    try {
      const endpoint = '/admin/customFieldSettings/customFields';
      const params = {
        fields: fields || 'id,name,fieldType(id,presentation),ordinal,isPublic,hasRunningJob,isUpdateable,instances(project(id,name,shortName))',
        $top: 1000
      };

      const response = await this.axios.get(endpoint, { params });
      
      return ResponseFormatter.formatSuccess(
        response.data,
        `Retrieved ${response.data?.length || 0} custom fields`
      );
    } catch (error: any) {
      return ResponseFormatter.formatError(`Failed to list custom fields: ${error.message}`, error);
    }
  }

  /**
   * Get custom field by ID
   */
  async getCustomField(fieldId: string, fields?: string): Promise<MCPResponse> {
    try {
      const endpoint = `/admin/customFieldSettings/customFields/${fieldId}`;
      const params = {
        fields: fields || 'id,name,fieldType(id,presentation),ordinal,isPublic,hasRunningJob,isUpdateable,instances(project(id,name,shortName))'
      };

      const response = await this.axios.get(endpoint, { params });
      
      return ResponseFormatter.formatSuccess(
        response.data,
        `Retrieved custom field ${fieldId}`
      );
    } catch (error: any) {
      return ResponseFormatter.formatError(`Failed to get custom field: ${error.message}`, error);
    }
  }

  /**
   * Create a new custom field
   */
  async createCustomField(params: CustomFieldCreateParams): Promise<MCPResponse> {
    try {
      const endpoint = '/admin/customFieldSettings/customFields';
      const data = {
        name: params.name,
        fieldType: { id: params.fieldType },
        isPublic: params.isPublic ?? true,
        ordinal: params.ordinal
      };

      const response = await this.axios.post(endpoint, data, {
        params: {
          fields: 'id,name,fieldType(id,presentation),ordinal,isPublic'
        }
      });
      
      return ResponseFormatter.formatSuccess(
        response.data,
        `Created custom field: ${params.name}`
      );
    } catch (error: any) {
      return ResponseFormatter.formatError(`Failed to create custom field: ${error.message}`, error);
    }
  }

  /**
   * Update custom field
   */
  async updateCustomField(fieldId: string, updates: Partial<CustomFieldCreateParams>): Promise<MCPResponse> {
    try {
      const endpoint = `/admin/customFieldSettings/customFields/${fieldId}`;
      const data: any = {};

      if (updates.name) data.name = updates.name;
      if (updates.isPublic !== undefined) data.isPublic = updates.isPublic;
      if (updates.ordinal !== undefined) data.ordinal = updates.ordinal;

      const response = await this.axios.post(endpoint, data, {
        params: {
          fields: 'id,name,fieldType(id,presentation),ordinal,isPublic'
        }
      });
      
      return ResponseFormatter.formatSuccess(
        response.data,
        `Updated custom field ${fieldId}`
      );
    } catch (error: any) {
      return ResponseFormatter.formatError(`Failed to update custom field: ${error.message}`, error);
    }
  }

  /**
   * Delete custom field
   */
  async deleteCustomField(fieldId: string): Promise<MCPResponse> {
    try {
      const endpoint = `/admin/customFieldSettings/customFields/${fieldId}`;

      await this.axios.delete(endpoint);
      
      return ResponseFormatter.formatSuccess(
        { fieldId },
        `Deleted custom field ${fieldId}`
      );
    } catch (error: any) {
      return ResponseFormatter.formatError(`Failed to delete custom field: ${error.message}`, error);
    }
  }

  // ==================== FIELD TYPE OPERATIONS ====================

  /**
   * List all available field types
   */
  async listFieldTypes(fields?: string): Promise<MCPResponse> {
    try {
      const endpoint = '/admin/customFieldSettings/types';
      const params = {
        fields: fields || 'id,presentation,isMultiValue,isBundleType',
        $top: 100
      };

      const response = await this.axios.get(endpoint, { params });
      
      return ResponseFormatter.formatSuccess(
        response.data,
        `Retrieved ${response.data?.length || 0} field types`
      );
    } catch (error: any) {
      return ResponseFormatter.formatError(`Failed to list field types: ${error.message}`, error);
    }
  }

  // ==================== BUNDLE OPERATIONS ====================

  /**
   * List bundles of a supported type. The enum default preserves the
   * behavior of existing MCP callers that predate state bundle support.
   */
  async listBundles(bundleType: BundleType = 'enum', fields?: string): Promise<MCPResponse> {
    try {
      const endpoint = `/admin/customFieldSettings/bundles/${bundleType}`;
      const requestedFields = this.ensureTopLevelIdField(
        fields || this.bundleFields(bundleType)
      );
      const page = await this.readAllBundlePages<BundleRecord>(endpoint, requestedFields);
      const includesNestedValues = requestedFields.includes('values');

      const metadata: BundleListResponseMetadata = {
        count: page.returnedCount,
        totalCount: page.completeness === 'complete' ? page.returnedCount : null,
        returnedCount: page.returnedCount,
        completeness: page.completeness,
        truncated: page.truncated,
        responseSchemaVersion: 2,
        nestedCollections: {
          values: {
            included: includesNestedValues,
            completeness: includesNestedValues ? 'unknown' : 'not_requested',
            truncated: includesNestedValues ? 'unknown' : false,
            note: includesNestedValues
              ? 'Nested value collections are not used as exact totals; get a target bundle for paged values.'
              : undefined
          }
        }
      };

      return ResponseFormatter.formatSuccess(
        page.items,
        page.completeness === 'complete'
          ? `Retrieved ${page.returnedCount} ${bundleType} bundles`
          : `Returned ${page.returnedCount} ${bundleType} bundles; the full collection could not be proven complete`,
        metadata
      );
    } catch (error: any) {
      return ResponseFormatter.formatError(`Failed to list ${bundleType} bundles: ${error.message}`, error);
    }
  }

  /**
   * Backward-compatible enum bundle list.
   */
  async listEnumBundles(fields?: string): Promise<MCPResponse> {
    return this.listBundles('enum', fields);
  }

  /**
   * Get a bundle by ID and type.
   */
  async getBundle(bundleId: string, bundleType: BundleType = 'enum', fields?: string): Promise<MCPResponse> {
    try {
      if (fields) {
        const endpoint = `/admin/customFieldSettings/bundles/${bundleType}/${bundleId}`;
        const response = await this.axios.get<BundleRecord>(endpoint, {
          params: { fields: this.ensureTopLevelIdField(fields) }
        });
        if (response.data?.id !== bundleId) {
          throw new Error(
            `Fresh bundle lookup returned ${response.data?.id ?? 'no ID'}, expected ${bundleId}`
          );
        }
        const valuesIncluded = Array.isArray(response.data.values);

        return ResponseFormatter.formatSuccess(
          {
            ...response.data,
            valuesMetadata: {
              returnedCount: valuesIncluded ? response.data.values?.length ?? 0 : 0,
              completeness: valuesIncluded ? 'unknown' : 'not_requested',
              truncated: valuesIncluded ? 'unknown' : false
            }
          },
          `Retrieved ${bundleType} bundle ${bundleId}`
        );
      }

      const snapshot = await this.getFreshBundleSnapshot(bundleId, bundleType);
      
      return ResponseFormatter.formatSuccess(
        {
          ...snapshot.bundle,
          values: snapshot.values.items,
          valuesMetadata: {
            returnedCount: snapshot.values.returnedCount,
            completeness: snapshot.values.completeness,
            truncated: snapshot.values.truncated
          }
        },
        `Retrieved ${bundleType} bundle ${bundleId}`
      );
    } catch (error: any) {
      return ResponseFormatter.formatError(`Failed to get ${bundleType} bundle: ${error.message}`, error);
    }
  }

  /**
   * Backward-compatible enum bundle lookup.
   */
  async getEnumBundle(bundleId: string, fields?: string): Promise<MCPResponse> {
    return this.getBundle(bundleId, 'enum', fields);
  }

  /**
   * Create a new enum or state bundle.
   */
  async createBundle(params: BundleCreateParams): Promise<MCPResponse> {
    const bundleType = params.bundleType ?? 'enum';
    const endpoint = `/admin/customFieldSettings/bundles/${bundleType}`;
    let writeAttempted = false;

    try {
      const data: any = {
        name: params.name
      };

      if (params.values && params.values.length > 0) {
        data.values = params.values.map((value, index) =>
          this.bundleValuePayload(bundleType, {
            ...value,
            ordinal: value.ordinal ?? index
          })
        );

        const normalizedNames = params.values.map(value =>
          this.normalizeBundleName(value.name)
        );
        const duplicateValueNames = params.values
          .filter((_value, index) => normalizedNames.indexOf(normalizedNames[index]) !== index)
          .map(value => value.name);
        if (duplicateValueNames.length > 0) {
          return ResponseFormatter.formatError(
            `Cannot safely create ${bundleType} bundle with duplicate value names`,
            {
              bundleType,
              bundleName: params.name,
              duplicateValueNames: [...new Set(duplicateValueNames)],
              writeAttempted: false,
              writeAccepted: false,
              verified: false,
              indeterminate: false
            }
          );
        }
      }

      const preflight = await this.readAllBundlePages<BundleRecord>(endpoint, 'id,name');
      if (preflight.completeness !== 'complete') {
        return ResponseFormatter.formatError(
          `Cannot safely create ${bundleType} bundle because the name preflight is incomplete`,
          {
            bundleType,
            bundleName: params.name,
            writeAttempted: false,
            writeAccepted: false,
            verified: false,
            indeterminate: false,
            preflight
          }
        );
      }
      const existing = this.findBundlesByName(preflight.items, params.name);
      if (existing.length > 1) {
        return ResponseFormatter.formatError(
          `Cannot safely create ${bundleType} bundle: name "${params.name}" is ambiguous`,
          {
            bundleType,
            bundleName: params.name,
            matchingIds: existing.map(bundle => bundle.id),
            writeAttempted: false,
            writeAccepted: false,
            verified: false,
            indeterminate: false
          }
        );
      }
      if (existing.length === 1) {
        const snapshot = await this.getFreshBundleSnapshot(existing[0].id, bundleType);
        const verification = this.verifyBundleCreateSnapshot(snapshot, data);
        if (verification.verified) {
          return ResponseFormatter.formatSuccess(
            {
              outcome: 'verified_noop',
              writeAttempted: false,
              writeAccepted: false,
              verified: true,
              finalStateVerified: true,
              indeterminate: false,
              bundleId: existing[0].id,
              bundleType,
              verification
            },
            `${bundleType} bundle "${params.name}" already exists with the requested properties`
          );
        }

        return ResponseFormatter.formatError(
          `Cannot safely create ${bundleType} bundle: name "${params.name}" already exists with different properties`,
          {
            bundleId: existing[0].id,
            bundleType,
            writeAttempted: false,
            writeAccepted: false,
            verified: false,
            indeterminate: false,
            verification
          }
        );
      }

      writeAttempted = true;
      let response;
      try {
        response = await this.post(endpoint, data, {
          retry: false,
          params: { fields: this.bundleFields(bundleType) }
        });
      } catch (error: any) {
        const rejectionStatus = this.definiteWriteRejectionStatus(error);
        if (rejectionStatus !== null) {
          return ResponseFormatter.formatError(
            `Create ${bundleType} bundle was rejected by YouTrack (${rejectionStatus}): ${error.message}`,
            {
              outcome: 'rejected',
              writeAttempted: true,
              writeAccepted: false,
              verified: false,
              finalStateVerified: false,
              indeterminate: false,
              httpStatus: rejectionStatus,
              bundleType,
              bundleName: params.name
            }
          );
        }

        const resolution = await this.resolveBundleByName(params.name, bundleType, data);
        return ResponseFormatter.formatError(
          `Create ${bundleType} bundle write outcome is indeterminate: ${error.message}`,
          {
            outcome: 'indeterminate',
            writeAttempted: true,
            writeAccepted: null,
            verified: resolution.finalStateVerified,
            finalStateVerified: resolution.finalStateVerified,
            indeterminate: true,
            bundleType,
            bundleName: params.name,
            resolution
          }
        );
      }

      const bundleId = response.data?.id;
      if (!bundleId) {
        const resolution = await this.resolveBundleByName(params.name, bundleType, data);
        if (!resolution.finalStateVerified || !resolution.bundleId) {
          return ResponseFormatter.formatError(
            `Create ${bundleType} bundle was accepted, but no unique bundle ID was available for verification`,
            {
              outcome: 'accepted_but_not_verified',
              writeAttempted: true,
              writeAccepted: true,
              verified: false,
              finalStateVerified: false,
              indeterminate: true,
              bundleType,
              bundleName: params.name,
              resolution
            }
          );
        }

        return ResponseFormatter.formatSuccess(
          {
            outcome: 'verified',
            writeAttempted: true,
            writeAccepted: true,
            verified: true,
            finalStateVerified: true,
            indeterminate: false,
            bundleId: resolution.bundleId,
            bundleType,
            resolution
          },
          `Created and verified ${bundleType} bundle: ${params.name}`
        );
      }

      try {
        const snapshot = await this.getFreshBundleSnapshot(bundleId, bundleType);
        const propertyVerification = this.verifyBundleCreateSnapshot(snapshot, data);
        const nameResolution = await this.verifyUniqueBundleName(
          params.name,
          bundleId,
          bundleType
        );
        const verified = propertyVerification.verified && nameResolution.verified;
        const verification = { properties: propertyVerification, uniqueName: nameResolution };
        const result = {
          outcome: verified ? 'verified' : 'accepted_but_not_verified',
          writeAttempted: true,
          writeAccepted: true,
          verified,
          finalStateVerified: verified,
          indeterminate: snapshot.values.completeness !== 'complete' ||
            nameResolution.completeness !== 'complete',
          bundleId,
          bundleType,
          bundle: snapshot.bundle,
          values: snapshot.values,
          verification
        };

        if (!verified) {
          return ResponseFormatter.formatError(
            `Created ${bundleType} bundle was accepted, but fresh readback did not verify the requested properties`,
            result
          );
        }

        return ResponseFormatter.formatSuccess(
          result,
          `Created and verified ${bundleType} bundle: ${params.name}`
        );
      } catch (error: any) {
        return ResponseFormatter.formatError(
          `Created ${bundleType} bundle was accepted, but fresh readback failed: ${error.message}`,
          {
            outcome: 'accepted_but_not_verified',
            writeAttempted: true,
            writeAccepted: true,
            verified: false,
            finalStateVerified: false,
            indeterminate: true,
            bundleId,
            bundleType
          }
        );
      }
    } catch (error: any) {
      return ResponseFormatter.formatError(
        `Failed to create ${bundleType} bundle: ${error.message}`,
        {
          bundleType,
          bundleName: params.name,
          writeAttempted,
          writeAccepted: writeAttempted ? null : false,
          verified: false,
          indeterminate: writeAttempted
        }
      );
    }
  }

  /**
   * Backward-compatible enum bundle creation.
   */
  async createEnumBundle(params: BundleCreateParams): Promise<MCPResponse> {
    return this.createBundle({ ...params, bundleType: 'enum' });
  }

  /**
   * Add a value to an enum or state bundle.
   */
  async addBundleValue(
    bundleId: string,
    value: BundleValueParams,
    bundleType: BundleType = 'enum'
  ): Promise<MCPResponse> {
    let writeAttempted = false;

    try {
      const bundle = await this.getBundleWritePreflight(bundleId, bundleType);
      if (bundle.isUpdateable !== true) {
        return ResponseFormatter.formatError(
          bundle.isUpdateable === false
            ? `${bundleType} bundle ${bundleId} is not updateable by the current user`
            : `Cannot confirm update permission for ${bundleType} bundle ${bundleId}`,
          {
            bundleId,
            bundleType,
            bundleName: bundle.name,
            isUpdateable: bundle.isUpdateable,
            writeAttempted: false,
            writeAccepted: false,
            verified: false,
            indeterminate: false
          }
        );
      }

      const endpoint = `/admin/customFieldSettings/bundles/${bundleType}/${bundleId}/values`;
      const data = this.bundleValuePayload(bundleType, value);
      const preflight = await this.readAllBundlePages<BundleValueRecord>(
        endpoint,
        this.bundleValueFields(bundleType)
      );
      if (preflight.completeness !== 'complete') {
        return ResponseFormatter.formatError(
          `Cannot safely add ${bundleType} bundle value because the value-name preflight is incomplete`,
          {
            bundleId,
            bundleType,
            valueName: value.name,
            writeAttempted: false,
            writeAccepted: false,
            verified: false,
            indeterminate: false,
            preflight
          }
        );
      }
      const existing = this.findBundleValuesByName(preflight.items, value.name);
      if (existing.length > 1) {
        return ResponseFormatter.formatError(
          `Cannot safely add ${bundleType} bundle value: name "${value.name}" is ambiguous`,
          {
            bundleId,
            bundleType,
            valueName: value.name,
            matchingIds: existing.map(candidate => candidate.id),
            writeAttempted: false,
            writeAccepted: false,
            verified: false,
            indeterminate: false
          }
        );
      }
      if (existing.length === 1) {
        const comparison = this.compareRequestedProperties(
          existing[0] as unknown as Record<string, unknown>,
          data
        );
        if (comparison.matches) {
          return ResponseFormatter.formatSuccess(
            {
              outcome: 'verified_noop',
              writeAttempted: false,
              writeAccepted: false,
              verified: true,
              finalStateVerified: true,
              indeterminate: false,
              bundleId,
              bundleType,
              valueId: existing[0].id,
              verification: comparison
            },
            `Value "${value.name}" already exists with the requested properties in ${bundleType} bundle ${bundleId}`
          );
        }

        return ResponseFormatter.formatError(
          `Cannot safely add ${bundleType} bundle value: name "${value.name}" already exists with different properties`,
          {
            bundleId,
            bundleType,
            valueId: existing[0].id,
            writeAttempted: false,
            writeAccepted: false,
            verified: false,
            indeterminate: false,
            verification: comparison
          }
        );
      }

      writeAttempted = true;
      let response;
      try {
        response = await this.post(endpoint, data, {
          retry: false,
          params: { fields: this.bundleValueFields(bundleType) }
        });
      } catch (error: any) {
        const rejectionStatus = this.definiteWriteRejectionStatus(error);
        if (rejectionStatus !== null) {
          return ResponseFormatter.formatError(
            `Add ${bundleType} bundle value was rejected by YouTrack (${rejectionStatus}): ${error.message}`,
            {
              outcome: 'rejected',
              writeAttempted: true,
              writeAccepted: false,
              verified: false,
              finalStateVerified: false,
              indeterminate: false,
              httpStatus: rejectionStatus,
              bundleId,
              bundleType,
              valueName: value.name
            }
          );
        }

        const resolution = await this.resolveBundleValueByName(
          bundleId,
          bundleType,
          value.name,
          data
        );
        return ResponseFormatter.formatError(
          `Add ${bundleType} bundle value write outcome is indeterminate: ${error.message}`,
          {
            outcome: 'indeterminate',
            writeAttempted: true,
            writeAccepted: null,
            verified: resolution.finalStateVerified,
            finalStateVerified: resolution.finalStateVerified,
            indeterminate: true,
            bundleId,
            bundleType,
            valueName: value.name,
            resolution
          }
        );
      }

      const valueId = response.data?.id;
      if (!valueId) {
        const resolution = await this.resolveBundleValueByName(
          bundleId,
          bundleType,
          value.name,
          data
        );
        if (!resolution.finalStateVerified || !resolution.valueId) {
          return ResponseFormatter.formatError(
            `Added ${bundleType} bundle value was accepted, but no unique value ID was available for verification`,
            {
              outcome: 'accepted_but_not_verified',
              writeAttempted: true,
              writeAccepted: true,
              verified: false,
              finalStateVerified: false,
              indeterminate: true,
              bundleId,
              bundleType,
              resolution
            }
          );
        }

        return ResponseFormatter.formatSuccess(
          {
            outcome: 'verified',
            writeAttempted: true,
            writeAccepted: true,
            verified: true,
            finalStateVerified: true,
            indeterminate: false,
            bundleId,
            bundleType,
            valueId: resolution.valueId,
            resolution
          },
          `Added and verified value "${value.name}" in ${bundleType} bundle ${bundleId}`
        );
      }

      try {
        const actual = await this.getFreshBundleValue(bundleId, valueId, bundleType);
        const propertyVerification = this.compareRequestedProperties(
          actual as unknown as Record<string, unknown>,
          data
        );
        const nameResolution = await this.verifyUniqueBundleValueName(
          value.name,
          valueId,
          bundleId,
          bundleType
        );
        const verified = propertyVerification.matches && nameResolution.verified;
        const verification = { properties: propertyVerification, uniqueName: nameResolution };
        const result = {
          outcome: verified ? 'verified' : 'accepted_but_not_verified',
          writeAttempted: true,
          writeAccepted: true,
          verified,
          finalStateVerified: verified,
          indeterminate: nameResolution.completeness !== 'complete',
          bundleId,
          bundleType,
          valueId,
          value: actual,
          verification
        };
        if (!verified) {
          return ResponseFormatter.formatError(
            `Added ${bundleType} bundle value was accepted, but fresh readback did not verify the requested properties`,
            result
          );
        }

        return ResponseFormatter.formatSuccess(
          result,
          `Added and verified value "${value.name}" in ${bundleType} bundle ${bundleId}`
        );
      } catch (error: any) {
        return ResponseFormatter.formatError(
          `Added ${bundleType} bundle value was accepted, but fresh readback failed: ${error.message}`,
          {
            outcome: 'accepted_but_not_verified',
            writeAttempted: true,
            writeAccepted: true,
            verified: false,
            finalStateVerified: false,
            indeterminate: true,
            bundleId,
            bundleType,
            valueId
          }
        );
      }
    } catch (error: any) {
      return ResponseFormatter.formatError(
        `Failed to add ${bundleType} bundle value: ${error.message}`,
        {
          bundleId,
          bundleType,
          valueName: value.name,
          writeAttempted,
          writeAccepted: writeAttempted ? null : false,
          verified: false,
          indeterminate: writeAttempted
        }
      );
    }
  }

  /**
   * Backward-compatible enum bundle value creation.
   */
  async addEnumBundleValue(bundleId: string, name: string, description?: string): Promise<MCPResponse> {
    return this.addBundleValue(bundleId, { name, description }, 'enum');
  }

  /**
   * Update a value in an enum or state bundle.
   */
  async updateBundleValue(
    bundleId: string,
    valueId: string,
    updates: BundleValueUpdateParams,
    bundleType: BundleType = 'enum'
  ): Promise<MCPResponse> {
    let writeAttempted = false;

    try {
      const bundle = await this.getBundleWritePreflight(bundleId, bundleType);
      if (bundle.isUpdateable !== true) {
        return ResponseFormatter.formatError(
          bundle.isUpdateable === false
            ? `${bundleType} bundle ${bundleId} is not updateable by the current user`
            : `Cannot confirm update permission for ${bundleType} bundle ${bundleId}`,
          {
            bundleId,
            bundleType,
            bundleName: bundle.name,
            isUpdateable: bundle.isUpdateable,
            writeAttempted: false,
            writeAccepted: false,
            verified: false,
            indeterminate: false
          }
        );
      }

      const endpoint = `/admin/customFieldSettings/bundles/${bundleType}/${bundleId}/values/${valueId}`;
      const data = this.bundleValuePayload(bundleType, updates);
      if (Object.keys(data).length === 0) {
        return ResponseFormatter.formatError(
          'At least one bundle value property is required for update',
          {
            bundleId,
            bundleType,
            valueId,
            writeAttempted: false,
            writeAccepted: false,
            verified: false,
            indeterminate: false
          }
        );
      }

      if (updates.name !== undefined) {
        const valuesEndpoint = `/admin/customFieldSettings/bundles/${bundleType}/${bundleId}/values`;
        const namePreflight = await this.readAllBundlePages<BundleValueRecord>(
          valuesEndpoint,
          this.bundleValueFields(bundleType)
        );
        if (namePreflight.completeness !== 'complete') {
          return ResponseFormatter.formatError(
            `Cannot safely rename ${bundleType} bundle value because the value-name preflight is incomplete`,
            {
              bundleId,
              bundleType,
              valueId,
              valueName: updates.name,
              writeAttempted: false,
              writeAccepted: false,
              verified: false,
              indeterminate: false,
              namePreflight
            }
          );
        }
        const conflictingValues = this.findBundleValuesByName(
          namePreflight.items,
          updates.name
        ).filter(candidate => candidate.id !== valueId);
        if (conflictingValues.length > 0) {
          return ResponseFormatter.formatError(
            `Cannot safely rename ${bundleType} bundle value: name "${updates.name}" already belongs to another value`,
            {
              bundleId,
              bundleType,
              valueId,
              valueName: updates.name,
              conflictingValueIds: conflictingValues.map(candidate => candidate.id),
              writeAttempted: false,
              writeAccepted: false,
              verified: false,
              indeterminate: false
            }
          );
        }
      }

      const before = await this.getFreshBundleValue(bundleId, valueId, bundleType);
      const beforeComparison = this.compareRequestedProperties(
        before as unknown as Record<string, unknown>,
        data
      );
      if (beforeComparison.matches) {
        return ResponseFormatter.formatSuccess(
          {
            outcome: 'verified_noop',
            writeAttempted: false,
            writeAccepted: false,
            verified: true,
            finalStateVerified: true,
            indeterminate: false,
            bundleId,
            bundleType,
            valueId,
            value: before,
            verification: beforeComparison
          },
          `Value ${valueId} in ${bundleType} bundle ${bundleId} already has the requested properties`
        );
      }

      writeAttempted = true;
      let writeAccepted: boolean | null = null;
      let writeError: string | undefined;
      try {
        await this.post(endpoint, data, {
          retry: false,
          params: { fields: this.bundleValueFields(bundleType) }
        });
        writeAccepted = true;
      } catch (error: any) {
        writeError = error.message;
        const rejectionStatus = this.definiteWriteRejectionStatus(error);
        if (rejectionStatus !== null) {
          return ResponseFormatter.formatError(
            `Update ${bundleType} bundle value was rejected by YouTrack (${rejectionStatus}): ${error.message}`,
            {
              outcome: 'rejected',
              writeAttempted: true,
              writeAccepted: false,
              verified: false,
              finalStateVerified: false,
              indeterminate: false,
              httpStatus: rejectionStatus,
              bundleId,
              bundleType,
              valueId
            }
          );
        }
      }

      try {
        const actual = await this.getFreshBundleValue(bundleId, valueId, bundleType);
        const verification = this.compareRequestedProperties(
          actual as unknown as Record<string, unknown>,
          data
        );
        const nameResolution = typeof data.name === 'string'
          ? await this.verifyUniqueBundleValueName(
              data.name,
              valueId,
              bundleId,
              bundleType
            )
          : undefined;
        const finalStateVerified = verification.matches &&
          (nameResolution?.verified ?? true);
        const result = {
          outcome: writeAccepted === true
            ? finalStateVerified ? 'verified' : 'accepted_but_not_verified'
            : 'indeterminate',
          writeAttempted: true,
          writeAccepted,
          verified: finalStateVerified,
          finalStateVerified,
          indeterminate: writeAccepted !== true ||
            nameResolution?.completeness === 'unknown',
          bundleId,
          bundleType,
          valueId,
          value: actual,
          verification,
          nameResolution,
          writeError
        };

        if (finalStateVerified && writeAccepted === true) {
          return ResponseFormatter.formatSuccess(
            result,
            `Updated and verified value ${valueId} in ${bundleType} bundle ${bundleId}`
          );
        }

        if (finalStateVerified) {
          return ResponseFormatter.formatError(
            `Requested final state for value ${valueId} is verified, but write acceptance is indeterminate`,
            result
          );
        }

        return ResponseFormatter.formatError(
          writeAccepted === true
            ? `Updated ${bundleType} bundle value was accepted, but fresh readback did not verify the requested properties`
            : `Update ${bundleType} bundle value write outcome is indeterminate and the requested final state was not observed`,
          result
        );
      } catch (error: any) {
        return ResponseFormatter.formatError(
          writeAccepted === true
            ? `Updated ${bundleType} bundle value was accepted, but fresh readback failed: ${error.message}`
            : `Update ${bundleType} bundle value write outcome and readback are indeterminate: ${writeError}; ${error.message}`,
          {
            outcome: writeAccepted === true ? 'accepted_but_not_verified' : 'indeterminate',
            writeAttempted: true,
            writeAccepted,
            verified: false,
            finalStateVerified: false,
            indeterminate: true,
            bundleId,
            bundleType,
            valueId,
            writeError
          }
        );
      }
    } catch (error: any) {
      return ResponseFormatter.formatError(
        `Failed to update ${bundleType} bundle value: ${error.message}`,
        {
          bundleId,
          bundleType,
          valueId,
          writeAttempted,
          writeAccepted: writeAttempted ? null : false,
          verified: false,
          indeterminate: writeAttempted
        }
      );
    }
  }

  private bundleFields(bundleType: BundleType): string {
    return `id,name,isUpdateable,$type,values(${this.bundleValueFields(bundleType)})`;
  }

  private bundleValueFields(bundleType: BundleType): string {
    const commonFields = 'id,name,description,ordinal,archived';
    return bundleType === 'state' ? `${commonFields},isResolved` : commonFields;
  }

  private bundleValuePayload(
    bundleType: BundleType,
    value: BundleValueUpdateParams
  ): Record<string, string | boolean | number> {
    if (bundleType !== 'state' && value.isResolved !== undefined) {
      throw new Error('isResolved is only supported for state bundle values');
    }

    const payload: Record<string, string | boolean | number> = {};

    if (value.name !== undefined) payload.name = value.name;
    if (value.description !== undefined) payload.description = value.description;
    if (value.archived !== undefined) payload.archived = value.archived;
    if (value.ordinal !== undefined) payload.ordinal = value.ordinal;
    if (value.isResolved !== undefined) {
      payload.isResolved = value.isResolved;
    }

    return payload;
  }

  private normalizeBundleName(value: string): string {
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

  private ensureTopLevelIdField(fields: string): string {
    let depth = 0;
    let tokenStart = 0;
    for (let index = 0; index <= fields.length; index += 1) {
      const character = fields[index];
      if (character === '(') depth += 1;
      if (character === ')') depth = Math.max(0, depth - 1);
      if ((character === ',' && depth === 0) || index === fields.length) {
        if (fields.slice(tokenStart, index).trim() === 'id') return fields;
        tokenStart = index + 1;
      }
    }

    return `id,${fields}`;
  }

  private findBundlesByName(bundles: BundleRecord[], name: string): BundleRecord[] {
    const normalized = this.normalizeBundleName(name);
    return bundles.filter(bundle =>
      typeof bundle.name === 'string' && this.normalizeBundleName(bundle.name) === normalized
    );
  }

  private findBundleValuesByName(
    values: BundleValueRecord[],
    name: string
  ): BundleValueRecord[] {
    const normalized = this.normalizeBundleName(name);
    return values.filter(value =>
      typeof value.name === 'string' && this.normalizeBundleName(value.name) === normalized
    );
  }

  private compareRequestedProperties(
    actual: Record<string, unknown>,
    requested: Record<string, string | boolean | number>
  ): { matches: boolean; mismatches: Array<{ field: string; requested: unknown; actual: unknown }> } {
    const mismatches = Object.entries(requested)
      .filter(([field, requestedValue]) => !Object.is(actual[field], requestedValue))
      .map(([field, requestedValue]) => ({
        field,
        requested: requestedValue,
        actual: actual[field]
      }));

    return { matches: mismatches.length === 0, mismatches };
  }

  private async getFreshBundleValue(
    bundleId: string,
    valueId: string,
    bundleType: BundleType
  ): Promise<BundleValueRecord> {
    const response = await this.axios.get<BundleValueRecord>(
      `/admin/customFieldSettings/bundles/${bundleType}/${bundleId}/values/${valueId}`,
      { params: { fields: this.bundleValueFields(bundleType) } }
    );
    if (response.data?.id !== valueId) {
      throw new Error(
        `Fresh value readback returned ${response.data?.id ?? 'no ID'}, expected ${valueId}`
      );
    }

    return response.data;
  }

  private async getFreshBundleSnapshot(
    bundleId: string,
    bundleType: BundleType
  ): Promise<{
    bundle: BundleRecord;
    values: PagedBundleCollection<BundleValueRecord>;
  }> {
    const [bundleResponse, values] = await Promise.all([
      this.axios.get<BundleRecord>(
        `/admin/customFieldSettings/bundles/${bundleType}/${bundleId}`,
        { params: { fields: 'id,name,isUpdateable,$type' } }
      ),
      this.readAllBundlePages<BundleValueRecord>(
        `/admin/customFieldSettings/bundles/${bundleType}/${bundleId}/values`,
        this.bundleValueFields(bundleType)
      )
    ]);
    if (bundleResponse.data?.id !== bundleId) {
      throw new Error(
        `Fresh bundle readback returned ${bundleResponse.data?.id ?? 'no ID'}, expected ${bundleId}`
      );
    }

    return { bundle: bundleResponse.data, values };
  }

  private verifyBundleCreateSnapshot(
    snapshot: {
      bundle: BundleRecord;
      values: PagedBundleCollection<BundleValueRecord>;
    },
    requested: { name: string; values?: Array<Record<string, string | boolean | number>> }
  ): {
    verified: boolean;
    mismatches: string[];
    valuesCompleteness: 'complete' | 'unknown';
  } {
    const mismatches: string[] = [];
    if (snapshot.bundle.name !== requested.name) {
      mismatches.push(`name: expected ${requested.name}, got ${snapshot.bundle.name}`);
    }

    if (snapshot.values.completeness !== 'complete') {
      mismatches.push('values: collection completeness is unknown');
    } else if (!requested.values || requested.values.length === 0) {
      if (snapshot.values.items.length > 0) {
        mismatches.push('values: expected an empty collection');
      }
    } else {
      const unusedActualValues = [...snapshot.values.items];
      requested.values.forEach((expectedValue, index) => {
        const matchIndex = unusedActualValues.findIndex(actualValue =>
          this.compareRequestedProperties(
            actualValue as unknown as Record<string, unknown>,
            expectedValue
          ).matches
        );
        if (matchIndex === -1) {
          mismatches.push(`values[${index}]: requested properties were not found`);
        } else {
          unusedActualValues.splice(matchIndex, 1);
        }
      });
      if (unusedActualValues.length > 0) {
        mismatches.push(`values: found ${unusedActualValues.length} unexpected value(s)`);
      }
    }

    return {
      verified: mismatches.length === 0,
      mismatches,
      valuesCompleteness: snapshot.values.completeness
    };
  }

  private async verifyUniqueBundleName(
    name: string,
    bundleId: string,
    bundleType: BundleType
  ): Promise<{
    verified: boolean;
    matchCount: number;
    matchingIds: string[];
    completeness: 'complete' | 'unknown';
    truncated: boolean;
  }> {
    const bundles = await this.readAllBundlePages<BundleRecord>(
      `/admin/customFieldSettings/bundles/${bundleType}`,
      'id,name'
    );
    const matches = this.findBundlesByName(bundles.items, name);
    return {
      verified: bundles.completeness === 'complete' &&
        matches.length === 1 &&
        matches[0].id === bundleId,
      matchCount: matches.length,
      matchingIds: matches.map(bundle => bundle.id),
      completeness: bundles.completeness,
      truncated: bundles.truncated
    };
  }

  private async verifyUniqueBundleValueName(
    name: string,
    valueId: string,
    bundleId: string,
    bundleType: BundleType
  ): Promise<{
    verified: boolean;
    matchCount: number;
    matchingIds: string[];
    completeness: 'complete' | 'unknown';
    truncated: boolean;
  }> {
    const values = await this.readAllBundlePages<BundleValueRecord>(
      `/admin/customFieldSettings/bundles/${bundleType}/${bundleId}/values`,
      this.bundleValueFields(bundleType)
    );
    const matches = this.findBundleValuesByName(values.items, name);
    return {
      verified: values.completeness === 'complete' &&
        matches.length === 1 &&
        matches[0].id === valueId,
      matchCount: matches.length,
      matchingIds: matches.map(value => value.id),
      completeness: values.completeness,
      truncated: values.truncated
    };
  }

  private async resolveBundleByName(
    name: string,
    bundleType: BundleType,
    requested: { name: string; values?: Array<Record<string, string | boolean | number>> }
  ): Promise<{
    finalStateVerified: boolean;
    bundleId?: string;
    matchCount?: number;
    completeness?: 'complete' | 'unknown';
    verification?: ReturnType<CustomFieldsAPIClient['verifyBundleCreateSnapshot']>;
    readError?: string;
  }> {
    try {
      const bundles = await this.readAllBundlePages<BundleRecord>(
        `/admin/customFieldSettings/bundles/${bundleType}`,
        'id,name'
      );
      const matches = this.findBundlesByName(bundles.items, name);
      if (bundles.completeness !== 'complete' || matches.length !== 1) {
        return {
          finalStateVerified: false,
          matchCount: matches.length,
          completeness: bundles.completeness
        };
      }

      const snapshot = await this.getFreshBundleSnapshot(matches[0].id, bundleType);
      const verification = this.verifyBundleCreateSnapshot(snapshot, requested);
      return {
        finalStateVerified: verification.verified,
        bundleId: matches[0].id,
        matchCount: 1,
        completeness: bundles.completeness,
        verification
      };
    } catch (error: any) {
      return { finalStateVerified: false, readError: error.message };
    }
  }

  private async resolveBundleValueByName(
    bundleId: string,
    bundleType: BundleType,
    name: string,
    requested: Record<string, string | boolean | number>
  ): Promise<{
    finalStateVerified: boolean;
    valueId?: string;
    matchCount?: number;
    completeness?: 'complete' | 'unknown';
    verification?: ReturnType<CustomFieldsAPIClient['compareRequestedProperties']>;
    readError?: string;
  }> {
    try {
      const values = await this.readAllBundlePages<BundleValueRecord>(
        `/admin/customFieldSettings/bundles/${bundleType}/${bundleId}/values`,
        this.bundleValueFields(bundleType)
      );
      const matches = this.findBundleValuesByName(values.items, name);
      if (values.completeness !== 'complete' || matches.length !== 1) {
        return {
          finalStateVerified: false,
          matchCount: matches.length,
          completeness: values.completeness
        };
      }

      const actual = await this.getFreshBundleValue(bundleId, matches[0].id, bundleType);
      const verification = this.compareRequestedProperties(
        actual as unknown as Record<string, unknown>,
        requested
      );
      return {
        finalStateVerified: verification.matches,
        valueId: actual.id,
        matchCount: 1,
        completeness: values.completeness,
        verification
      };
    } catch (error: any) {
      return { finalStateVerified: false, readError: error.message };
    }
  }

  private async readAllBundlePages<T>(
    endpoint: string,
    fields: string
  ): Promise<PagedBundleCollection<T>> {
    const pageSize = 100;
    const maxItems = 10000;
    const items: T[] = [];
    const seenPages = new Set<string>();
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

      const pageSignature = JSON.stringify(response.data);
      if (seenPages.has(pageSignature)) {
        return {
          items,
          returnedCount: items.length,
          completeness: 'unknown',
          truncated: true
        };
      }
      seenPages.add(pageSignature);

      for (const item of response.data) {
        const id = (item as { id?: unknown }).id;
        if (typeof id !== 'string' || seenIds.has(id)) {
          return {
            items,
            returnedCount: items.length,
            completeness: 'unknown',
            truncated: true
          };
        }
        seenIds.add(id);
      }
      items.push(...response.data);
      skip += response.data.length;
    }

    return {
      items,
      returnedCount: items.length,
      completeness: 'unknown',
      truncated: true
    };
  }

  private async getBundleWritePreflight(
    bundleId: string,
    bundleType: BundleType
  ): Promise<{ id: string; name?: string; isUpdateable?: boolean }> {
    const response = await this.axios.get(
      `/admin/customFieldSettings/bundles/${bundleType}/${bundleId}`,
      { params: { fields: 'id,name,isUpdateable' } }
    );

    if (response.data?.id !== bundleId) {
      throw new Error(
        `Bundle preflight returned ${response.data?.id ?? 'no ID'}, expected ${bundleId}`
      );
    }

    return response.data;
  }

  // ==================== PROJECT CUSTOM FIELD OPERATIONS ====================

  /**
   * Get project custom fields
   */
  async getProjectCustomFields(projectId: string, fields?: string): Promise<MCPResponse> {
    try {
      const endpoint = `/admin/projects/${projectId}/customFields`;
      const params = {
        fields: fields || 'field(id,name,fieldType(id,presentation)),canBeEmpty,emptyFieldText,ordinal,isPublic',
        $top: 1000
      };

      const response = await this.axios.get(endpoint, { params });
      
      return ResponseFormatter.formatSuccess(
        response.data,
        `Retrieved ${response.data?.length || 0} project custom fields`
      );
    } catch (error: any) {
      return ResponseFormatter.formatError(`Failed to get project custom fields: ${error.message}`, error);
    }
  }

  /**
   * Add custom field to project
   */
  async addCustomFieldToProject(
    projectId: string, 
    fieldId: string, 
    options?: { canBeEmpty?: boolean; emptyFieldText?: string }
  ): Promise<MCPResponse> {
    try {
      const endpoint = `/admin/projects/${projectId}/customFields`;
      const data: any = {
        field: { id: fieldId }
      };

      if (options?.canBeEmpty !== undefined) data.canBeEmpty = options.canBeEmpty;
      if (options?.emptyFieldText) data.emptyFieldText = options.emptyFieldText;

      const response = await this.axios.post(endpoint, data, {
        params: {
          fields: 'field(id,name,fieldType(id,presentation)),canBeEmpty,emptyFieldText,ordinal'
        }
      });
      
      return ResponseFormatter.formatSuccess(
        response.data,
        `Added custom field ${fieldId} to project ${projectId}`
      );
    } catch (error: any) {
      return ResponseFormatter.formatError(`Failed to add custom field to project: ${error.message}`, error);
    }
  }

  /**
   * Remove custom field from project
   */
  async removeCustomFieldFromProject(projectId: string, fieldId: string): Promise<MCPResponse> {
    try {
      const endpoint = `/admin/projects/${projectId}/customFields/${fieldId}`;

      await this.axios.delete(endpoint);
      
      return ResponseFormatter.formatSuccess(
        { projectId, fieldId },
        `Removed custom field ${fieldId} from project ${projectId}`
      );
    } catch (error: any) {
      return ResponseFormatter.formatError(`Failed to remove custom field from project: ${error.message}`, error);
    }
  }

  // ==================== ISSUE CUSTOM FIELD OPERATIONS ====================

  /**
   * Get issue custom fields
   */
  async getIssueCustomFields(issueId: string, fields?: string): Promise<MCPResponse> {
    try {
      const endpoint = `/issues/${issueId}/customFields`;
      const params = {
        fields: fields || 'id,name,value(id,name,presentation,$type),projectCustomField(field(name,fieldType(presentation)))',
        $top: 100
      };

      const response = await this.axios.get(endpoint, { params });
      
      return ResponseFormatter.formatSuccess(
        response.data,
        `Retrieved ${response.data?.length || 0} custom fields for issue ${issueId}`
      );
    } catch (error: any) {
      return ResponseFormatter.formatError(`Failed to get issue custom fields: ${error.message}`, error);
    }
  }

  /**
   * Update issue custom field value
   */
  async updateIssueCustomFieldValue(issueId: string, fieldId: string, value: any): Promise<MCPResponse> {
    try {
      const endpoint = `/issues/${issueId}/customFields/${fieldId}`;
      const data = { value };

      const response = await this.axios.post(endpoint, data, {
        params: {
          fields: 'id,name,value(id,name,presentation,$type)'
        }
      });
      
      return ResponseFormatter.formatSuccess(
        response.data,
        `Updated custom field ${fieldId} for issue ${issueId}`
      );
    } catch (error: any) {
      return ResponseFormatter.formatError(`Failed to update issue custom field: ${error.message}`, error);
    }
  }
}
