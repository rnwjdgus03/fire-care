import { GoogleGenAI } from '@google/genai';
import { unlink } from 'node:fs/promises';
import { OfficialChecklist } from './checklists.js';
import { getChecklistMaster } from './database.js';

type Status = '정상' | '이상' | '확인 불가';

type EvidenceRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
};

type PhotoQuality = {
  acceptable: boolean;
  brightness: '적정' | '너무 어두움' | '너무 밝음';
  sharpness: '적정' | '흐림';
  coverage: '적정' | '너무 멂' | '일부 잘림';
  issues: string[];
  retakeGuidance: string;
};

export type ModelAnalysis = {
  detectedEquipmentType: string;
  equipmentMatch: boolean;
  matchConfidence: number;
  mismatchReason: string;
  summary: string;
  detectedIssues: string[];
  riskLevel: '정상' | '주의' | '위험';
  photoQuality: PhotoQuality;
  checklist: Array<{ id: string; status: Status; reason: string; confidence: number; evidenceRegions: EvidenceRegion[] }>;
};

export type Analysis = Omit<ModelAnalysis, 'checklist'> & {
  officialEquipmentType: string;
  classificationNotice?: string;
  legalBasis: OfficialChecklist['legalBasis'];
  assistanceNotice: string;
  qualityThresholds: { equipmentMatch: number; itemJudgement: number; evidenceRequired: true };
  checklist: Array<OfficialChecklist['items'][number] & { status: Status; reason: string; confidence: number; evidenceRegions: EvidenceRegion[] }>;
  demo?: boolean;
};

const responseJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    detectedEquipmentType: { type: 'string' },
    equipmentMatch: { type: 'boolean' },
    matchConfidence: { type: 'number', minimum: 0, maximum: 1 },
    mismatchReason: { type: 'string' },
    summary: { type: 'string' },
    detectedIssues: { type: 'array', items: { type: 'string' } },
    riskLevel: { type: 'string', enum: ['정상', '주의', '위험'] },
    photoQuality: {
      type: 'object',
      additionalProperties: false,
      properties: {
        acceptable: { type: 'boolean' },
        brightness: { type: 'string', enum: ['적정', '너무 어두움', '너무 밝음'] },
        sharpness: { type: 'string', enum: ['적정', '흐림'] },
        coverage: { type: 'string', enum: ['적정', '너무 멂', '일부 잘림'] },
        issues: { type: 'array', items: { type: 'string' } },
        retakeGuidance: { type: 'string' },
      },
      required: ['acceptable', 'brightness', 'sharpness', 'coverage', 'issues', 'retakeGuidance'],
    },
    checklist: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: ['정상', '이상', '확인 불가'] },
          reason: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          evidenceRegions: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                x: { type: 'number', minimum: 0, maximum: 1000 },
                y: { type: 'number', minimum: 0, maximum: 1000 },
                width: { type: 'number', minimum: 0, maximum: 1000 },
                height: { type: 'number', minimum: 0, maximum: 1000 },
                label: { type: 'string' },
              },
              required: ['x', 'y', 'width', 'height', 'label'],
            },
          },
        },
        required: ['id', 'status', 'reason', 'confidence', 'evidenceRegions'],
      },
    },
  },
  required: ['detectedEquipmentType', 'equipmentMatch', 'matchConfidence', 'mismatchReason', 'summary', 'detectedIssues', 'riskLevel', 'photoQuality', 'checklist'],
};

const EQUIPMENT_MATCH_THRESHOLD = 0.7;
const ITEM_JUDGEMENT_THRESHOLD = 0.75;

const assistanceNotice = '이 결과는 사진 기반 점검 보조 정보이며 법정 자체점검의 완료 또는 적합 판정을 의미하지 않습니다. 자격과 권한을 갖춘 점검자가 현장에서 최종 확인해야 합니다.';

const noticeFor = (checklist: OfficialChecklist) => checklist.assistanceNotice || assistanceNotice;

function isTemporaryGeminiError(error: unknown) {
  const text = error instanceof Error ? error.message : JSON.stringify(error);
  return /503|UNAVAILABLE|high demand|temporarily|try again later/i.test(text);
}

function toGeminiUserError(error: unknown) {
  if (isTemporaryGeminiError(error)) {
    return new Error('Gemini 서버가 현재 혼잡합니다. 잠시 후 다시 시도해주세요.');
  }
  const text = error instanceof Error ? error.message : String(error);
  if (/API key|permission|PERMISSION_DENIED|UNAUTHENTICATED/i.test(text)) {
    return new Error('Gemini API 키 또는 권한 설정을 확인해주세요.');
  }
  return new Error('Gemini 사진 분석 중 오류가 발생했습니다. 사진을 다시 촬영하거나 잠시 후 다시 시도해주세요.');
}

async function retryTemporary<T>(task: () => Promise<T>) {
  try {
    return await task();
  } catch (error) {
    if (!isTemporaryGeminiError(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return task();
  }
}

function manualResult(checklist: OfficialChecklist, reason: string, demo = false): Analysis {
  return {
    detectedEquipmentType: '판정하지 않음',
    equipmentMatch: false,
    matchConfidence: 0,
    mismatchReason: reason,
    summary: reason,
    detectedIssues: [],
    riskLevel: '주의',
    photoQuality: { acceptable: false, brightness: '적정', sharpness: '적정', coverage: '적정', issues: [reason], retakeGuidance: reason },
    officialEquipmentType: checklist.officialEquipmentType,
    classificationNotice: checklist.classificationNotice,
    legalBasis: checklist.legalBasis,
    assistanceNotice: noticeFor(checklist),
    qualityThresholds: { equipmentMatch: EQUIPMENT_MATCH_THRESHOLD, itemJudgement: ITEM_JUDGEMENT_THRESHOLD, evidenceRequired: true },
    checklist: checklist.items.map((entry) => ({ ...entry, status: '확인 불가', reason, confidence: 0, evidenceRegions: [] })),
    demo,
  };
}

export function mergeWithOfficialChecklist(parsed: ModelAnalysis, official: OfficialChecklist): Analysis {
  const modelItems = new Map(parsed.checklist.map((entry) => [entry.id, entry]));
  const qualityAccepted = parsed.photoQuality.acceptable && parsed.photoQuality.brightness === '적정' && parsed.photoQuality.sharpness === '적정' && parsed.photoQuality.coverage === '적정';
  const equipmentMatch = qualityAccepted && parsed.equipmentMatch && parsed.matchConfidence >= EQUIPMENT_MATCH_THRESHOLD;
  const checklist = official.items.map((entry) => {
    const result = modelItems.get(entry.id);
    const evidenceRegions = (result?.evidenceRegions ?? []).filter((region) => region.width > 0 && region.height > 0 && region.x + region.width <= 1000 && region.y + region.height <= 1000);
    if (!qualityAccepted) {
      return { ...entry, status: '확인 불가' as const, reason: `사진 품질이 판정 기준을 충족하지 않습니다. ${parsed.photoQuality.retakeGuidance}`, confidence: 0, evidenceRegions: [] };
    }
    if (!equipmentMatch) {
      return { ...entry, status: '확인 불가' as const, reason: '선택한 설비와 사진 속 설비의 일치가 확인되지 않았습니다.', confidence: 0, evidenceRegions: [] };
    }
    if (entry.verificationMode === 'MANUAL') {
      return { ...entry, status: '확인 불가' as const, reason: '작동·측정·내부 확인이 필요한 공식 항목으로 현장 직접 확인 대상입니다.', confidence: 0, evidenceRegions: [] };
    }
    if (!result || !['정상', '이상', '확인 불가'].includes(result.status)) {
      return { ...entry, status: '확인 불가' as const, reason: '사진에서 판정 근거를 확보하지 못했습니다.', confidence: 0, evidenceRegions: [] };
    }
    if (result.status === '확인 불가' || result.confidence < ITEM_JUDGEMENT_THRESHOLD || !evidenceRegions.length) {
      return { ...entry, status: '확인 불가' as const, reason: result.confidence < ITEM_JUDGEMENT_THRESHOLD ? `판정 신뢰도 ${Math.round(result.confidence * 100)}%로 기준 미달입니다.` : '사진에서 표시할 수 있는 판정 근거 영역을 확보하지 못했습니다.', confidence: result.confidence, evidenceRegions: [] };
    }
    return { ...entry, status: result.status, reason: result.reason, confidence: result.confidence, evidenceRegions };
  });
  return {
    detectedEquipmentType: parsed.detectedEquipmentType,
    equipmentMatch,
    matchConfidence: parsed.matchConfidence,
    mismatchReason: equipmentMatch ? '' : (parsed.mismatchReason || '선택한 설비와 사진 속 설비가 일치하지 않습니다.'),
    summary: parsed.summary,
    detectedIssues: Array.isArray(parsed.detectedIssues) ? parsed.detectedIssues : [],
    riskLevel: parsed.riskLevel,
    photoQuality: parsed.photoQuality,
    officialEquipmentType: official.officialEquipmentType,
    classificationNotice: official.classificationNotice,
    legalBasis: official.legalBasis,
    assistanceNotice: noticeFor(official),
    qualityThresholds: { equipmentMatch: EQUIPMENT_MATCH_THRESHOLD, itemJudgement: ITEM_JUDGEMENT_THRESHOLD, evidenceRequired: true },
    checklist,
  };
}

export async function analyzeMedia(filePath: string, mimeType: string, equipmentType: string): Promise<Analysis> {
  const official = await getChecklistMaster(equipmentType);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    await unlink(filePath).catch(() => undefined);
    return manualResult(official, 'Gemini API 키가 없어 설비 일치와 사진 판정을 수행하지 않았습니다.', true);
  }

  const ai = new GoogleGenAI({ apiKey });
  try {
    const uploaded = await ai.files.upload({ file: filePath, config: { mimeType } });
    if (!uploaded.name || !uploaded.uri) throw new Error('Gemini 파일 업로드 응답이 올바르지 않습니다.');

    let file = uploaded;
    while (file.state && String(file.state) !== 'ACTIVE') {
      if (String(file.state) === 'FAILED') throw new Error('Gemini 미디어 처리에 실패했습니다.');
      await new Promise((resolve) => setTimeout(resolve, 3000));
      file = await ai.files.get({ name: uploaded.name });
    }

    const officialItems = official.items.map(({ id, sourceItemId, label, verificationMode }) => ({ id, sourceItemId, label, verificationMode }));
    const response = await retryTemporary(() => ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.7-flash',
      contents: [
        { fileData: { fileUri: file.uri!, mimeType } },
        { text: `당신은 시설설비 사진 판정 보조 시스템입니다. 사용자가 선택한 설비는 "${equipmentType}"이고 공식 분류는 "${official.officialEquipmentType}"입니다. 식별 단서는 ${official.detectionHints.join(', ')}입니다. 먼저 사진 품질을 평가하세요. 너무 어둡거나 밝음, 초점 흐림, 설비가 너무 멀거나 핵심 부위가 잘린 사진은 photoQuality.acceptable=false로 하고 모든 항목을 확인 불가로 반환하세요. 그 다음 사진의 주된 설비를 식별하고 선택 설비와 일치하는지 판정하세요. 다른 설비이거나 사진이 불충분하면 equipmentMatch=false로 하세요. 다음 officialItems는 서버가 제공한 공식 체크리스트이며 항목을 추가·삭제·변경하면 안 됩니다. 모든 id를 정확히 한 번씩 반환하세요. verificationMode가 MANUAL인 항목은 사진 내용과 관계없이 반드시 status="확인 불가", confidence=0, evidenceRegions=[]로 반환하세요. PHOTO 항목도 사진에 명확한 시각 근거가 있을 때만 정상 또는 이상으로 판정하고, 수치 측정·작동시험·내부 상태·사진 밖 위치가 필요한 경우 확인 불가로 판정하세요. 정상 또는 이상 판정에는 판단 근거가 보이는 사각형을 0~1000 정규화 좌표 evidenceRegions로 반드시 반환하세요. 사각형은 이미지 경계 안에 있어야 합니다. 법정 점검 완료나 적합 판정을 선언하지 마세요. officialItems=${JSON.stringify(officialItems)}` },
      ],
      config: { responseMimeType: 'application/json', responseJsonSchema },
    }));

    const raw = response.text ?? '';
    const json = raw.match(/\{[\s\S]*\}/)?.[0];
    if (!json) throw new Error('Gemini JSON 응답을 찾을 수 없습니다.');
    return mergeWithOfficialChecklist(JSON.parse(json) as ModelAnalysis, official);
  } catch (error) {
    throw toGeminiUserError(error);
  } finally {
    await unlink(filePath).catch(() => undefined);
  }
}
