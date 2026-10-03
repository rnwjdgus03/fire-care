import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import { analyzeMedia } from './gemini.js';
import { supportedEquipmentTypes } from './checklists.js';
import { mailConfigured, sendInspectionMail } from './mailer.js';
import {
  assertBuildingAccess, authenticate, AuthenticationError, AuthorizationError, AuthContext,
  ConflictError, createOrganizationUser, databaseConfigured, databaseQualityMetrics, DatabaseNotConfiguredError,
  deleteEquipment, getBuildingReportData, getChecklistMaster, getWorkspace, listEquipment, listInspections, listSupportedEquipmentTypes, refreshSession,
  registerAdministrator, saveInspection, seedChecklistMasters, signIn, upsertEquipment,
} from './database.js';

const app = express();
const port = Number(process.env.PORT || 4000);
const uploadDir = new URL('../uploads', import.meta.url).pathname;
await mkdir(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_request, file, callback) => callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) });

app.use(cors());
app.use(express.json({ limit: '2mb' }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: '로그인 요청이 너무 많습니다. 15분 후 다시 시도해주세요.' } });

app.get('/health', (_request, response) => response.json({
  ok: true, databaseConfigured, authConfigured: databaseConfigured,
  geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
  mailConfigured: mailConfigured(),
  supportedEquipmentTypes,
}));

app.post('/api/auth/register', authLimiter, async (request, response, next) => {
  try { response.status(201).json(await registerAdministrator(request.body)); } catch (error) { next(error); }
});
app.post('/api/auth/login', authLimiter, async (request, response, next) => {
  try { response.json(await signIn(request.body.email || '', request.body.password || '')); } catch (error) { next(error); }
});
app.post('/api/auth/refresh', async (request, response, next) => {
  try { response.json(await refreshSession(request.body.refreshToken || '')); } catch (error) { next(error); }
});

const requireAuth: express.RequestHandler = async (request, response, next) => {
  try {
    const authorization = request.header('authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    response.locals.auth = await authenticate(token);
    next();
  } catch (error) { next(error); }
};
const authOf = (response: express.Response) => response.locals.auth as AuthContext;
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));

function buildDefaultReportHtml(result: Record<string, any>, inspectorName: string) {
  const details = Array.isArray(result.checklistDetails) ? result.checklistDetails : [];
  const measurements = Array.isArray(result.measurements) ? result.measurements : [];
  const checklistRows = details.length
    ? details.map((item: { sourceItemId?: string; label?: string; status?: string; aiStatus?: string; aiConfidence?: number; userOverrodeAi?: boolean; verificationMode?: string }) => {
      const method = item.verificationMode === 'MANUAL'
        ? '현장 직접 확인'
        : `AI ${item.aiStatus || '미판정'} ${Math.round((item.aiConfidence || 0) * 100)}%${item.userOverrodeAi ? ' → 실무자 수정' : ''}`;
      return `<tr><td>${escapeHtml(item.sourceItemId || '-')}</td><td>${escapeHtml(item.label || '-')}</td><td>${escapeHtml(item.status || '확인 불가')}</td><td>${escapeHtml(method)}</td></tr>`;
    }).join('')
    : '<tr><td colspan="4">점검 항목이 기록되지 않았습니다.</td></tr>';
  const measurementRows = measurements.length
    ? measurements.map((entry: { label?: string; value?: string; unit?: string }) => `<tr><td>${escapeHtml(entry.label || '-')}</td><td>${escapeHtml(entry.value || '미입력')}</td><td>${escapeHtml(entry.unit || '')}</td></tr>`).join('')
    : '<tr><td colspan="3">현장 측정값이 기록되지 않았습니다.</td></tr>';
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" /><title>FIRE CARE 기본 점검 보고서</title></head>
<body style="margin:0;background:#f3f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#17202a;">
  <div style="max-width:760px;margin:0 auto;padding:28px 18px;">
    <div style="background:#2448d8;color:white;border-radius:18px 18px 0 0;padding:22px 24px;">
      <div style="font-size:13px;font-weight:700;opacity:.85;">FIRE CARE 기본 보고서 양식</div>
      <h1 style="margin:8px 0 0;font-size:24px;">시설설비 점검 보조 보고서</h1>
    </div>
    <div style="background:white;border:1px solid #d9e1ef;border-top:0;border-radius:0 0 18px 18px;padding:24px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:22px;font-size:14px;">
        <tr><th style="text-align:left;background:#eef3ff;padding:10px;border:1px solid #d9e1ef;width:140px;">설비 ID</th><td style="padding:10px;border:1px solid #d9e1ef;">${escapeHtml(result.equipmentId || '-')}</td></tr>
        <tr><th style="text-align:left;background:#eef3ff;padding:10px;border:1px solid #d9e1ef;">점검자</th><td style="padding:10px;border:1px solid #d9e1ef;">${escapeHtml(inspectorName || '-')}</td></tr>
        <tr><th style="text-align:left;background:#eef3ff;padding:10px;border:1px solid #d9e1ef;">점검일시</th><td style="padding:10px;border:1px solid #d9e1ef;">${escapeHtml(result.checkedAt || '-')}</td></tr>
        <tr><th style="text-align:left;background:#eef3ff;padding:10px;border:1px solid #d9e1ef;">점검표 기준</th><td style="padding:10px;border:1px solid #d9e1ef;">${escapeHtml(result.legalBasis || '기준 미기록')}</td></tr>
      </table>
      <h2 style="font-size:17px;margin:0 0 10px;">점검표 결과</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:22px;">
        <thead><tr><th style="background:#f8fafc;padding:9px;border:1px solid #d9e1ef;">항목 ID</th><th style="background:#f8fafc;padding:9px;border:1px solid #d9e1ef;">항목</th><th style="background:#f8fafc;padding:9px;border:1px solid #d9e1ef;">최종 결과</th><th style="background:#f8fafc;padding:9px;border:1px solid #d9e1ef;">판정 방식</th></tr></thead>
        <tbody>${checklistRows}</tbody>
      </table>
      <h2 style="font-size:17px;margin:0 0 10px;">현장 측정값</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:22px;">
        <thead><tr><th style="background:#f8fafc;padding:9px;border:1px solid #d9e1ef;">측정 항목</th><th style="background:#f8fafc;padding:9px;border:1px solid #d9e1ef;">값</th><th style="background:#f8fafc;padding:9px;border:1px solid #d9e1ef;">단위</th></tr></thead>
        <tbody>${measurementRows}</tbody>
      </table>
      <h2 style="font-size:17px;margin:0 0 10px;">특이사항</h2>
      <p style="background:#f8fafc;border:1px solid #d9e1ef;border-radius:12px;padding:12px;font-size:14px;line-height:1.55;">${escapeHtml(result.notes || '없음')}</p>
      <p style="margin-top:20px;border-top:1px solid #d9e1ef;padding-top:16px;font-size:13px;font-weight:800;color:#b45309;">${escapeHtml(result.assistanceNotice || 'AI 분석은 점검 보조 정보이며 법정 점검 완료를 의미하지 않습니다.')}</p>
    </div>
  </div>
</body></html>`;
}

function statusCounts(details: Array<{ status?: string }>) {
  return details.reduce((acc, item) => {
    const key = item.status === '정상' || item.status === '이상' || item.status === '직접 확인' || item.status === '해당 없음' ? item.status : item.status === '확인 불가' ? '직접 확인' : '직접 확인';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, { 정상: 0, 이상: 0, '직접 확인': 0, '해당 없음': 0 } as Record<string, number>);
}

function buildBuildingReportHtml(payload: Awaited<ReturnType<typeof getBuildingReportData>>, inspectorName: string) {
  const inspections = payload.inspections as Array<Record<string, any>>;
  const grouped = inspections.reduce((acc, row) => {
    const name = String(row.equipment_name || '미분류 설비');
    const details = Array.isArray(row.checklist_details) ? row.checklist_details : [];
    const counts = statusCounts(details);
    const prev = acc.get(name) || { registered: 0, normal: 0, abnormal: 0, manual: 0, na: 0 };
    prev.registered += 1;
    prev.normal += counts['정상'];
    prev.abnormal += counts['이상'];
    prev.manual += counts['직접 확인'];
    prev.na += counts['해당 없음'];
    acc.set(name, prev);
    return acc;
  }, new Map<string, { registered: number; normal: number; abnormal: number; manual: number; na: number }>());
  const summaryRows = [...grouped.entries()].map(([name, count]) => `<tr><td style="padding:9px;border:1px solid #d9e1ef;">${escapeHtml(name)}</td><td style="padding:9px;border:1px solid #d9e1ef;">${count.registered}</td><td style="padding:9px;border:1px solid #d9e1ef;">${count.normal}</td><td style="padding:9px;border:1px solid #d9e1ef;">${count.abnormal}</td><td style="padding:9px;border:1px solid #d9e1ef;">${count.manual}</td><td style="padding:9px;border:1px solid #d9e1ef;">${count.na}</td></tr>`).join('') || '<tr><td colspan="6" style="padding:9px;border:1px solid #d9e1ef;">저장된 점검 결과가 없습니다.</td></tr>';
  const detailRows = inspections.map((row, index) => {
    const details = Array.isArray(row.checklist_details) ? row.checklist_details : [];
    const counts = statusCounts(details);
    const finalStatus = counts['이상'] > 0 ? '이상' : counts['직접 확인'] > 0 ? '직접 확인' : '정상';
    const photo = Array.isArray(row.inspection_photos) ? row.inspection_photos.find((entry: { dataUri?: string }) => entry.dataUri) : undefined;
    const photoCell = photo?.dataUri
      ? `<img alt="인증사진 ${index + 1}" src="${photo.dataUri}" style="width:112px;height:84px;object-fit:cover;border-radius:10px;border:1px solid #d9e1ef;" />`
      : '<div style="width:112px;height:84px;border-radius:10px;background:#eef3ff;border:1px dashed #9fb2e8;display:flex;align-items:center;justify-content:center;color:#2448d8;font-weight:800;">사진 없음</div>';
    const major = details.slice(0, 3).map((item: { label?: string; status?: string }) => `${item.label || '-'}: ${item.status || '직접 확인'}`).join('<br />') || '점검 항목 미기록';
    return `<tr><td style="padding:8px;border:1px solid #d9e1ef;">${photoCell}</td><td style="padding:8px;border:1px solid #d9e1ef;">${escapeHtml(row.equipment_name || '-')}<br /><span style="color:#64748b;">${escapeHtml(row.equipment_id || '-')}</span></td><td style="padding:8px;border:1px solid #d9e1ef;">${escapeHtml(row.floor || '-')}</td><td style="padding:8px;border:1px solid #d9e1ef;font-weight:800;color:${finalStatus === '이상' ? '#b91c1c' : finalStatus === '직접 확인' ? '#b45309' : '#15803d'};">${escapeHtml(finalStatus)}</td><td style="padding:8px;border:1px solid #d9e1ef;">${major}</td><td style="padding:8px;border:1px solid #d9e1ef;">${escapeHtml(row.notes || '-')}</td></tr>`;
  }).join('') || '<tr><td colspan="6" style="padding:9px;border:1px solid #d9e1ef;">저장된 점검 결과가 없습니다.</td></tr>';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><title>FIRE CARE 건물 점검 보고서</title></head>
<body style="margin:0;background:#f3f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#17202a;">
  <div style="max-width:920px;margin:0 auto;padding:28px 18px;">
    <div style="background:#2448d8;color:white;border-radius:18px 18px 0 0;padding:24px 28px;"><div style="font-size:13px;font-weight:700;opacity:.85;">FIRE CARE 기본 보고서 양식</div><h1 style="margin:8px 0 0;font-size:26px;">건물 시설설비 점검 보조 보고서</h1></div>
    <div style="background:white;border:1px solid #d9e1ef;border-top:0;border-radius:0 0 18px 18px;padding:24px;">
      <h2 style="font-size:17px;margin:0 0 10px;">1. 점검 기본 정보</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:22px;font-size:14px;">
        <tr><th style="text-align:left;background:#eef3ff;padding:10px;border:1px solid #d9e1ef;width:150px;">회사/기관</th><td style="padding:10px;border:1px solid #d9e1ef;">${escapeHtml(payload.building.organization)}</td><th style="text-align:left;background:#eef3ff;padding:10px;border:1px solid #d9e1ef;width:150px;">건물명</th><td style="padding:10px;border:1px solid #d9e1ef;">${escapeHtml(payload.building.name)}</td></tr>
        <tr><th style="text-align:left;background:#eef3ff;padding:10px;border:1px solid #d9e1ef;">보고서 생성자</th><td style="padding:10px;border:1px solid #d9e1ef;">${escapeHtml(inspectorName)}</td><th style="text-align:left;background:#eef3ff;padding:10px;border:1px solid #d9e1ef;">생성일시</th><td style="padding:10px;border:1px solid #d9e1ef;">${escapeHtml(new Date().toISOString())}</td></tr>
      </table>
      <h2 style="font-size:17px;margin:0 0 10px;">2. 설비별 점검 요약</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:22px;"><thead><tr><th style="background:#f8fafc;padding:9px;border:1px solid #d9e1ef;">설비 종류</th><th style="background:#f8fafc;padding:9px;border:1px solid #d9e1ef;">점검 건수</th><th style="background:#f8fafc;padding:9px;border:1px solid #d9e1ef;">정상 항목</th><th style="background:#f8fafc;padding:9px;border:1px solid #d9e1ef;">이상 항목</th><th style="background:#f8fafc;padding:9px;border:1px solid #d9e1ef;">직접 확인 항목</th><th style="background:#f8fafc;padding:9px;border:1px solid #d9e1ef;">해당 없음</th></tr></thead><tbody>${summaryRows}</tbody></table>
      <h2 style="font-size:17px;margin:0 0 10px;">3. 개별 설비 점검 내역</h2>
      <p style="font-size:12px;color:#64748b;line-height:1.6;margin:0 0 10px;">아래 표는 사용자가 저장한 점검 결과 수만큼 자동으로 늘어납니다. 각 행에는 해당 점검의 인증사진이 함께 표시됩니다.</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:22px;"><thead><tr><th style="background:#f8fafc;padding:8px;border:1px solid #d9e1ef;">사진</th><th style="background:#f8fafc;padding:8px;border:1px solid #d9e1ef;">설비</th><th style="background:#f8fafc;padding:8px;border:1px solid #d9e1ef;">위치</th><th style="background:#f8fafc;padding:8px;border:1px solid #d9e1ef;">최종 결과</th><th style="background:#f8fafc;padding:8px;border:1px solid #d9e1ef;">주요 확인 내용</th><th style="background:#f8fafc;padding:8px;border:1px solid #d9e1ef;">비고</th></tr></thead><tbody>${detailRows}</tbody></table>
      <h2 style="font-size:17px;margin:0 0 10px;">4. 확인 및 서명</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:18px;"><tr><th style="background:#f8fafc;padding:10px;border:1px solid #d9e1ef;width:25%;">점검자 서명</th><td style="padding:22px;border:1px solid #d9e1ef;"></td><th style="background:#f8fafc;padding:10px;border:1px solid #d9e1ef;width:25%;">관리자 확인</th><td style="padding:22px;border:1px solid #d9e1ef;"></td></tr></table>
      <p style="margin-top:20px;border-top:1px solid #d9e1ef;padding-top:16px;font-size:13px;font-weight:800;color:#b45309;">AI 분석은 점검 보조 정보이며 법정 자체점검 완료를 의미하지 않습니다. 최종 판단과 법정 점검 책임은 점검자가 수행해야 합니다.</p>
    </div>
  </div>
</body></html>`;
}

app.get('/api/auth/session', requireAuth, async (_request, response, next) => {
  try { response.json({ workspace: await getWorkspace(authOf(response)) }); } catch (error) { next(error); }
});
app.post('/api/auth/users', requireAuth, async (request, response, next) => {
  try { response.status(201).json(await createOrganizationUser(authOf(response), request.body)); } catch (error) { next(error); }
});

app.get('/api/sync/bootstrap', requireAuth, async (_request, response, next) => {
  try {
    const workspace = await getWorkspace(authOf(response));
    const building = workspace.buildings[0];
    response.json({ workspace, buildingId: building?.id ?? null, buildingName: building?.name ?? '', equipment: building ? await listEquipment(building.id) : [] });
  } catch (error) { next(error); }
});

app.get('/api/buildings/:buildingId/equipment', requireAuth, async (request, response, next) => {
  try { const buildingId = String(request.params.buildingId); await assertBuildingAccess(authOf(response), buildingId); response.json(await listEquipment(buildingId)); } catch (error) { next(error); }
});
app.post('/api/buildings/:buildingId/equipment', requireAuth, async (request, response, next) => {
  try { const buildingId = String(request.params.buildingId); await assertBuildingAccess(authOf(response), buildingId, true); response.status(201).json(await upsertEquipment(buildingId, request.body)); } catch (error) { next(error); }
});
app.delete('/api/buildings/:buildingId/equipment/:equipmentId', requireAuth, async (request, response, next) => {
  try { const buildingId = String(request.params.buildingId); await assertBuildingAccess(authOf(response), buildingId, true); await deleteEquipment(buildingId, String(request.params.equipmentId)); response.status(204).end(); } catch (error) { next(error); }
});

app.get('/api/equipment-types', requireAuth, async (_request, response, next) => {
  try { response.json({ equipmentTypes: await listSupportedEquipmentTypes() }); } catch (error) { next(error); }
});

app.get('/api/checklists/:equipmentType', requireAuth, async (request, response, next) => {
  try { response.json(await getChecklistMaster(String(request.params.equipmentType))); } catch (error) { next(error); }
});

app.post('/api/analyze', requireAuth, upload.single('media'), async (request, response, next) => {
  try {
    if (!request.file) return response.status(400).json({ message: '분석할 JPG, PNG 또는 WEBP 사진이 필요합니다.' });
    if (!request.body.equipmentType) return response.status(400).json({ message: '선택한 설비 종류가 필요합니다.' });
    return response.json(await analyzeMedia(request.file.path, request.file.mimetype, request.body.equipmentType));
  } catch (error) { return next(error); }
  finally { if (request.file) await unlink(request.file.path).catch(() => undefined); }
});

app.post('/api/inspections', requireAuth, upload.single('media'), async (request, response, next) => {
  try {
    const result = JSON.parse(request.body.result || '{}');
    if (result.aiEquipmentMatch !== true) return response.status(400).json({ message: '선택 설비와 사진 설비의 일치 확인이 필요합니다.' });
    if (Object.values(result.checklist ?? {}).includes('확인 불가')) return response.status(400).json({ message: '직접 확인하지 않은 점검항목이 남아 있습니다.' });
    const details = Array.isArray(result.checklistDetails) ? result.checklistDetails : [];
    const comparable = details.filter((item: { verificationMode?: string; aiStatus?: string; status?: string }) => item.verificationMode === 'PHOTO' && item.aiStatus && item.aiStatus !== '확인 불가' && item.status !== '해당 없음');
    const agreedCount = comparable.filter((item: { aiStatus: string; status: string }) => item.aiStatus === item.status).length;
    result.aiValidation = { comparedCount: comparable.length, agreedCount, overriddenCount: comparable.length - agreedCount, agreementRate: comparable.length ? agreedCount / comparable.length : null };
    const photo = request.file ? { buffer: await readFile(request.file.path), mimeType: request.file.mimetype, originalName: request.file.originalname } : undefined;
    const record = await saveInspection(result, authOf(response), photo);
    return response.status(201).json({ saved: true, persistent: true, record });
  } catch (error) { return next(error); }
  finally { if (request.file) await unlink(request.file.path).catch(() => undefined); }
});

app.get('/api/inspections', requireAuth, async (request, response, next) => {
  try {
    const buildingId = String(request.query.buildingId || '');
    if (!buildingId) return response.status(400).json({ message: 'buildingId가 필요합니다.' });
    await assertBuildingAccess(authOf(response), buildingId);
    return response.json(await listInspections(buildingId));
  } catch (error) { return next(error); }
});

app.get('/api/quality/metrics', requireAuth, async (request, response, next) => {
  try {
    const buildingId = String(request.query.buildingId || '');
    if (!buildingId) return response.status(400).json({ message: 'buildingId가 필요합니다.' });
    await assertBuildingAccess(authOf(response), buildingId);
    return response.json(await databaseQualityMetrics(buildingId));
  } catch (error) { return next(error); }
});

app.post('/api/reports/send', requireAuth, upload.array('attachments', 3), async (request, response, next) => {
  const files = request.files as Express.Multer.File[] | undefined;
  try {
    const recipient = request.body.recipient;
    const result = JSON.parse(request.body.result || '{}');
    if (!recipient || !result) return response.status(400).json({ message: 'recipient와 result가 필요합니다.' });
    const html = buildDefaultReportHtml(result, authOf(response).name);
    const attachments = files?.length ? await Promise.all(files.map(async (file) => ({ filename: file.originalname, content: await readFile(file.path), contentType: file.mimetype }))) : undefined;
    return response.json({ sent: true, mail: await sendInspectionMail({ recipient, subject: `[FIRE CARE] ${result.equipmentId} 점검 보고서`, html, attachments }) });
  } catch (error) { return next(error); }
  finally { if (files) await Promise.all(files.map((file) => unlink(file.path).catch(() => undefined))); }
});

app.post('/api/reports/building/send', requireAuth, upload.array('attachments', 1), async (request, response, next) => {
  const files = request.files as Express.Multer.File[] | undefined;
  try {
    const recipient = request.body.recipient;
    const buildingId = String(request.body.buildingId || '');
    if (!recipient || !buildingId) return response.status(400).json({ message: 'recipient와 buildingId가 필요합니다.' });
    const reportData = await getBuildingReportData(buildingId, authOf(response));
    const html = buildBuildingReportHtml(reportData, authOf(response).name);
    const attachments = files?.length ? await Promise.all(files.map(async (file) => ({ filename: file.originalname, content: await readFile(file.path), contentType: file.mimetype }))) : undefined;
    return response.json({ sent: true, mail: await sendInspectionMail({ recipient, subject: `[FIRE CARE] ${reportData.building.name} 건물 점검 보고서`, html, attachments }) });
  } catch (error) { return next(error); }
  finally { if (files) await Promise.all(files.map((file) => unlink(file.path).catch(() => undefined))); }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (!(error instanceof DatabaseNotConfiguredError) && !(error instanceof AuthenticationError) && !(error instanceof AuthorizationError) && !(error instanceof ConflictError)) console.error(error);
  const status = error instanceof DatabaseNotConfiguredError ? 503 : error instanceof AuthenticationError ? 401 : error instanceof AuthorizationError ? 403 : error instanceof ConflictError ? 409 : 500;
  response.status(status).json({ message: error instanceof Error ? error.message : '서버 오류가 발생했습니다.' });
});

try {
  const seeded = await seedChecklistMasters();
  if (seeded.seeded) console.log(`Seeded ${seeded.count} equipment checklist masters into local PostgreSQL.`);
} catch (error) {
  console.error(error);
}

app.listen(port, '0.0.0.0', () => console.log(`FIRE CARE API listening on http://0.0.0.0:${port}`));
