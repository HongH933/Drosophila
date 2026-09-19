import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { atomic, digest } from './integrity.ts';
/** Bounded immutable snapshot chunks. Trust comes only from the caller's attested manifest digest. */
export class T2Snapshot {
    readonly root: string;
    manifest: any;
    #cache = new Map<string, any[]>();
    constructor(root: string, binding: any, anchor?: {
        file: string;
        digest: string;
    }) {
        this.root = root;
        fs.mkdirSync(root, { recursive: true });
        if (anchor) {
            assert.equal(path.resolve(path.dirname(anchor.file)), path.resolve(root));
            this.manifest = JSON.parse(fs.readFileSync(anchor.file, 'utf8'));
            assert.equal(digest(this.manifest), anchor.digest, 'SNAPSHOT_TRUST');
            assert.equal(digest(this.manifest.binding), digest(binding), 'SNAPSHOT_BINDING');
        }
        else
            this.manifest = { schema: 't2-fixed-snapshot-v1', binding, pages: [], slots: [], pageNext: 0, slotNext: 0 };
        for (const kind of ['pages', 'slots']) {
            let i = 0;
            for (const x of this.manifest[kind]) {
                assert.equal(x.first, i);
                assert.ok(x.next > i && x.next - i <= 64);
                assert.match(x.file, /^(pages|slots)-\d+-[a-f0-9]{64}\.json$/);
                i = x.next;
            }
            assert.equal(i, this.manifest[kind === 'pages' ? 'pageNext' : 'slotNext']);
        }
    }
    append(kind: 'pages' | 'slots', first: number, rows: any[]) { const key = kind === 'pages' ? 'pageNext' : 'slotNext'; assert.equal(this.manifest[key], first, 'SNAPSHOT_GAP'); assert.ok(rows.length > 0 && rows.length <= 64); const hash = digest(rows), file = kind + '-' + first + '-' + hash + '.json'; atomic(this.root + '/' + file, rows); this.manifest[kind].push({ first, next: first + rows.length, file, digest: hash }); this.manifest[key] += rows.length; }
    get(kind: 'pages' | 'slots', index: number) {
        const chunks = this.manifest[kind];
        let lo = 0, hi = chunks.length - 1;
        while (lo < hi) {
            const m = (lo + hi) >> 1;
            if (index < chunks[m].next)
                hi = m;
            else
                lo = m + 1;
        }
        const c = chunks[lo];
        assert.ok(c && index >= c.first && index < c.next, 'SNAPSHOT_NOT_FETCHED');
        let rows = this.#cache.get(c.file);
        if (!rows) {
            assert.ok(fs.lstatSync(this.root + '/' + c.file).size <= 2 * 1024 * 1024);
            rows = JSON.parse(fs.readFileSync(this.root + '/' + c.file, 'utf8'));
            assert.equal(digest(rows), c.digest, 'SNAPSHOT_CHUNK_CHANGED');
            assert.equal(rows!.length, c.next - c.first);
            this.#cache.set(c.file, rows!);
            while (this.#cache.size > 4)
                this.#cache.delete(this.#cache.keys().next().value!);
        }
        return rows![index - c.first];
    }
    save() { const hash = digest(this.manifest), file = this.root + '/manifest-' + hash + '.json'; atomic(file, this.manifest); return { file, digest: hash }; }
}
