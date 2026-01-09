// 全局类型声明文件
declare global {
  namespace NodeJS {
    interface Global {
      db: any;
      dbPool: any;
    }
  }
}

export {};
