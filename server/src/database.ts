import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { getOfficialChecklist, OfficialChecklist, supportedEquipmentTypes } from './checklists.js';

const { Pool } = pg;

export type DatabaseRole = 'worker' | 'admin';
export type AuthContext = {
  userId: string;
  organizationId: string;
  role: DatabaseRole;
  email: string;
  name: string;
};

export type SyncedEquipment = {
  id: string;
  name: string;
  floor: string;
  count: number;
  status: '정상' | '점검 예정' | '이상';
  dueDate: string;
};

type InspectionInput = Record<string, unknown> & {
  equipmentId: string;
  checkedAt: string;
  checklist?: unknown;
  checklistDetails?: unknown;
  measurements?: unknown;
  legalBasis?: string;
  aiEquipmentMatch?: boolean;
  aiSummary?: string;
  aiPhotoQuality?: unknown;
  aiThresholds?: unknown;
  aiValidation?: unknown;
  assistanceNotice?: string;
  notes?: string;
};

type JwtPayload = {
  sub: string;
  organizationId: string;
  role: DatabaseRole;
  email: string;
  name: string;
};

type Queryable = pg.Pool | pg.PoolClient;

export class DatabaseNotConfiguredError extends Error {}
export class AuthenticationError extends Error {}
export class AuthorizationError extends Error {}
export class ConflictError extends Error {}

const databaseUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;
export const databaseConfigured = Boolean(databaseUrl && jwtSecret);

const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : undefined;
const uploadsRoot = process.env.LOCAL_UPLOAD_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', 'uploads', 'inspection-photos');

function db() {
  if (!pool) throw new DatabaseNotConfiguredError('로컬 PostgreSQL 설정이 필요합니다. DATABASE_URL과 JWT_SECRET을 확인해주세요.');
  if (!jwtSecret) throw new DatabaseNotConfiguredError('JWT_SECRET 설정이 필요합니다.');
  return pool;
}

function cleanEmail(value: string) {
  return value.trim().toLowerCase();
}

function validatePassword(password: string) {
  if (password.length < 8) throw new Error('비밀번호는 8자 이상으로 입력해주세요.');
}

function isUniqueEmailError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string; constraint?: string }).code === '23505' && (error as { constraint?: string }).constraint === 'app_users_email_key';
}

function tokenFor(context: AuthContext) {
  if (!jwtSecret) throw new DatabaseNotConfiguredError('JWT_SECRET 설정이 필요합니다.');
  const payload: JwtPayload = { sub: context.userId, organizationId: context.organizationId, role: context.role, email: context.email, name: context.name };
  const accessToken = jwt.sign(payload, jwtSecret, { expiresIn: '12h' });
  const refreshToken = jwt.sign({ ...payload, refresh: true }, jwtSecret, { expiresIn: '30d' });
  return { accessToken, refreshToken, expiresAt: Math.floor(Date.now() / 1000) + 12 * 60 * 60 };
}

async function workspaceForUser(userId: string, query: Queryable = db()) {
  const userResult = await query.query(
    `select u.id, u.organization_id, u.email, u.display_name, u.role, o.name as organization
     from app_users u join organizations o on o.id = u.organization_id
     where u.id = $1`,
    [userId],
  );
  const user = userResult.rows[0];
  if (!user) throw new AuthenticationError('사용자 정보를 찾을 수 없습니다.');
  const buildingsResult = await query.query('select id, name from buildings where organization_id = $1 order by created_at', [user.organization_id]);
  const context: AuthContext = {
    userId: user.id,
    organizationId: user.organization_id,
    role: user.role,
    email: user.email,
    name: user.display_name,
  };
  return { context, organization: user.organization as string, buildings: buildingsResult.rows };
}

export async function registerAdministrator(input: { email: string; password: string; name: string; phone?: string; organization: string; building: string }) {
  const email = cleanEmail(input.email);
  validatePassword(input.password);
  if (!email || !input.name.trim() || !input.organization.trim() || !input.building.trim()) throw new Error('이메일, 이름, 회사, 건물은 필수입니다.');
  const client = await db().connect();
  try {
    await client.query('begin');
    const organization = await client.query('insert into organizations (name) values ($1) returning id', [input.organization.trim()]);
    const organizationId = organization.rows[0].id;
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await client.query(
      `insert into app_users (organization_id, email, password_hash, display_name, phone, role)
       values ($1, $2, $3, $4, $5, 'admin')
       returning id`,
      [organizationId, email, passwordHash, input.name.trim(), input.phone?.trim() || ''],
    );
    await client.query('insert into buildings (organization_id, name) values ($1, $2)', [organizationId, input.building.trim()]);
    await client.query('commit');
    return await signIn(email, input.password);
  } catch (error) {
    await client.query('rollback');
    if (isUniqueEmailError(error)) throw new ConflictError('이미 가입된 이메일입니다. 기존 계정으로 로그인해주세요.');
    throw error;
  } finally {
    client.release();
  }
}

export async function signIn(emailInput: string, password: string) {
  const email = cleanEmail(emailInput);
  if (!email || !password) throw new AuthenticationError('이메일과 비밀번호를 입력해주세요.');
  const result = await db().query('select id, password_hash from app_users where email = $1', [email]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) throw new AuthenticationError('이메일 또는 비밀번호가 올바르지 않습니다.');
  const workspace = await workspaceForUser(user.id);
  return { ...tokenFor(workspace.context), workspace };
}

export async function refreshSession(refreshToken: string) {
  try {
    if (!jwtSecret) throw new DatabaseNotConfiguredError('JWT_SECRET 설정이 필요합니다.');
    const payload = jwt.verify(refreshToken, jwtSecret) as JwtPayload & { refresh?: boolean };
    if (!payload.refresh) throw new Error('not refresh');
    const workspace = await workspaceForUser(payload.sub);
    return { ...tokenFor(workspace.context), workspace };
  } catch {
    throw new AuthenticationError('로그인이 만료되었습니다. 다시 로그인해주세요.');
  }
}

export async function authenticate(accessToken: string) {
  try {
    if (!accessToken) throw new AuthenticationError('로그인이 필요합니다.');
    if (!jwtSecret) throw new DatabaseNotConfiguredError('JWT_SECRET 설정이 필요합니다.');
    const payload = jwt.verify(accessToken, jwtSecret) as JwtPayload;
    return (await workspaceForUser(payload.sub)).context;
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) throw error;
    throw new AuthenticationError('로그인 정보가 유효하지 않습니다.');
  }
}

export async function getWorkspace(context: AuthContext) {
  return workspaceForUser(context.userId);
}

export function requireAdmin(context: AuthContext) {
  if (context.role !== 'admin') throw new AuthorizationError('관리자만 수행할 수 있습니다.');
}

export async function createOrganizationUser(context: AuthContext, input: { email: string; password: string; name: string; phone?: string; role?: DatabaseRole }) {
  requireAdmin(context);
  validatePassword(input.password);
  const email = cleanEmail(input.email);
  const role: DatabaseRole = input.role === 'admin' ? 'admin' : 'worker';
  const passwordHash = await bcrypt.hash(input.password, 12);
  try {
    const result = await db().query(
      `insert into app_users (organization_id, email, password_hash, display_name, phone, role)
       values ($1, $2, $3, $4, $5, $6)
       returning id, email, display_name as name, role`,
      [context.organizationId, email, passwordHash, input.name.trim(), input.phone?.trim() || '', role],
    );
    return result.rows[0];
  } catch (error) {
    if (isUniqueEmailError(error)) throw new ConflictError('이미 가입된 이메일입니다. 다른 이메일을 사용하거나 기존 계정으로 로그인해주세요.');
    throw error;
  }
}

export async function assertBuildingAccess(context: AuthContext, buildingId: string, adminOnly = false) {
  if (adminOnly) requireAdmin(context);
  const result = await db().query('select id from buildings where id = $1 and organization_id = $2', [buildingId, context.organizationId]);
  if (!result.rows.length) throw new AuthorizationError('이 회사의 건물 데이터가 아니거나 접근 권한이 없습니다.');
}

function mapEquipment(row: Record<string, unknown>): SyncedEquipment {
  return {
    id: String(row.id),
    name: String(row.name),
    floor: row.floor ? String(row.floor) : '',
    count: Number(row.count),
    status: row.status as SyncedEquipment['status'],
    dueDate: row.due_date ? String(row.due_date).slice(0, 10) : '미설정',
  };
}

export async function listEquipment(buildingId: string) {
  const result = await db().query(
    `select e.id, e.name, e.count, e.status, e.due_date, f.name as floor
     from equipment e join floors f on f.id = e.floor_id
     where e.building_id = $1
     order by e.created_at`,
    [buildingId],
  );
  return result.rows.map(mapEquipment);
}

type ChecklistMasterRow = {
  requested_type: string;
  key: string;
  official_type: string;
  detection_hints: string[];
  classification_notice: string | null;
  assistance_notice: string | null;
  legal_basis: OfficialChecklist['legalBasis'];
  checklist_items: OfficialChecklist['items'];
};

function mapChecklistMaster(row: ChecklistMasterRow): OfficialChecklist {
  return {
    key: row.key,
    requestedEquipmentType: row.requested_type,
    officialEquipmentType: row.official_type,
    detectionHints: row.detection_hints,
    classificationNotice: row.classification_notice || undefined,
    assistanceNotice: row.assistance_notice || undefined,
    legalBasis: row.legal_basis,
    items: row.checklist_items,
  };
}

export async function seedChecklistMasters() {
  if (!databaseConfigured) return { seeded: false, count: 0 };
  for (const type of supportedEquipmentTypes) {
    const checklist = getOfficialChecklist(type);
    await db().query(
      `insert into equipment_type_masters
       (requested_type, key, official_type, detection_hints, classification_notice, assistance_notice, legal_basis, checklist_items, active, verified_at, updated_at)
       values ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, $8::jsonb, true, $9, now())
       on conflict (requested_type) do update set
       key = excluded.key, official_type = excluded.official_type, detection_hints = excluded.detection_hints,
       classification_notice = excluded.classification_notice, assistance_notice = excluded.assistance_notice,
       legal_basis = excluded.legal_basis, checklist_items = excluded.checklist_items, active = true,
       verified_at = excluded.verified_at, updated_at = now()`,
      [
        checklist.requestedEquipmentType,
        checklist.key,
        checklist.officialEquipmentType,
        JSON.stringify(checklist.detectionHints),
        checklist.classificationNotice ?? null,
        checklist.assistanceNotice ?? null,
        JSON.stringify(checklist.legalBasis),
        JSON.stringify(checklist.items),
        checklist.legalBasis.verifiedAt,
      ],
    );
  }
  return { seeded: true, count: supportedEquipmentTypes.length };
}

export async function listSupportedEquipmentTypes() {
  const result = await db().query('select requested_type from equipment_type_masters where active = true order by requested_type');
  return result.rows.map((row) => String(row.requested_type));
}

export async function getChecklistMaster(equipmentType: string): Promise<OfficialChecklist> {
  const normalized = equipmentType.trim();
  const result = await db().query(
    `select requested_type, key, official_type, detection_hints, classification_notice, assistance_notice, legal_basis, checklist_items
     from equipment_type_masters
     where requested_type = $1 and active = true`,
    [normalized],
  );
  if (!result.rows[0]) throw new Error(`DB에 등록되지 않은 설비 종류입니다: ${normalized || '(없음)'}`);
  return mapChecklistMaster(result.rows[0] as ChecklistMasterRow);
}

export async function upsertEquipment(buildingId: string, equipment: SyncedEquipment) {
  const floorName = equipment.floor.trim();
  if (!floorName) throw new Error('층/구역을 입력해주세요.');
  const client = await db().connect();
  try {
    await client.query('begin');
    const floorResult = await client.query(
      `insert into floors (building_id, name) values ($1, $2)
       on conflict (building_id, name) do update set name = excluded.name
       returning id`,
      [buildingId, floorName],
    );
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(equipment.dueDate) ? equipment.dueDate : null;
    const result = await client.query(
      `insert into equipment (id, building_id, floor_id, name, count, status, due_date, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict (id) do update set
       floor_id = excluded.floor_id, name = excluded.name, count = excluded.count, status = excluded.status,
       due_date = excluded.due_date, updated_at = now()
       returning id, name, count, status, due_date`,
      [equipment.id, buildingId, floorResult.rows[0].id, equipment.name, equipment.count, equipment.status, dueDate],
    );
    await client.query('commit');
    return mapEquipment({ ...result.rows[0], floor: floorName });
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteEquipment(buildingId: string, equipmentId: string) {
  await db().query('delete from equipment where building_id = $1 and id = $2', [buildingId, equipmentId]);
}

export async function saveInspection(input: InspectionInput, context: AuthContext, photo?: { buffer: Buffer; mimeType: string; originalName: string }) {
  const equipmentResult = await db().query('select building_id from equipment where id = $1', [input.equipmentId]);
  const equipment = equipmentResult.rows[0];
  if (!equipment) throw new Error('점검 설비를 찾을 수 없습니다.');
  await assertBuildingAccess(context, equipment.building_id);
  const inspectionResult = await db().query(
    `insert into inspections
     (building_id, equipment_id, inspector_id, inspector_name, checked_at, checklist, checklist_details, measurements,
      legal_basis, ai_equipment_match, ai_summary, ai_photo_quality, ai_thresholds, ai_validation, assistance_notice, notes)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15, $16)
     returning *`,
    [
      equipment.building_id,
      input.equipmentId,
      context.userId,
      context.name,
      input.checkedAt,
      JSON.stringify(input.checklist ?? {}),
      JSON.stringify(input.checklistDetails ?? []),
      JSON.stringify(input.measurements ?? []),
      input.legalBasis ?? null,
      input.aiEquipmentMatch ?? null,
      input.aiSummary ?? null,
      JSON.stringify(input.aiPhotoQuality ?? null),
      JSON.stringify(input.aiThresholds ?? null),
      JSON.stringify(input.aiValidation ?? null),
      input.assistanceNotice ?? null,
      input.notes ?? '',
    ],
  );
  const inspection = inspectionResult.rows[0];
  if (photo) {
    const extension = photo.mimeType === 'image/png' ? 'png' : photo.mimeType === 'image/webp' ? 'webp' : 'jpg';
    const filePath = join(uploadsRoot, context.organizationId, equipment.building_id, input.equipmentId, `${inspection.id}.${extension}`);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, photo.buffer);
    await db().query(
      `insert into inspection_photos (inspection_id, file_path, mime_type, original_name, size_bytes)
       values ($1, $2, $3, $4, $5)`,
      [inspection.id, filePath, photo.mimeType, photo.originalName, photo.buffer.byteLength],
    );
  }
  return inspection;
}

export async function listInspections(buildingId: string) {
  const result = await db().query(
    `select i.*, coalesce(json_agg(p.*) filter (where p.id is not null), '[]') as inspection_photos
     from inspections i
     left join inspection_photos p on p.inspection_id = i.id
     where i.building_id = $1
     group by i.id
     order by i.checked_at desc`,
    [buildingId],
  );
  return result.rows;
}

export async function getBuildingReportData(buildingId: string, context: AuthContext) {
  await assertBuildingAccess(context, buildingId);
  const buildingResult = await db().query(
    `select b.id, b.name, o.name as organization
     from buildings b join organizations o on o.id = b.organization_id
     where b.id = $1 and b.organization_id = $2`,
    [buildingId, context.organizationId],
  );
  const building = buildingResult.rows[0];
  if (!building) throw new AuthorizationError('이 회사의 건물 데이터가 아니거나 접근 권한이 없습니다.');
  const result = await db().query(
    `select i.*, e.name as equipment_name, e.count as equipment_count, e.status as equipment_status, e.due_date, f.name as floor,
            coalesce(json_agg(p.*) filter (where p.id is not null), '[]') as inspection_photos
     from inspections i
     join equipment e on e.id = i.equipment_id
     join floors f on f.id = e.floor_id
     left join inspection_photos p on p.inspection_id = i.id
     where i.building_id = $1
     group by i.id, e.name, e.count, e.status, e.due_date, f.name
     order by f.name, e.name, i.checked_at desc`,
    [buildingId],
  );
  const inspections = await Promise.all(result.rows.map(async (row) => {
    const photos = await Promise.all((row.inspection_photos as Array<{ file_path?: string; mime_type?: string; original_name?: string }>).map(async (photo) => {
      if (!photo.file_path || !photo.mime_type?.startsWith('image/')) return { ...photo, dataUri: undefined };
      try {
        const buffer = await readFile(photo.file_path);
        return { ...photo, dataUri: `data:${photo.mime_type};base64,${buffer.toString('base64')}` };
      } catch {
        return { ...photo, dataUri: undefined };
      }
    }));
    return { ...row, inspection_photos: photos };
  }));
  return { building, inspections };
}

export async function databaseQualityMetrics(buildingId: string) {
  const result = await db().query('select ai_validation from inspections where building_id = $1', [buildingId]);
  const totals = result.rows.reduce((acc, row) => {
    const metric = row.ai_validation as { comparedCount?: number; agreedCount?: number; overriddenCount?: number } | null;
    acc.comparedItems += metric?.comparedCount ?? 0;
    acc.agreedItems += metric?.agreedCount ?? 0;
    acc.overriddenItems += metric?.overriddenCount ?? 0;
    return acc;
  }, { comparedItems: 0, agreedItems: 0, overriddenItems: 0 });
  return { inspections: result.rows.length, ...totals, agreementRate: totals.comparedItems ? totals.agreedItems / totals.comparedItems : null };
}
