import { AuthTokens, Equipment, InspectionResult, RegistrationInput } from '../types';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export type WorkspacePayload = {
  context: { userId: string; organizationId: string; role: 'worker' | 'admin'; email: string; name: string };
  organization: string;
  buildings: Array<{ id: string; name: string }>;
};
export type AuthResponse = AuthTokens & { workspace: WorkspacePayload };

export type AnalysisResponse = {
  detectedEquipmentType: string; officialEquipmentType: string; equipmentMatch: boolean; matchConfidence: number; mismatchReason: string;
  summary: string; detectedIssues: string[]; riskLevel: '정상' | '주의' | '위험';
  photoQuality: { acceptable: boolean; brightness: '적정' | '너무 어두움' | '너무 밝음'; sharpness: '적정' | '흐림'; coverage: '적정' | '너무 몂'; issues: string[]; retakeGuidance: string };
  qualityThresholds: { equipmentMatch: number; itemJudgement: number; evidenceRequired: true };
  checklist: Array<{ id: string; sourceItemId: string; isOfficialItemNumber: boolean; label: string; status: '정상' | '이상' | '확인 불가'; reason: string; confidence: number; evidenceRegions: Array<{ x: number; y: number; width: number; height: number; label: string }>; section: string; verificationMode: 'PHOTO' | 'MANUAL'; inspectionScope: '작동·종합점검' | '종합점검' | '성능점검' }>;
  legalBasis: { regulation: string; noticeNumber: string; effectiveDate: string; form: string; versionLabel: string; sourceUrl: string; verifiedAt: string };
  classificationNotice?: string; assistanceNotice: string; demo?: boolean;
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
  return bodyOf(await fetch(`${API_URL}/api/buildings/${encodeURIComponent(buildingId)}/equipment`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...bearer(accessToken) }, body: JSON.stringify(equipment) }));
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
  form.append('media', { uri, name: 'inspection.jpg', type: 'image/jpeg' } as never);
  form.append('equipmentType', equipmentType);
  return bodyOf(await fetch(`${API_URL}/api/analyze`, { method: 'POST', headers: bearer(accessToken), body: form }));
}
export async function fetchChecklist(equipmentType: string, accessToken: string): Promise<ChecklistResponse> {
  return bodyOf(await fetch(`${API_URL}/api/checklists/${encodeURIComponent(equipmentType)}`, { headers: bearer(accessToken) }));
}
export async function submitInspection(result: InspectionResult, accessToken: string) {
  const form = new FormData(); form.append('result', JSON.stringify(result));
  if (result.mediaUri && result.mediaType) form.append('media', { uri: result.mediaUri, name: `inspection-${result.equipmentId}.jpg`, type: 'image/jpeg' } as never);
  return bodyOf(await fetch(`${API_URL}/api/inspections`, { method: 'POST', headers: bearer(accessToken), body: form }));
}
export async function fetchQualityMetrics(buildingId: string, accessToken: string): Promise<QualityMetrics> {
  return bodyOf(await fetch(`${API_URL}/api/quality/metrics?buildingId=${encodeURIComponent(buildingId)}`, { headers: bearer(accessToken) }));
}
export async function sendInspectionEmail(input: { recipient: string; result: InspectionResult; accessToken: string; template?: { uri: string; name: string; mimeType?: string } }) {
  const form = new FormData(); form.append('recipient', input.recipient); form.append('result', JSON.stringify(input.result));
  if (input.result.mediaUri && input.result.mediaType) form.append('attachments', { uri: input.result.mediaUri, name: `inspection-${input.result.equipmentId}.jpg`, type: 'image/jpeg' } as never);
  if (input.template) form.append('attachments', { uri: input.template.uri, name: input.template.name, type: input.template.mimeType || 'application/octet-stream' } as never);
  return bodyOf(await fetch(`${API_URL}/api/reports/send`, { method: 'POST', headers: bearer(input.accessToken), body: form }));
}
export async function sendBuildingReportEmail(input: { recipient: string; buildingId: string; accessToken: string; template?: { uri: string; name: string; mimeType?: string } }) {
  const form = new FormData(); form.append('recipient', input.recipient); form.append('buildingId', input.buildingId);
  if (input.template) form.append('attachments', { uri: input.template.uri, name: input.template.name, type: input.template.mimeType || 'application/octet-stream' } as never);
  return bodyOf(await fetch(`${API_URL}/api/reports/building/send`, { method: 'POST', headers: bearer(input.accessToken), body: form }));
}
