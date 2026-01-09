import type { Database } from 'sqlite3';

interface DatabasePool {
  acquire(): Promise<{ db: Database }>;
  release(db: Database): void;
  startCleanup(): void;
}

interface DatabaseConnection {
  run(sql: string, params?: any[], callback?: (this: DatabaseConnection, err: Error | null, row?: any) => void): DatabaseConnection;
  get(sql: string, params?: any[], callback?: (this: DatabaseConnection, err: Error | null, row?: any) => void): DatabaseConnection;
  all(sql: string, params?: any[], callback?: (this: DatabaseConnection, err: Error | null, rows?: any[]) => void): DatabaseConnection;
  close(callback?: (err: Error | null) => void): void;
}

declare global {
  namespace NodeJS {
    interface Global {
      db: DatabaseConnection | null;
      dbPool: DatabasePool | null;
      [key: string]: any;
    }
  }

  var db: DatabaseConnection | null;
  var dbPool: DatabasePool | null;
}

declare module 'uuid' {
  export function v4(): string;
}

export {};
