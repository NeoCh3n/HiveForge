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
