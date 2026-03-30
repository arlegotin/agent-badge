declare module "better-sqlite3" {
  export interface DatabaseOptions {
    readonly?: boolean;
    fileMustExist?: boolean;
  }

  export interface Statement<Result = unknown> {
    all(...params: unknown[]): Result[];
  }

  export default class Database {
    constructor(filename: string, options?: DatabaseOptions);
    prepare<Result = unknown>(sql: string): Statement<Result>;
    exec(sql: string): this;
    close(): void;
  }
}
