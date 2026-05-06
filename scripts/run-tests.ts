import { readdir } from 'node:fs/promises';
import path from 'node:path';

async function getTestFiles(rootDir: string): Promise<string[]> {
    const entries = await readdir(rootDir, { withFileTypes: true });
    const files = await Promise.all(entries.map(async entry => {
        const fullPath = path.join(rootDir, entry.name);

        if (entry.isDirectory()) {
            return await getTestFiles(fullPath);
        }

        if (entry.isFile() && entry.name.endsWith('.test.ts')) {
            return [fullPath];
        }

        return [];
    }));

    return files.flat().sort();
}

async function main(): Promise<void> {
    const cwd = process.cwd();
    const testsRoot = path.join(cwd, 'src', '__tests__');
    const testFiles = await getTestFiles(testsRoot);

    for (const testFile of testFiles) {
        const child = Bun.spawn(['bun', 'test', '--isolate', testFile], {
            cwd,
            stdin: 'inherit',
            stdout: 'inherit',
            stderr: 'inherit'
        });

        const exitCode = await child.exited;
        if (exitCode !== 0) {
            process.exit(exitCode);
        }
    }
}

await main();