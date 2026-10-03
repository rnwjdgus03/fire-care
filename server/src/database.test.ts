import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('로컬 PostgreSQL 스키마에 회사 격리·인증·동기화 테이블이 포함된다', async () => {
  const sql = await readFile(resolve(process.cwd(), 'sql/local_postgres_schema.sql'), 'utf8');
  for (const table of ['organizations', 'app_users', 'buildings', 'floors', 'equipment_type_masters', 'equipment', 'inspections', 'inspection_photos']) {
    assert.match(sql, new RegExp(`create table if not exists ${table}`));
  }
  assert.match(sql, /password_hash text not null/);
  assert.match(sql, /role text not null check \(role in \('worker', 'admin'\)\)/);
  assert.match(sql, /checklist_items jsonb not null default '\[\]'::jsonb/);
  assert.match(sql, /legal_basis jsonb not null/);
  assert.match(sql, /organization_id uuid not null references organizations\(id\)/);
});

test('점검 결과와 사진은 설비·건물 삭제 규칙으로 보호된다', async () => {
  const sql = await readFile(resolve(process.cwd(), 'sql/local_postgres_schema.sql'), 'utf8');
  assert.match(sql, /equipment_id text not null references equipment\(id\) on delete restrict/);
  assert.match(sql, /inspection_id uuid not null references inspections\(id\) on delete cascade/);
  assert.match(sql, /measurements jsonb not null/);
  assert.match(sql, /file_path text not null unique/);
});
