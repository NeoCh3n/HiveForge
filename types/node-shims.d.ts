// Minimal Node typings so `tsc -p tsconfig.json` works without installing `@types/node`.

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  cwd(): string;
  exit(code?: number): never;
  execPath: string;
  on(event: string, listener: (...args: any[]) => void): any;
};

declare module "node:crypto" {
  export function randomUUID(): string;
}

declare module "node:child_process" {
  export const spawn: any;
}

declare module "node:test" {
  export const test: any;
  export const describe: any;
  export const it: any;
  export const before: any;
  export const after: any;
  export const beforeEach: any;
  export const afterEach: any;
}

declare module "node:assert/strict" {
  const assert: any;
  export default assert;
}

declare module "node:path" {
  export const basename: any;
  export const dirname: any;
  export const join: any;
  export const resolve: any;
}

declare module "node:fs/promises" {
  export const access: any;
  export const appendFile: any;
  export const mkdir: any;
  export const readFile: any;
  export const readdir: any;
  export const rename: any;
  export const rm: any;
  export const stat: any;
  export const writeFile: any;
}
