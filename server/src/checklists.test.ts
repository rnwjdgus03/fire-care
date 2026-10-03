import assert from 'node:assert/strict';
import test from 'node:test';
import { getOfficialChecklist, supportedEquipmentTypes } from './checklists.js';
import { mergeWithOfficialChecklist, ModelAnalysis } from './gemini.js';

const expectedCounts: Record<string, number> = {
  소화전: 8,
  소화펌프: 13,
  급수펌프: 8,
  '스프링클러 밸브': 17,
  소화기: 10,
  유도등: 7,
  방화문: 3,
  자동화재탐지설비: 12,
  '스프링클러 헤드': 8,
  비상방송설비: 8,
  옥외소화전: 8,
  제연설비: 8,
  피난기구: 8,
  비상조명등: 7,
  방화셔터: 7,
  에어컨: 5,
};

const goodQuality: ModelAnalysis['photoQuality'] = {
  acceptable: true,
  brightness: '적정',
  sharpness: '적정',
  coverage: '적정',
  issues: [],
  retakeGuidance: '',
};

function modelFor(type: string): ModelAnalysis {
  const official = getOfficialChecklist(type);
  return {
    detectedEquipmentType: type,
    equipmentMatch: true,
    matchConfidence: 0.95,
    mismatchReason: '',
    summary: '테스트 판정',
    detectedIssues: [],
    riskLevel: '정상',
    photoQuality: goodQuality,
    checklist: official.items.map((entry) => ({
      id: entry.id,
      status: entry.verificationMode === 'PHOTO' ? '정상' : '확인 불가',
      reason: '테스트 근거',
      confidence: entry.verificationMode === 'PHOTO' ? 0.9 : 0,
      evidenceRegions: entry.verificationMode === 'PHOTO' ? [{ x: 100, y: 100, width: 300, height: 300, label: entry.sourceItemId }] : [],
    })),
  };
}

test('지원 설비별 공식 항목 수와 ID가 완전하고 중복되지 않는다', () => {
  assert.deepEqual([...supportedEquipmentTypes].sort(), Object.keys(expectedCounts).sort());
  for (const [type, count] of Object.entries(expectedCounts)) {
    const checklist = getOfficialChecklist(type);
    assert.equal(checklist.items.length, count, `${type} 항목 수`);
    assert.equal(new Set(checklist.items.map((item) => item.id)).size, count, `${type} ID 중복`);
    assert.ok(checklist.items.every((item) => item.section && item.sourceItemId && item.label));
  }
});

test('어둡거나 흐리거나 먼 사진은 전체 판정을 거부한다', () => {
  const official = getOfficialChecklist('에어컨');
  for (const quality of [
    { ...goodQuality, acceptable: false, brightness: '너무 어두움' as const, issues: ['조도 부족'], retakeGuidance: '밝은 곳에서 재촬영' },
    { ...goodQuality, acceptable: false, sharpness: '흐림' as const, issues: ['초점 불량'], retakeGuidance: '초점을 맞춰 재촬영' },
    { ...goodQuality, acceptable: false, coverage: '너무 멂' as const, issues: ['설비가 작게 보임'], retakeGuidance: '가까이서 재촬영' },
  ]) {
    const merged = mergeWithOfficialChecklist({ ...modelFor('에어컨'), photoQuality: quality }, official);
    assert.equal(merged.equipmentMatch, false);
    assert.ok(merged.checklist.every((item) => item.status === '확인 불가'));
  }
});

test('신뢰도 75% 미만 또는 근거영역 없는 사진 판정은 직접 확인으로 내린다', () => {
  const official = getOfficialChecklist('소화기');
  const lowConfidence = modelFor('소화기');
  const photoIndexes = lowConfidence.checklist.map((item, index) => ({ item, index })).filter(({ item }) => item.evidenceRegions.length);
  lowConfidence.checklist[photoIndexes[0].index].confidence = 0.74;
  lowConfidence.checklist[photoIndexes[1].index].evidenceRegions = [];
  const merged = mergeWithOfficialChecklist(lowConfidence, official);
  assert.equal(merged.checklist[photoIndexes[0].index].status, '확인 불가');
  assert.equal(merged.checklist[photoIndexes[1].index].status, '확인 불가');
});

test('직접 확인 항목은 모델 응답과 무관하게 자동 판정하지 않는다', () => {
  const official = getOfficialChecklist('소화펌프');
  const model = modelFor('소화펌프');
  model.checklist = model.checklist.map((entry) => ({ ...entry, status: '정상', confidence: 0.99, evidenceRegions: [{ x: 0, y: 0, width: 100, height: 100, label: '오판정' }] }));
  const merged = mergeWithOfficialChecklist(model, official);
  assert.ok(merged.checklist.filter((item) => item.verificationMode === 'MANUAL').every((item) => item.status === '확인 불가'));
});
