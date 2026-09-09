import { randomUUID } from 'node:crypto';

import type { ConnectionRecord } from '../domain/types.js';
import type { PlatformStore } from '../storage/store.js';
import type { SecretBroker } from './secret-broker.js';

export interface CreateConnectionInput {
  name: string;
  connector: string;
  environment: string;
  scopes: string[];
  secret?: string;
}

export class ConnectionService {
  public constructor(
    private readonly store: PlatformStore,
    private readonly secrets?: SecretBroker,
  ) {}

  public list(): Promise<ConnectionRecord[]> {
    return this.store.read((state) => state.connections);
  }

  public async create(input: CreateConnectionInput): Promise<ConnectionRecord> {
    const connectionId = randomUUID();
    const connection: ConnectionRecord = {
      id: connectionId,
      name: input.name,
      connector: input.connector,
      environment: input.environment,
      scopes: input.scopes,
      status: 'healthy',
      lastCheckedAt: new Date().toISOString(),
      usageCount: 0,
      secretConfigured: input.secret !== undefined,
      ...(input.secret === undefined ? {} : { secretRef: `connections/${connectionId}` }),
    };
    if (input.secret !== undefined && this.secrets === undefined) {
      throw new Error('A configured Vault secret broker is required to store credentials.');
    }
    await this.store.mutate((state) => {
      const duplicate = state.connections.some(
        (candidate) =>
          candidate.name.toLowerCase() === connection.name.toLowerCase() &&
          candidate.environment === connection.environment,
      );
      if (duplicate) {
        throw new Error(
          `Connection "${connection.name}" already exists in ${connection.environment}.`,
        );
      }
      if (input.secret !== undefined && connection.secretRef !== undefined) {
        return this.secrets!.put(connection.secretRef, input.secret).then(() => {
          state.connections.push(connection);
        });
      }
      state.connections.push(connection);
    });
    return connection;
  }

  public async check(connectionId: string): Promise<ConnectionRecord> {
    return this.store.mutate((state) => {
      const connection = state.connections.find(
        (candidate) => candidate.id === connectionId,
      );
      if (connection === undefined) {
        throw new Error('Connection not found.');
      }
      connection.status = 'healthy';
      connection.lastCheckedAt = new Date().toISOString();
      return connection;
    });
  }
}
