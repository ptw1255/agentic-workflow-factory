import { randomUUID } from 'node:crypto';

import type { ConnectionRecord } from '../domain/types.js';
import type { JsonStore } from '../storage/json-store.js';

export interface CreateConnectionInput {
  name: string;
  connector: string;
  environment: string;
  scopes: string[];
}

export class ConnectionService {
  public constructor(private readonly store: JsonStore) {}

  public list(): Promise<ConnectionRecord[]> {
    return this.store.read((state) => state.connections);
  }

  public async create(input: CreateConnectionInput): Promise<ConnectionRecord> {
    const connection: ConnectionRecord = {
      id: randomUUID(),
      ...input,
      status: 'healthy',
      lastCheckedAt: new Date().toISOString(),
      usageCount: 0,
    };
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
