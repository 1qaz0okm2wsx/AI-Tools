// 全局类型声明文件
declare global {
  namespace NodeJS {
    interface Global {
      db: any;
      dbPool: any;
      [key: string]: any;
    }
  }

  var db: any;
  var dbPool: any;
}

// UUID 模块类型声明
declare module 'uuid' {
  export function v4(): string;
}

export {};
