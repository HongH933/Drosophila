import fs from 'node:fs';
import {flush} from './integrity.ts';
import path from 'node:path';
import type { PackedMicroRuntime } from './packed-micro.ts';

type Anchor = { digest: string; stateDigest: string; directory?: string };

/** Only a signed report selects a generation; an orphan directory is never recovery progress. */
export function localCheckpointPath(root: string, anchor: Anchor) {
    if (anchor.directory === undefined) return root; // Existing signed legacy checkpoint.
    if (!/^generation-[a-zA-Z0-9]{6}$/.test(anchor.directory)) throw Error('CHECKPOINT_DIRECTORY');
    const dir = path.join(root, anchor.directory);
    if (fs.lstatSync(dir).isSymbolicLink()) throw Error('CHECKPOINT_DIRECTORY');
    return dir;
}

export function saveLocalCheckpoint(runtime: Pick<PackedMicroRuntime, 'save'>, root: string) {
    fs.mkdirSync(root, { recursive: true });
    const dir = fs.mkdtempSync(path.join(root, 'generation-'));
    // Do not delete prior generations or incomplete writes after failure.
    const checkpoint = runtime.save(dir);
    for (const name of fs.readdirSync(dir)) {
        const fd = fs.openSync(path.join(dir, name), 'r');
        try { flush(fd); } finally { fs.closeSync(fd); }
    }
    for (const target of [dir, root]) {
        const fd = fs.openSync(target, 'r');
        try { flush(fd); } finally { fs.closeSync(fd); }
    }
    return { ...checkpoint, directory: path.basename(dir) };
}
