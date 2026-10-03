import { cp, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { analyzeMedia } from './gemini.js';

const root = process.argv[2];
if (!root) {
  console.error('사용법: npm run eval:vision -- /절대경로/평가사진폴더');
  process.exit(1);
}

const expectedFor = (caseName: string) => ({
  qualityAccepted: !['dark', 'blurred', 'far', 'cropped'].includes(caseName),
  equipmentMatch: !['dark', 'blurred', 'far', 'cropped', 'wrong-equipment'].includes(caseName),
});

const rows: Array<{ equipment: string; caseName: string; file: string; qualityPass: boolean; matchPass: boolean }> = [];
const tempRoot = await mkdtemp(join(tmpdir(), 'fire-care-eval-'));

try {
  for (const equipment of await readdir(root)) {
    const equipmentPath = join(root, equipment);
    if (!(await stat(equipmentPath)).isDirectory()) continue;
    for (const caseName of await readdir(equipmentPath)) {
      const casePath = join(equipmentPath, caseName);
      if (!(await stat(casePath)).isDirectory()) continue;
      for (const file of await readdir(casePath)) {
        if (!/\.(jpe?g|png|webp)$/i.test(file)) continue;
        const source = join(casePath, file);
        const copy = join(tempRoot, `${Date.now()}-${file}`);
        await cp(source, copy);
        const analysis = await analyzeMedia(copy, file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg', equipment);
        const expected = expectedFor(caseName);
        rows.push({ equipment, caseName, file: basename(file), qualityPass: analysis.photoQuality.acceptable === expected.qualityAccepted, matchPass: analysis.equipmentMatch === expected.equipmentMatch });
      }
    }
  }
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

const passed = rows.filter((row) => row.qualityPass && row.matchPass).length;
console.table(rows);
console.log(`평가 결과: ${passed}/${rows.length} 통과 (${rows.length ? Math.round((passed / rows.length) * 100) : 0}%)`);
if (!rows.length || passed !== rows.length) process.exitCode = 1;
