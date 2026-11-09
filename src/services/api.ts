import { AuthTokens, Equipment, InspectionResult, RegistrationInput } from '../types';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export type WorkspacePayload = {
  context: { userId: string; organizationId: string; role: 'worker' | 'admin'; email: string; name: string };
  organization: string;
  buildings: Array<{ id: string; name: string }>;
};
export type AuthResponse = AuthTokens & { workspace: WorkspacePayload };

async function blobPart(uri: string, fallbackType = 'image/jpeg') {
  const fetched = await fetch(uri).then((response) => response.blob());
  const extension = uri.split('?')[0].split('.').pop()?.toLowerCase();
  const type = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : fallbackType;
  return { blob: new Blob([fetched], { type }), extension: extension === 'png' || extension === 'webp' ? extension : 'jpg' };
}

export type AnalysisResponse = {
  detectedEquipmentType: string; officialEquipmentType: string; equipmentMatch: boolean; matchConfidence: number; mismatchReason: string;
  summary: string; detectedIssues: string[]; riskLevel: '정상' | '주의' | '위험';
  photoQuality: { acceptable: boolean; brightness: '적정' | '너무 어두움' | '너무 밝음'; sharpness: '적정' | '흐림'; coverage: '적정' | '너무 몂'; issues: string[]; retakeGuidance: string };
  qualityThresholds: { equipmentMatch: number; itemJudgement: number; evidenceRequired: true };
  checklist: Array<{ id: string; sourceItemId: string; isOfficialItemNumber: boolean; label: string; status: '정상' | '이상' | '확인 불가'; reason: string; confidence: number; evidenceRegions: Array<{ x: number; y: number; width: number; height: number; label: string }>; section: string; verificationMode: 'PHOTO' | 'MANUAL'; inspectionScope: '작동·종합점검' | '종합점검' | '성능점검' }>;
  legalBasis: { regulation: string; noticeNumber: string; effectiveDate: string; form: string; versionLabel: string; sourceUrl: string; verifiedAt: string };
  classificationNotice?: string; assistanceNotice: string; demo?: boolean; cached?: boolean;
};

export type ChecklistResponse = Pick<AnalysisResponse, 'officialEquipmentType' | 'classificationNotice' | 'assistanceNotice' | 'legalBasis'> & {
  key: string;
  requestedEquipmentType: string;
  detectionHints: string[];
  items: Array<Omit<AnalysisResponse['checklist'][number], 'status' | 'reason' | 'confidence' | 'evidenceRegions'>>;
};

export type QualityMetrics = { inspections: number; comparedItems: number; agreedItems: number; overriddenItems: number; agreementRate: number | null };

async function bodyOf(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `서버 요청 실패 (${response.status})`);
  return body;
}
const bearer = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });
async function reportRequest(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    return await bodyOf(await fetch(url, { ...init, signal: controller.signal }));
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('메일 전송 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');
    throw error;
  } finally { clearTimeout(timer); }
}

export async function registerAccount(input: RegistrationInput): Promise<AuthResponse> {
  return bodyOf(await fetch(`${API_URL}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }));
}
export async function loginAccount(email: string, password: string): Promise<AuthResponse> {
  return bodyOf(await fetch(`${API_URL}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }));
}
export async function refreshAccount(refreshToken: string): Promise<AuthResponse> {
  return bodyOf(await fetch(`${API_URL}/api/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) }));
}
export async function fetchSession(accessToken: string): Promise<{ workspace: WorkspacePayload }> {
  return bodyOf(await fetch(`${API_URL}/api/auth/session`, { headers: bearer(accessToken) }));
}
export async function createWorker(accessToken: string, input: { email: string; password: string; name: string; phone?: string; role?: 'worker' | 'admin' }) {
  return bodyOf(await fetch(`${API_URL}/api/auth/users`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...bearer(accessToken) }, body: JSON.stringify(input) }));
}
export async function bootstrapWorkspace(accessToken: string): Promise<{ workspace: WorkspacePayload; buildingId: string | null; buildingName: string; equipment: Equipment[] }> {
  return bodyOf(await fetch(`${API_URL}/api/sync/bootstrap`, { headers: bearer(accessToken) }));
}
export async function saveEquipment(buildingId: string, equipment: Equipment, accessToken: string): Promise<Equipment> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    return await bodyOf(await fetch(`${API_URL}/api/buildings/${encodeURIComponent(buildingId)}/equipment`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...bearer(accessToken) }, body: JSON.stringify(equipment), signal: controller.signal }));
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('설비 저장 시간이 초과되었습니다. 서버 연결을 확인해주세요.');
    throw error;
  } finally { clearTimeout(timer); }
}
export async function fetchEquipment(buildingId: string, accessToken: string): Promise<Equipment[]> {
  return bodyOf(await fetch(`${API_URL}/api/buildings/${encodeURIComponent(buildingId)}/equipment`, { headers: bearer(accessToken) }));
}
export async function removeEquipment(buildingId: string, equipmentId: string, accessToken: string) {
  const response = await fetch(`${API_URL}/api/buildings/${encodeURIComponent(buildingId)}/equipment/${encodeURIComponent(equipmentId)}`, { method: 'DELETE', headers: bearer(accessToken) });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message || '설비 삭제에 실패했습니다.'); }
}
export async function analyzeInspectionMedia(uri: string, mediaType: 'image' | 'video', equipmentType: string, accessToken: string): Promise<AnalysisResponse> {
  const form = new FormData();
  // Expo SDK 58/Hermes can reject the legacy React Native `{ uri, name, type }`
  // FormData part. Convert the local asset URI to a real Blob first.
  const fetchedBlob = await fetch(uri).then((response) => response.blob());
  const extension = uri.split('?')[0].split('.').pop()?.toLowerCase();
  const imageType = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
  const mediaMimeType = mediaType === 'video' ? 'video/mp4' : imageType;
  // Some remote image URLs return an empty/octet-stream Blob type. Re-wrap it
  // with an allowed MIME type so the server's image filter accepts it.
  const mediaBlob = new Blob([fetchedBlob], { type: mediaMimeType });
  form.append('media', mediaBlob, mediaType === 'video' ? 'inspection.mp4' : `inspection.${extension === 'png' || extension === 'webp' ? extension : 'jpg'}`);
  form.append('equipmentType', equipmentType);
  return bodyOf(await fetch(`${API_URL}/api/analyze`, { method: 'POST', headers: bearer(accessToken), body: form }));
}
export async function fetchChecklist(equipmentType: string, accessToken: string): Promise<ChecklistResponse> {
  return bodyOf(await fetch(`${API_URL}/api/checklists/${encodeURIComponent(equipmentType)}`, { headers: bearer(accessToken) }));
}
export async function submitInspection(result: InspectionResult, accessToken: string) {
  const form = new FormData(); form.append('result', JSON.stringify(result));
  if (result.mediaUri && result.mediaType) {
    const part = await blobPart(result.mediaUri);
    form.append('media', part.blob, `inspection-${result.equipmentId}.${part.extension}`);
  }
  return bodyOf(await fetch(`${API_URL}/api/inspections`, { method: 'POST', headers: bearer(accessToken), body: form }));
}
export async function fetchQualityMetrics(buildingId: string, accessToken: string): Promise<QualityMetrics> {
  return bodyOf(await fetch(`${API_URL}/api/quality/metrics?buildingId=${encodeURIComponent(buildingId)}`, { headers: bearer(accessToken) }));
}
export async function sendInspectionEmail(input: { recipient: string; result: InspectionResult; accessToken: string; template?: { uri: string; name: string; mimeType?: string } }) {
  const form = new FormData(); form.append('recipient', input.recipient); form.append('result', JSON.stringify(input.result));
  if (input.result.mediaUri && input.result.mediaType) {
    const part = await blobPart(input.result.mediaUri);
    form.append('attachments', part.blob, `inspection-${input.result.equipmentId}.${part.extension}`);
  }
  if (input.template) {
    const part = await blobPart(input.template.uri, input.template.mimeType || 'application/octet-stream');
    form.append('attachments', part.blob, input.template.name);
  }
  return reportRequest(`${API_URL}/api/reports/send`, { method: 'POST', headers: bearer(input.accessToken), body: form });
}
export async function sendBuildingReportEmail(input: { recipient: string; buildingId: string; accessToken: string; template?: { uri: string; name: string; mimeType?: string } }) {
  const form = new FormData(); form.append('recipient', input.recipient); form.append('buildingId', input.buildingId);
  if (input.template) {
    const part = await blobPart(input.template.uri, input.template.mimeType || 'application/octet-stream');
    form.append('attachments', part.blob, input.template.name);
  }
  return reportRequest(`${API_URL}/api/reports/building/send`, { method: 'POST', headers: bearer(input.accessToken), body: form });
}
