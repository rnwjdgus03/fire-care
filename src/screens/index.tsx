import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { supportedEquipmentNames } from '../data';
import { analyzeInspectionMedia, AnalysisResponse, ChecklistResponse, createWorker, fetchChecklist, fetchQualityMetrics, QualityMetrics, submitInspection } from '../services/api';
import { colors } from '../theme';
import { AppSession, Equipment, EquipmentInput, InspectionResult, RegistrationInput, ScreenName } from '../types';
import { Button, Card, Field, Header, Pill, Screen, ui } from '../components/ui';

type Nav = (screen: ScreenName) => void;
const airConditionerMeasurements = [
  { id: 'ac-suction-pressure', label: '냉매 흡입측 압력', unit: 'MPa', requiredMethod: '매니폴드 게이지 직접 측정' },
  { id: 'ac-discharge-pressure', label: '냉매 토출측 압력', unit: 'MPa', requiredMethod: '매니폴드 게이지 직접 측정' },
  { id: 'ac-return-temperature', label: '흡입 공기 온도', unit: '℃', requiredMethod: '온도계 직접 측정' },
  { id: 'ac-supply-temperature', label: '토출 공기 온도', unit: '℃', requiredMethod: '온도계 직접 측정' },
  { id: 'ac-voltage', label: '운전 전압', unit: 'V', requiredMethod: '테스터 직접 측정' },
  { id: 'ac-current', label: '운전 전류', unit: 'A', requiredMethod: '클램프미터 직접 측정' },
] as const;

export function LoginScreen({ onLogin, navigate }: { onLogin: (email: string, password: string) => Promise<void>; navigate: Nav }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const login = async () => {
    if (!email.trim() || !password) return Alert.alert('입력 확인', '이메일과 비밀번호를 입력해주세요.');
    setBusy(true);
    try { await onLogin(email, password); }
    catch (error) { Alert.alert('로그인 실패', error instanceof Error ? error.message : '서버 연결을 확인해주세요.'); }
    finally { setBusy(false); }
  };

  return (
    <Screen>
      <View style={styles.loginHero}>
        <View style={styles.logo}><Text style={styles.logoText}>F</Text></View>
        <Text style={styles.brand}>FIRE CARE</Text>
        <Text style={styles.brandSub}>실시간 소방설비 통합관리 시스템</Text>
      </View>
      <Card>
        <Text style={ui.title}>로그인</Text>
        <Text style={[ui.body, { marginBottom: 18 }]}>서버에 등록된 계정으로 로그인합니다. 역할은 서버의 권한으로 결정됩니다.</Text>
        <Field label="이메일" value={email} onChangeText={setEmail} placeholder="name@company.com" keyboardType="email-address" />
        <Field label="비밀번호" value={password} onChangeText={setPassword} placeholder="비밀번호" secureTextEntry />
        <Button label={busy ? '로그인 중...' : '로그인'} onPress={login} disabled={busy} />
        <Pressable onPress={() => navigate('register')} style={styles.linkButton}>
          <Text style={styles.linkMuted}>처음 방문하셨나요?</Text><Text style={styles.link}> 회원가입</Text>
        </Pressable>
      </Card>
    </Screen>
  );
}

export function RegisterScreen({ navigate, onRegister }: { navigate: Nav; onRegister: (input: RegistrationInput) => Promise<void> }) {
  const [form, setForm] = useState<RegistrationInput>({ name: '', organization: '', email: '', phone: '', building: '', password: '' });
  const [busy, setBusy] = useState(false);
  const update = (key: keyof typeof form) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const register = async () => {
    if (!form.name.trim() || !form.organization.trim() || !form.building.trim() || !form.email.trim() || form.password.length < 8) return Alert.alert('필수 정보 확인', '이름·회사·건물·이메일과 8자 이상 비밀번호를 입력해주세요.');
    setBusy(true);
    try { await onRegister(form); }
    catch (error) {
      const message = error instanceof Error ? error.message : '서버 DB 설정을 확인해주세요.';
      Alert.alert('회원가입 실패', message, message.includes('이미 가입된 이메일') ? [{ text: '닫기' }, { text: '로그인으로 이동', onPress: () => navigate('login') }] : [{ text: '확인' }]);
    }
    finally { setBusy(false); }
  };
  return (
    <Screen>
      <Header title="회원가입" subtitle="관리자 및 건물 정보를 등록해주세요" onBack={() => navigate('login')} />
      <Card>
        <Field label="이름" value={form.name} onChangeText={update('name')} placeholder="이름을 입력해주세요" />
        <Field label="소속" value={form.organization} onChangeText={update('organization')} placeholder="소속을 입력해주세요" />
        <Field label="이메일" value={form.email} onChangeText={update('email')} placeholder="보고서 수신 이메일" keyboardType="email-address" />
        <Field label="비밀번호" value={form.password} onChangeText={update('password')} placeholder="8자 이상" secureTextEntry />
        <Field label="전화번호" value={form.phone} onChangeText={update('phone')} placeholder="010-0000-0000" keyboardType="phone-pad" />
        <Field label="건물 이름" value={form.building} onChangeText={update('building')} placeholder="건물 이름을 입력해주세요" />
        <Text style={styles.helperText}>가입 후 설비 리스트에서 실제 층/구역과 설비를 직접 등록할 수 있습니다.</Text>
        <Button label={busy ? '계정 생성 중...' : '가입 완료'} onPress={register} disabled={busy} />
      </Card>
    </Screen>
  );
}

function ProfileHeader({ session, navigate }: { session: AppSession; navigate: Nav }) {
  return (
    <View style={styles.profileHeader}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{session.name.slice(0, 1)}</Text></View>
      <View style={{ flex: 1 }}><Text style={styles.profileName}>{session.name}</Text><Text style={styles.profileRole}>{session.role}</Text></View>
      <Pressable onPress={() => navigate('profile')} style={styles.smallButton}><Text style={styles.smallButtonText}>내정보 수정</Text></Pressable>
    </View>
  );
}

export function HomeScreen({ session, navigate, logout, syncState }: { session: AppSession; navigate: Nav; logout: () => void; syncState: '동기화 중' | '동기화 완료' | 'DB 설정 필요' | '로그인 필요' }) {
  const cards = [
        { title: '설비 리스트', desc: '층별 설비 정보와 점검 상태', target: 'equipment' as ScreenName, icon: 'E' },
        { title: '점검 시작', desc: '점검할 설비를 직접 선택하고 사진 촬영', target: 'inspectionSelect' as ScreenName, icon: 'I' },
        ...(session.role === '관리자' ? [{ title: '관리자 대시보드', desc: '특이사항과 설비 상태 현황', target: 'admin' as ScreenName, icon: 'D' }] : []),
      ];
  return (
    <Screen>
      <ProfileHeader session={session} navigate={navigate} />
      <View style={styles.orgRow}><Text style={styles.orgLabel}>{session.organization}</Text><Text style={styles.orgName}>{session.company}</Text></View>
      <View style={styles.syncRow}><Text style={styles.syncText}>데이터 저장 상태</Text><Pill label={syncState} tone={syncState === '동기화 완료' ? 'success' : syncState === '동기화 중' ? 'warning' : 'neutral'} /></View>
      <Text style={[ui.sectionTitle, { marginTop: 26 }]}>업무 메뉴</Text>
      {cards.map((card) => (
        <Pressable key={card.title} onPress={() => navigate(card.target)} style={styles.menuCard}>
          <View style={styles.menuIcon}><Text style={styles.menuIconText}>{card.icon}</Text></View>
          <View style={{ flex: 1 }}><Text style={styles.menuTitle}>{card.title}</Text><Text style={styles.menuDesc}>{card.desc}</Text></View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      ))}
      <View style={{ marginTop: 22 }}><Button label="로그아웃" onPress={logout} variant="secondary" /></View>
    </Screen>
  );
}

export function EquipmentScreen({ navigate, onSelect, equipment, building, onAdd, onRemove, canManage }: { navigate: Nav; onSelect: (item: Equipment) => void; equipment: Equipment[]; building: string; onAdd: (input: EquipmentInput) => Promise<void>; onRemove: (id: string) => Promise<void>; canManage: boolean }) {
  const [floor, setFloor] = useState('전체');
  const [showForm, setShowForm] = useState(false);
  const [newFloor, setNewFloor] = useState('');
  const [newName, setNewName] = useState('');
  const [newCount, setNewCount] = useState('1');
  const [newDueDate, setNewDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const floors = useMemo(() => ['전체', ...Array.from(new Set(equipment.map((item) => item.floor)))], [equipment]);
  const filtered = useMemo(() => floor === '전체' ? equipment : equipment.filter((item) => item.floor === floor), [equipment, floor]);
  const add = async () => {
    const count = Number.parseInt(newCount, 10);
    if (!newFloor.trim() || !newName) return Alert.alert('입력 확인', '층/구역과 설비 종류를 입력해주세요.');
    if (!Number.isInteger(count) || count < 1) return Alert.alert('수량 확인', '수량은 1 이상의 숫자로 입력해주세요.');
    setSaving(true);
    try {
      await onAdd({ floor: newFloor.trim(), name: newName, count, dueDate: newDueDate.trim() || '미설정' });
      setFloor(newFloor.trim());
      setNewFloor('');
      setNewName('');
      setNewCount('1');
      setNewDueDate('');
      setShowForm(false);
    } catch (error) { Alert.alert('동기화 안내', error instanceof Error ? error.message : '서버 저장에 실패했습니다.'); }
    finally { setSaving(false); }
  };
  return (
    <Screen>
      <Header title="설비 리스트" subtitle={building || '건물 미등록'} onBack={() => navigate('home')} />
      {canManage && !showForm ? <View style={{ marginBottom: 18 }}><Button label="새 설비 등록" onPress={() => setShowForm(true)} /></View> : null}
      {canManage && showForm ? <Card style={{ marginBottom: 18 }}>
        <Text style={ui.sectionTitle}>층/구역과 설비 추가</Text>
        <Text style={styles.helperText}>아래 종류는 공식 체크리스트가 준비된 선택지이며, ‘설비 추가’를 눌러야 실제 목록에 등록됩니다.</Text>
        <Field label="층/구역" value={newFloor} onChangeText={setNewFloor} placeholder="예: 2층, 옥상, 기계실" />
        <Text style={styles.formLabel}>설비 종류 선택</Text>
        <View style={styles.chips}>{supportedEquipmentNames.map((item) => <Pressable key={item} onPress={() => setNewName(item)} style={[styles.chip, newName === item && styles.chipActive]}><Text style={[styles.chipText, newName === item && styles.chipTextActive]}>{item}</Text></Pressable>)}</View>
        <Field label="수량" value={newCount} onChangeText={setNewCount} keyboardType="number-pad" placeholder="1" />
        <Field label="점검기한" value={newDueDate} onChangeText={setNewDueDate} placeholder="예: 2026-09-30 (선택)" />
        <View style={styles.photoActions}><View style={{ flex: 1 }}><Button label="취소" onPress={() => setShowForm(false)} variant="secondary" disabled={saving} /></View><View style={{ flex: 1 }}><Button label={saving ? '저장 중...' : '설비 추가'} onPress={add} disabled={saving} /></View></View>
      </Card> : null}
      <View style={styles.chips}>{floors.map((item) => <Pressable key={item} onPress={() => setFloor(item)} style={[styles.chip, floor === item && styles.chipActive]}><Text style={[styles.chipText, floor === item && styles.chipTextActive]}>{item}</Text></Pressable>)}</View>
      {!filtered.length ? <View style={styles.emptyList}><Text style={styles.emptyTitle}>등록된 설비가 없습니다</Text><Text style={styles.emptyBody}>{canManage ? '새 설비 등록에서 실제 층/구역과 설비를 추가해주세요.' : '관리자가 설비를 등록한 후 점검할 수 있습니다.'}</Text></View> : null}
      {filtered.map((item) => (
        <Pressable key={item.id} onPress={() => { onSelect(item); navigate('inspection'); }} style={styles.equipmentCard}>
          <View style={styles.equipmentTop}><View><Text style={styles.equipmentName}>{item.name}</Text><Text style={styles.equipmentId}>{item.id}</Text></View><View style={styles.cardActions}><Pill label={item.status} tone={item.status === '정상' ? 'success' : item.status === '이상' ? 'danger' : 'warning'} />{canManage ? <Pressable onPress={(event) => { event.stopPropagation(); Alert.alert('설비 삭제', `${item.floor} ${item.name}을(를) 삭제할까요?`, [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => { void onRemove(item.id).catch((error) => Alert.alert('삭제 실패', error instanceof Error ? error.message : '서버 삭제에 실패했습니다.')); } }]); }}><Text style={styles.remove}>삭제</Text></Pressable> : null}</View></View>
          <View style={styles.equipmentMeta}><Text style={styles.metaText}>{item.floor} · {item.count}개</Text><Text style={styles.metaText}>점검기한 {item.dueDate}</Text></View>
        </Pressable>
      ))}
    </Screen>
  );
}

export function InspectionSelectScreen({ navigate, equipment, building, onSelect }: { navigate: Nav; equipment: Equipment[]; building: string; onSelect: (item: Equipment) => void }) {
  const [floor, setFloor] = useState('전체');
  const floors = useMemo(() => ['전체', ...Array.from(new Set(equipment.map((item) => item.floor)))], [equipment]);
  const filtered = useMemo(() => floor === '전체' ? equipment : equipment.filter((item) => item.floor === floor), [equipment, floor]);

  return (
    <Screen>
      <Header title="점검할 설비 선택" subtitle={building || '건물 미등록'} onBack={() => navigate('home')} />
      <Text style={styles.helperText}>사진을 촬영하기 전에 사용자가 실제 점검할 설비를 직접 선택합니다.</Text>
      {equipment.length ? <View style={styles.chips}>{floors.map((item) => <Pressable key={item} onPress={() => setFloor(item)} style={[styles.chip, floor === item && styles.chipActive]}><Text style={[styles.chipText, floor === item && styles.chipTextActive]}>{item}</Text></Pressable>)}</View> : null}
      {!equipment.length ? <View style={styles.emptyList}><Text style={styles.emptyTitle}>선택할 설비가 없습니다</Text><Text style={styles.emptyBody}>먼저 실제 층/구역과 설비를 등록해주세요.</Text><View style={{ marginTop: 18, width: '100%' }}><Button label="설비 등록하러 가기" onPress={() => navigate('equipment')} /></View></View> : null}
      {filtered.map((item) => (
        <Pressable key={item.id} onPress={() => onSelect(item)} style={styles.equipmentCard}>
          <View style={styles.equipmentTop}>
            <View><Text style={styles.equipmentName}>{item.name}</Text><Text style={styles.equipmentId}>{item.id}</Text></View>
            <Pill label="선택하여 점검" tone="success" />
          </View>
          <View style={styles.equipmentMeta}><Text style={styles.metaText}>{item.floor} · {item.count}개</Text><Text style={styles.metaText}>점검기한 {item.dueDate}</Text></View>
        </Pressable>
      ))}
    </Screen>
  );
}

export function InspectionScreen({ session, selected, navigate, onComplete, accessToken }: { session: AppSession; selected: Equipment; navigate: Nav; onComplete: (result: InspectionResult) => void; accessToken: string }) {
  type CheckStatus = '정상' | '이상' | '확인 불가' | '해당 없음';
  const [items, setItems] = useState<AnalysisResponse['checklist']>([]);
  const [checklist, setChecklist] = useState<ChecklistResponse>();
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  const [checks, setChecks] = useState<Record<string, CheckStatus>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [media, setMedia] = useState<{ uri: string; type: 'image'; aspectRatio: number }>();
  const [analysis, setAnalysis] = useState<AnalysisResponse>();
  const [analysisError, setAnalysisError] = useState('');
  const [busy, setBusy] = useState(false);
  const [measurementValues, setMeasurementValues] = useState<Record<string, string>>({});
  const photoItems = items.filter((item) => item.verificationMode === 'PHOTO');
  const manualItems = items.filter((item) => item.verificationMode === 'MANUAL');

  useEffect(() => {
    setLoadingChecklist(true);
    setAnalysis(undefined);
    setMedia(undefined);
    setItems([]);
    setChecks({});
    setReasons({});
    fetchChecklist(selected.name, accessToken)
      .then((result) => {
        setChecklist(result);
        const initialItems = result.items.map((entry) => ({ ...entry, status: '확인 불가' as const, reason: entry.verificationMode === 'PHOTO' ? '사진 촬영 후 Gemini가 판정할 항목입니다.' : '현장에서 직접 확인해야 하는 항목입니다.', confidence: 0, evidenceRegions: [] }));
        setItems(initialItems);
        setChecks(Object.fromEntries(initialItems.map((item) => [item.id, '확인 불가'])));
        setReasons(Object.fromEntries(initialItems.map((item) => [item.id, item.reason])));
      })
      .catch((error) => Alert.alert('체크리스트 로드 실패', error instanceof Error ? error.message : '서버 DB 연결을 확인해주세요.'))
      .finally(() => setLoadingChecklist(false));
  }, [accessToken, selected.id, selected.name]);

  const applyPhoto = (uri: string, width?: number, height?: number) => {
    setMedia({ uri, type: 'image', aspectRatio: width && height ? width / height : 1 });
    setAnalysis(undefined);
    setAnalysisError('');
    if (checklist) {
      const initialItems = checklist.items.map((entry) => ({ ...entry, status: '확인 불가' as const, reason: entry.verificationMode === 'PHOTO' ? '사진 촬영 후 Gemini가 판정할 항목입니다.' : '현장에서 직접 확인해야 하는 항목입니다.', confidence: 0, evidenceRegions: [] }));
      setItems(initialItems);
      setChecks(Object.fromEntries(initialItems.map((item) => [item.id, '확인 불가'])));
      setReasons(Object.fromEntries(initialItems.map((item) => [item.id, item.reason])));
    }
  };

  const pickMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('권한 필요', '사진을 선택하려면 사진 보관함 접근 권한이 필요합니다.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) applyPhoto(result.assets[0].uri, result.assets[0].width, result.assets[0].height);
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert('권한 필요', '인증사진을 촬영하려면 카메라 권한이 필요합니다.');
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) applyPhoto(result.assets[0].uri, result.assets[0].width, result.assets[0].height);
  };

  const runAnalysis = async () => {
    if (!media) return Alert.alert('인증사진 필요', '분석할 인증사진을 먼저 촬영하거나 선택해주세요.');
    setBusy(true);
    setAnalysisError('');
    try {
      const result = await analyzeInspectionMedia(media.uri, media.type, selected.name, accessToken);
      setAnalysis(result);
      setItems(result.checklist);
      setChecks(Object.fromEntries(result.checklist.map((item) => [item.id, item.status])));
      setReasons(Object.fromEntries(result.checklist.map((item) => [item.id, item.reason])));
    } catch (error) {
      const message = error instanceof Error ? error.message : '서버 연결과 Gemini 설정을 확인해주세요.';
      setAnalysisError(message);
      Alert.alert('분석 실패', message, [{ text: '닫기' }, { text: '다시 시도', onPress: () => { void runAnalysis(); } }]);
      if (checklist && !items.length) {
        const initialItems = checklist.items.map((entry) => ({ ...entry, status: '확인 불가' as const, reason: 'Gemini 분석 실패로 현장에서 직접 확인해야 합니다.', confidence: 0, evidenceRegions: [] }));
        setItems(initialItems);
        setChecks(Object.fromEntries(initialItems.map((item) => [item.id, '확인 불가'])));
        setReasons(Object.fromEntries(initialItems.map((item) => [item.id, item.reason])));
      }
    } finally { setBusy(false); }
  };

  const cycleStatus = (item: string) => {
    const order: CheckStatus[] = ['확인 불가', '정상', '이상', '해당 없음'];
    setChecks((prev) => ({
      ...prev,
      [item]: order[(order.indexOf(prev[item] ?? '확인 불가') + 1) % order.length],
    }));
  };

  const save = async () => {
    if (analysis && !analysis.photoQuality.acceptable) {
      return Alert.alert('사진 재촬영 필요', analysis.photoQuality.retakeGuidance || '사진 품질이 판정 기준을 충족하지 않습니다.');
    }
    if (analysis && !analysis.equipmentMatch) {
      return Alert.alert('설비 불일치', analysis.mismatchReason || '선택한 설비와 사진 속 설비가 일치하지 않습니다. 올바른 사진을 다시 촬영해주세요.');
    }
    const unresolved = items.filter((item) => checks[item.id] === '확인 불가');
    if (!items.length) {
      return Alert.alert('체크리스트 필요', '서버에서 공식 체크리스트를 먼저 불러와야 합니다.');
    }
    if (unresolved.length) {
      return Alert.alert(
        '사용자 확인 필요',
        `Gemini가 판단하지 못한 ${unresolved.length}개 항목을 직접 확인한 뒤 정상, 이상 또는 해당 없음으로 선택해주세요.`,
      );
    }
    const comparable = items.filter((item) => item.verificationMode === 'PHOTO' && item.status !== '확인 불가' && checks[item.id] !== '해당 없음');
    const agreedCount = comparable.filter((item) => checks[item.id] === item.status).length;
    const result: InspectionResult = {
      equipmentId: selected.id,
      inspector: session.name,
      checkedAt: new Date().toISOString(),
      checklist: Object.fromEntries(items.map((item) => [item.label, checks[item.id] ?? '확인 불가'])),
      checklistDetails: items.map((item) => ({ id: item.id, sourceItemId: item.sourceItemId, label: item.label, status: checks[item.id] ?? '확인 불가', aiStatus: item.status, aiConfidence: item.confidence, userOverrodeAi: item.status !== '확인 불가' && checks[item.id] !== item.status, evidenceRegions: item.evidenceRegions, verificationMode: item.verificationMode })),
      aiPhotoQuality: analysis?.photoQuality,
      aiThresholds: analysis?.qualityThresholds,
      aiValidation: { comparedCount: comparable.length, agreedCount, overriddenCount: comparable.length - agreedCount, agreementRate: comparable.length ? agreedCount / comparable.length : null },
      legalBasis: analysis?.legalBasis.versionLabel ?? checklist?.legalBasis.versionLabel,
      aiEquipmentMatch: analysis?.equipmentMatch,
      assistanceNotice: analysis?.assistanceNotice ?? checklist?.assistanceNotice,
      notes,
      mediaUri: media?.uri,
      mediaType: media?.type,
      aiSummary: analysis?.summary,
      measurements: selected.name === '에어컨' ? airConditionerMeasurements.map((entry) => ({ ...entry, value: measurementValues[entry.id]?.trim() || '' })) : [],
    };
    setBusy(true);
    try { await submitInspection(result, accessToken); onComplete(result); navigate('reportDecision'); }
    catch (error) { Alert.alert('저장 실패', error instanceof Error ? error.message : '점검 저장에 실패했습니다.'); }
    finally { setBusy(false); }
  };

  return (
    <Screen>
      <Header title="점검 화면" subtitle={`${selected.floor} · ${selected.name} · ${selected.id}`} onBack={() => navigate('inspectionSelect')} />
      <Card>
        <View style={styles.analysisHeader}><Text style={ui.sectionTitle}>촬영 전 점검표</Text>{loadingChecklist ? <ActivityIndicator /> : <Pill label={`${items.length}개 항목`} tone="neutral" />}</View>
        {checklist ? <Text style={styles.helperText}>{checklist.officialEquipmentType} 기준입니다. 사진으로 볼 항목 {photoItems.length}개, 현장 직접 확인 항목 {manualItems.length}개가 있습니다.</Text> : <Text style={styles.helperText}>서버에서 설비별 점검표를 불러오는 중입니다.</Text>}
        {checklist?.classificationNotice ? <Text style={styles.noticeText}>{checklist.classificationNotice}</Text> : null}
        {photoItems.length ? <View style={styles.guidanceBox}><Text style={styles.analysisTitle}>사진에 꼭 보이면 좋은 항목</Text>{photoItems.slice(0, 5).map((item) => <Text key={item.id} style={styles.guidanceItem}>• {item.label}</Text>)}{photoItems.length > 5 ? <Text style={styles.guidanceItem}>• 외 {photoItems.length - 5}개 항목</Text> : null}</View> : null}
        {checklist ? <Text style={styles.legalMeta}>{checklist.legalBasis.form}{'\n'}{checklist.legalBasis.versionLabel}</Text> : null}
      </Card>
      <View style={ui.gap} />
      <Card>
        <View style={styles.analysisHeader}><Text style={ui.sectionTitle}>체크리스트 확인</Text>{analysis ? <Pill label="AI 판정 반영" tone="warning" /> : <Pill label="촬영 전 확인" tone="neutral" />}</View>
        {!items.length ? <View style={styles.emptyChecklist}><Text style={styles.emptyTitle}>체크리스트 불러오는 중</Text><Text style={styles.emptyBody}>서버 DB의 설비별 점검표를 먼저 표시합니다.</Text></View> : null}
        {items.map((item) => {
          const status = checks[item.id] ?? '확인 불가';
          return (
            <Pressable key={item.id} onPress={() => cycleStatus(item.id)} style={styles.checkRow}>
              <View style={[styles.checkbox, status === '정상' && styles.checkboxChecked, status === '이상' && styles.checkboxDanger, status === '해당 없음' && styles.checkboxNotApplicable]}><Text style={styles.checkmark}>{status === '정상' ? '✓' : status === '이상' ? '!' : status === '해당 없음' ? '－' : '?'}</Text></View>
              <View style={{ flex: 1 }}><Text style={styles.checkText}>{item.label}</Text><Text style={styles.sourceText}>{item.section} · {item.isOfficialItemNumber ? `공식 ${item.sourceItemId}` : `서버 매핑 ID ${item.sourceItemId}`} · {item.inspectionScope} · {item.verificationMode === 'MANUAL' ? '직접 확인 항목' : `AI ${Math.round(item.confidence * 100)}%`}{analysis ? `\n${analysis.legalBasis.versionLabel}` : ''}</Text><Text style={styles.checkReason}>{reasons[item.id]}</Text>{item.status !== '확인 불가' && status !== item.status ? <Text style={styles.overrideText}>AI {item.status} → 사용자 {status}</Text> : null}</View>
              <Pill label={status === '확인 불가' ? '직접 확인' : status} tone={status === '정상' ? 'success' : status === '이상' ? 'danger' : 'warning'} />
            </Pressable>
          );
        })}
        {items.length ? <Text style={styles.reviewHint}>촬영 전에 항목을 먼저 확인하고, 사진 판정 후 항목을 누르면 직접 확인 → 정상 → 이상 → 해당 없음 순서로 변경됩니다.</Text> : null}
      </Card>
      <View style={ui.gap} />
      <Card>
        <Text style={ui.sectionTitle}>인증사진 1장</Text>
        <View style={styles.photoActions}><View style={{ flex: 1 }}><Button label="사진 촬영" onPress={takePhoto} /></View><View style={{ flex: 1 }}><Button label="앨범 선택" onPress={pickMedia} variant="secondary" /></View></View>
        <View style={[styles.uploadBox, { marginTop: 12 }]}><Text style={styles.uploadIcon}>{media ? '✓' : '＋'}</Text><Text style={styles.uploadTitle}>{media ? '인증사진 등록 완료' : '사진을 촬영하거나 선택해주세요'}</Text><Text style={styles.uploadSub}>{media?.uri.split('/').pop() ?? '설비 전체와 표시부가 선명하게 나오도록 촬영'}</Text></View>
        <View style={{ marginTop: 12 }}><Button label={busy ? 'Gemini 자동 판정 중...' : '사진으로 자동 판정'} onPress={runAnalysis} variant="secondary" disabled={busy || !media || loadingChecklist} /></View>
        {analysisError ? <View style={styles.retryBox}><Text style={styles.retryTitle}>Gemini 분석을 완료하지 못했습니다</Text><Text style={styles.retryBody}>{analysisError}</Text><View style={{ marginTop: 10 }}><Button label="같은 사진으로 다시 시도" onPress={runAnalysis} variant="secondary" disabled={busy || !media} /></View><Text style={styles.retryHint}>서버 혼잡 오류는 잠시 후 재시도하면 해결되는 경우가 많습니다. 어둡거나 먼 사진이면 다시 촬영해주세요.</Text></View> : null}
        {analysis && media ? <View style={{ marginTop: 14 }}><Text style={styles.analysisTitle}>AI 판정 근거 영역</Text><View style={[styles.evidenceImageWrap, { aspectRatio: media.aspectRatio }]}><Image source={{ uri: media.uri }} resizeMode="contain" style={StyleSheet.absoluteFill} />{items.flatMap((item) => item.evidenceRegions.map((region, index) => <View key={`${item.id}-${index}`} style={[styles.evidenceBox, { left: `${region.x / 10}%`, top: `${region.y / 10}%`, width: `${region.width / 10}%`, height: `${region.height / 10}%` }]}><Text style={styles.evidenceLabel}>{item.sourceItemId}</Text></View>))}</View><Text style={styles.evidenceHint}>사각형은 Gemini가 정상·이상 판정에 사용한 사진 속 근거 위치입니다.</Text></View> : null}
        {analysis ? <View style={[styles.qualityBox, !analysis.photoQuality.acceptable && styles.qualityRejected]}><View style={styles.analysisHeader}><Text style={styles.analysisTitle}>사진 품질 검사</Text><Pill label={analysis.photoQuality.acceptable ? '분석 가능' : '재촬영 필요'} tone={analysis.photoQuality.acceptable ? 'success' : 'danger'} /></View><Text style={styles.checkReason}>밝기 {analysis.photoQuality.brightness} · 선명도 {analysis.photoQuality.sharpness} · 촬영거리/구도 {analysis.photoQuality.coverage}</Text>{analysis.photoQuality.issues.map((issue) => <Text key={issue} style={styles.issue}>• {issue}</Text>)}{!analysis.photoQuality.acceptable ? <Text style={styles.reviewHint}>{analysis.photoQuality.retakeGuidance}</Text> : null}</View> : null}
        {analysis ? <View style={[styles.analysisBox, !analysis.equipmentMatch && styles.mismatchBox]}><View style={styles.analysisHeader}><Text style={styles.analysisTitle}>설비 식별·AI 보조 결과</Text><Pill label={analysis.equipmentMatch ? '설비 일치' : '설비 확인 필요'} tone={analysis.equipmentMatch ? 'success' : 'danger'} /></View><Text style={styles.legalMeta}>선택: {selected.name} · 사진: {analysis.detectedEquipmentType} · 일치 신뢰도 {Math.round(analysis.matchConfidence * 100)}% (기준 {Math.round(analysis.qualityThresholds.equipmentMatch * 100)}%)</Text><Text style={ui.body}>{analysis.equipmentMatch ? analysis.summary : analysis.mismatchReason}</Text>{analysis.classificationNotice ? <Text style={styles.noticeText}>{analysis.classificationNotice}</Text> : null}{analysis.detectedIssues.map((item) => <Text key={item} style={styles.issue}>• {item}</Text>)}<Text style={styles.legalMeta}>{analysis.legalBasis.form}{'\n'}{analysis.legalBasis.versionLabel}{'\n'}원문 확인일 {analysis.legalBasis.verifiedAt}</Text><Text style={styles.noticeText}>{analysis.assistanceNotice}</Text>{analysis.demo ? <Text style={styles.demoText}>Gemini API 키가 없어 자동 판정하지 않았습니다.</Text> : null}</View> : null}
      </Card>
      <View style={ui.gap} />
      {selected.name === '에어컨' ? <><Card><Text style={ui.sectionTitle}>현장 측정값</Text><Text style={styles.helperText}>아래 값은 사진으로 판정하지 않습니다. 계측기로 직접 측정하고, 제조사 유지관리지침서의 정상범위와 비교해주세요.</Text>{airConditionerMeasurements.map((entry) => <Field key={entry.id} label={`${entry.label} (${entry.unit})`} value={measurementValues[entry.id] ?? ''} onChangeText={(value) => setMeasurementValues((prev) => ({ ...prev, [entry.id]: value }))} placeholder={entry.requiredMethod} keyboardType="decimal-pad" />)}</Card><View style={ui.gap} /></> : null}
      <Card><Field label="특이사항" value={notes} onChangeText={setNotes} placeholder="점검 중 확인한 내용을 입력해주세요" multiline /><Button label={busy ? '저장 중...' : '점검 저장'} onPress={save} disabled={busy} /></Card>
    </Screen>
  );
}

export function ReportDecisionScreen({ navigate, recipientEmail, sendPhotoOnly }: { navigate: Nav; recipientEmail: string; sendPhotoOnly: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await sendPhotoOnly(); navigate('success'); }
    catch (error) { Alert.alert('전송 실패', error instanceof Error ? error.message : '메일 전송에 실패했습니다.'); }
    finally { setBusy(false); }
  };
  return (
    <Screen scroll={false}>
      <View style={styles.centerScreen}><View style={styles.successIcon}><Text style={styles.successIconText}>✓</Text></View><Text style={styles.centerTitle}>점검 저장 완료</Text><Text style={styles.centerBody}>점검 데이터를 바탕으로 보고서를 자동 생성하시겠습니까?{`\n`}수신 이메일: {recipientEmail}</Text><View style={styles.centerButtons}><Button label="가입 이메일로 보고서 생성" onPress={() => navigate('reportTemplate')} /><Button label={busy ? '전송 중...' : '가입 이메일로 사진만 전송'} onPress={send} variant="secondary" disabled={busy} /></View></View>
    </Screen>
  );
}

export function ReportTemplateScreen({ navigate, recipientEmail, sendReport }: { navigate: Nav; recipientEmail: string; sendReport: (template?: { uri: string; name: string; mimeType?: string }) => Promise<void> }) {
  const [template, setTemplate] = useState<{ uri: string; name: string; mimeType?: string }>();
  const [busy, setBusy] = useState(false);
  const pick = async () => { const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] }); if (!result.canceled) setTemplate({ uri: result.assets[0].uri, name: result.assets[0].name, mimeType: result.assets[0].mimeType }); };
  const send = async () => {
    setBusy(true);
    try { await sendReport(template); navigate('success'); }
    catch (error) { Alert.alert('전송 실패', error instanceof Error ? error.message : '메일 전송에 실패했습니다.'); }
    finally { setBusy(false); }
  };
  return (
    <Screen>
      <Header title="보고서 생성" subtitle="보고서 양식이 없어도 기본 양식으로 전송됩니다" onBack={() => navigate('reportDecision')} />
      <Card>
        <Text style={styles.helperText}>완성된 보고서는 가입 이메일 {recipientEmail}(으)로 전송됩니다.</Text>
        <View style={styles.templateRecommendBox}><Text style={styles.templateRecommendBadge}>추천</Text><Text style={styles.templateRecommendTitle}>기본 FIRE CARE 보고서 사용</Text><Text style={styles.templateRecommendBody}>회사 보고서 양식이 없으면 점검자, 설비, 점검표, AI 보조 판정, 현장 측정값, 특이사항을 표 형태로 정리한 기본 보고서가 이메일 본문으로 전송됩니다.</Text></View>
        <Pressable onPress={pick} style={styles.uploadBox}><Text style={styles.uploadIcon}>↑</Text><Text style={styles.uploadTitle}>{template?.name || '회사 양식이 있으면 업로드'}</Text><Text style={styles.uploadSub}>{template ? '선택한 양식은 메일 첨부로 함께 전송됩니다' : '선택 사항 · PDF 또는 DOCX'}</Text></Pressable>
        <View style={{ marginTop: 16 }}><Button label={busy ? '보고서 전송 중...' : template ? '회사 양식 첨부해 가입 이메일 전송' : '기본 보고서로 가입 이메일 전송'} onPress={send} disabled={busy} /></View>
      </Card>
    </Screen>
  );
}

export function SuccessScreen({ navigate }: { navigate: Nav }) {
  return <Screen scroll={false}><View style={styles.centerScreen}><View style={styles.successIcon}><Text style={styles.successIconText}>✓</Text></View><Text style={styles.centerTitle}>처리가 완료되었습니다</Text><Text style={styles.centerBody}>보고서 및 인증 자료 전송 요청이 완료되었습니다.{`\n`}서버 연결 시 Gmail SMTP로 발송됩니다.</Text><View style={styles.centerButtons}><Button label="홈으로" onPress={() => navigate('home')} /></View></View></Screen>;
}

export function AdminScreen({ navigate, equipment, building, buildingId, accessToken }: { navigate: Nav; equipment: Equipment[]; building: string; buildingId: string; accessToken: string }) {
  const total = equipment.reduce((sum, item) => sum + item.count, 0);
  const anomalies = equipment.filter((item) => item.status === '이상').length;
  const scheduled = equipment.filter((item) => item.status === '점검 예정').length;
  const [qualityMetrics, setQualityMetrics] = useState<QualityMetrics>();
  const [workerName, setWorkerName] = useState('');
  const [workerEmail, setWorkerEmail] = useState('');
  const [workerPassword, setWorkerPassword] = useState('');
  const [creatingWorker, setCreatingWorker] = useState(false);
  useEffect(() => { if (buildingId && accessToken) fetchQualityMetrics(buildingId, accessToken).then(setQualityMetrics).catch(() => setQualityMetrics(undefined)); }, [buildingId, accessToken]);
  const addWorker = async () => {
    if (!workerName.trim() || !workerEmail.trim() || workerPassword.length < 8) return Alert.alert('입력 확인', '작업자 이름·이메일과 8자 이상 임시 비밀번호를 입력해주세요.');
    setCreatingWorker(true);
    try { await createWorker(accessToken, { name: workerName, email: workerEmail, password: workerPassword, role: 'worker' }); setWorkerName(''); setWorkerEmail(''); setWorkerPassword(''); Alert.alert('계정 생성 완료', '이 작업자는 현재 회사의 데이터만 볼 수 있습니다.'); }
    catch (error) { Alert.alert('계정 생성 실패', error instanceof Error ? error.message : '서버 설정을 확인해주세요.'); }
    finally { setCreatingWorker(false); }
  };
  return (
    <Screen>
      <Header title="관리자 대시보드" subtitle={building || '건물 미등록'} onBack={() => navigate('home')} />
      <View style={styles.stats}><Card style={styles.statCard}><Text style={styles.statValue}>{total}</Text><Text style={styles.statLabel}>전체 설비</Text></Card><Card style={styles.statCard}><Text style={[styles.statValue, { color: colors.danger }]}>{anomalies}</Text><Text style={styles.statLabel}>특이사항</Text></Card><Card style={styles.statCard}><Text style={[styles.statValue, { color: colors.warning }]}>{scheduled}</Text><Text style={styles.statLabel}>점검 예정</Text></Card></View>
      <Card style={{ marginTop: 14 }}><View style={styles.analysisHeader}><Text style={styles.analysisTitle}>AI 판정 검증</Text><Pill label={qualityMetrics?.agreementRate == null ? '비교 데이터 없음' : `일치율 ${Math.round(qualityMetrics.agreementRate * 100)}%`} tone={qualityMetrics?.agreementRate == null ? 'neutral' : qualityMetrics.agreementRate >= 0.8 ? 'success' : 'warning'} /></View><Text style={ui.body}>사진 판정과 실무자의 최종 선택을 비교합니다.</Text><Text style={styles.legalMeta}>점검 {qualityMetrics?.inspections ?? 0}건 · 비교 {qualityMetrics?.comparedItems ?? 0}항목 · 일치 {qualityMetrics?.agreedItems ?? 0} · 수정 {qualityMetrics?.overriddenItems ?? 0}</Text></Card>
      <Card style={{ marginTop: 14 }}><Text style={ui.sectionTitle}>작업자 계정 생성</Text><Text style={styles.helperText}>관리자가 생성한 계정만 현재 회사에 소속됩니다. 작업자는 설비 조회와 점검 저장만 가능합니다.</Text><Field label="작업자 이름" value={workerName} onChangeText={setWorkerName} /><Field label="로그인 이메일" value={workerEmail} onChangeText={setWorkerEmail} keyboardType="email-address" /><Field label="임시 비밀번호" value={workerPassword} onChangeText={setWorkerPassword} secureTextEntry placeholder="8자 이상" /><Button label={creatingWorker ? '계정 생성 중...' : '작업자 추가'} onPress={addWorker} disabled={creatingWorker} /></Card>
      <Text style={[ui.sectionTitle, { marginTop: 24 }]}>관리 메뉴</Text>
      <Pressable onPress={() => navigate('anomalyList')} style={styles.menuCard}><View style={[styles.menuIcon, { backgroundColor: colors.dangerSoft }]}><Text style={[styles.menuIconText, { color: colors.danger }]}>!</Text></View><View style={{ flex: 1 }}><Text style={styles.menuTitle}>특이사항 리스트</Text><Text style={styles.menuDesc}>층별 이상 항목을 확인합니다.</Text></View><Text style={styles.chevron}>›</Text></Pressable>
      <Pressable onPress={() => navigate('equipment')} style={styles.menuCard}><View style={styles.menuIcon}><Text style={styles.menuIconText}>E</Text></View><View style={{ flex: 1 }}><Text style={styles.menuTitle}>설비 상태 현황</Text><Text style={styles.menuDesc}>전체 설비의 점검 상태를 확인합니다.</Text></View><Text style={styles.chevron}>›</Text></Pressable>
    </Screen>
  );
}

export function AnomalyListScreen({ navigate, equipment }: { navigate: Nav; equipment: Equipment[] }) {
  const floors = Array.from(new Set(equipment.map((item) => item.floor)));
  return <Screen><Header title="특이사항 리스트" subtitle="층별 이상 항목" onBack={() => navigate('admin')} />{!floors.length ? <View style={styles.emptyList}><Text style={styles.emptyTitle}>등록된 층/구역이 없습니다</Text><Text style={styles.emptyBody}>설비를 등록하면 해당 층/구역이 표시됩니다.</Text></View> : null}{floors.map((floor) => { const count = equipment.filter((item) => item.floor === floor && item.status === '이상').length; return <Pressable key={floor} onPress={() => count && navigate('anomalyDetail')} style={styles.menuCard}><View style={styles.floorBadge}><Text style={styles.floorBadgeText}>{floor}</Text></View><View style={{ flex: 1 }}><Text style={styles.menuTitle}>{floor} 특이사항</Text><Text style={styles.menuDesc}>{count ? `${count}건의 확인 항목` : '특이사항 없음'}</Text></View><Text style={styles.chevron}>›</Text></Pressable>; })}</Screen>;
}

export function AnomalyDetailScreen({ navigate }: { navigate: Nav }) {
  return <Screen><Header title="특이사항" subtitle="점검 결과 상세" onBack={() => navigate('anomalyList')} /><View style={styles.emptyList}><Text style={styles.emptyTitle}>저장된 특이사항이 없습니다</Text><Text style={styles.emptyBody}>실제 점검에서 이상으로 저장한 항목만 표시됩니다.</Text></View><Button label="확인 완료" onPress={() => navigate('admin')} /></Screen>;
}

export function ProfileScreen({ session, navigate, onSave }: { session: AppSession; navigate: Nav; onSave: (input: Pick<AppSession, 'name' | 'organization' | 'email'>) => void }) {
  const [name, setName] = useState(session.name); const [org, setOrg] = useState(session.organization); const [email, setEmail] = useState(session.email);
  return <Screen><Header title="내정보 수정" onBack={() => navigate('home')} /><Card><Field label="이름" value={name} onChangeText={setName} /><Field label="소속" value={org} onChangeText={setOrg} /><Field label="보고서 수신 이메일" value={email} onChangeText={setEmail} keyboardType="email-address" /><Button label="저장" onPress={() => { onSave({ name: name.trim(), organization: org.trim(), email: email.trim() }); Alert.alert('저장 완료', '프로필이 저장되었습니다.'); navigate('home'); }} /></Card></Screen>;
}

const styles = StyleSheet.create({
  loginHero: { alignItems: 'center', marginBottom: 26, marginTop: 18 },
  logo: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 18, height: 58, justifyContent: 'center', marginBottom: 12, width: 58 },
  logoText: { color: '#FFF', fontSize: 29, fontWeight: '900' },
  brand: { color: colors.text, fontSize: 24, fontWeight: '900', letterSpacing: 1.2 },
  brandSub: { color: colors.muted, fontSize: 13, marginTop: 6 },
  tabs: { backgroundColor: '#F1F3F8', borderRadius: 14, flexDirection: 'row', marginBottom: 20, padding: 4 },
  tab: { alignItems: 'center', borderRadius: 11, flex: 1, paddingVertical: 11 },
  tabActive: { backgroundColor: '#FFF' },
  tabText: { color: '#7A8291', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: colors.primary, fontWeight: '800' },
  linkButton: { flexDirection: 'row', justifyContent: 'center', marginTop: 18 },
  linkMuted: { color: colors.muted, fontSize: 13 }, link: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  profileHeader: { alignItems: 'center', flexDirection: 'row', marginTop: 8 },
  avatar: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 26, height: 52, justifyContent: 'center', marginRight: 12, width: 52 },
  avatarText: { color: colors.primary, fontSize: 19, fontWeight: '900' },
  profileName: { color: colors.text, fontSize: 18, fontWeight: '800' }, profileRole: { color: colors.muted, fontSize: 12, marginTop: 3 },
  smallButton: { backgroundColor: colors.primarySoft, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }, smallButtonText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  orgRow: { borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, paddingBottom: 18 },
  syncRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }, syncText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  orgLabel: { color: colors.text, fontSize: 14, fontWeight: '700' }, orgName: { color: colors.muted, fontSize: 13 },
  menuCard: { alignItems: 'center', backgroundColor: '#FFF', borderColor: colors.border, borderRadius: 18, borderWidth: 1, flexDirection: 'row', marginBottom: 12, padding: 16 },
  menuIcon: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 14, height: 46, justifyContent: 'center', marginRight: 14, width: 46 },
  menuIconText: { color: colors.primary, fontSize: 18, fontWeight: '900' }, menuTitle: { color: colors.text, fontSize: 15, fontWeight: '800' }, menuDesc: { color: colors.muted, fontSize: 12, marginTop: 4 }, chevron: { color: '#A3AAB6', fontSize: 28 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }, chip: { backgroundColor: '#FFF', borderColor: colors.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 }, chipActive: { backgroundColor: colors.primary, borderColor: colors.primary }, chipText: { color: colors.muted, fontSize: 12, fontWeight: '700' }, chipTextActive: { color: '#FFF' },
  formLabel: { color: colors.text, fontSize: 12, fontWeight: '700', marginBottom: 9 }, helperText: { color: colors.muted, fontSize: 11, lineHeight: 17, marginBottom: 14, marginTop: 5 }, emptyList: { alignItems: 'center', backgroundColor: '#FFF', borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginBottom: 16, padding: 28 }, cardActions: { alignItems: 'flex-end', gap: 10 },
  equipmentCard: { backgroundColor: '#FFF', borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginBottom: 12, padding: 17 }, equipmentTop: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' }, equipmentName: { color: colors.text, fontSize: 16, fontWeight: '800' }, equipmentId: { color: colors.muted, fontSize: 11, marginTop: 4 }, equipmentMeta: { borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingTop: 12 }, metaText: { color: colors.muted, fontSize: 11 },
  checkRow: { alignItems: 'center', borderBottomColor: '#EEF0F4', borderBottomWidth: 1, flexDirection: 'row', gap: 8, paddingVertical: 13 }, checkbox: { alignItems: 'center', backgroundColor: colors.warning, borderColor: colors.warning, borderRadius: 7, borderWidth: 2, height: 24, justifyContent: 'center', marginRight: 4, width: 24 }, checkboxChecked: { backgroundColor: colors.success, borderColor: colors.success }, checkboxDanger: { backgroundColor: colors.danger, borderColor: colors.danger }, checkboxNotApplicable: { backgroundColor: colors.muted, borderColor: colors.muted }, checkmark: { color: '#FFF', fontSize: 15, fontWeight: '900' }, checkText: { color: colors.text, fontSize: 13, fontWeight: '700' }, sourceText: { color: colors.primary, fontSize: 9, fontWeight: '700', lineHeight: 13, marginTop: 4 }, checkReason: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 }, overrideText: { color: colors.danger, fontSize: 10, fontWeight: '800', marginTop: 5 },
  guidanceBox: { backgroundColor: '#F9FAFC', borderColor: colors.border, borderRadius: 12, borderWidth: 1, marginBottom: 12, padding: 12 },
  guidanceItem: { color: colors.text, fontSize: 11, lineHeight: 17, marginTop: 5 },
  emptyChecklist: { alignItems: 'center', backgroundColor: '#F9FAFC', borderRadius: 14, padding: 24 }, emptyTitle: { color: colors.text, fontSize: 14, fontWeight: '800' }, emptyBody: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 7, textAlign: 'center' }, reviewHint: { color: colors.warning, fontSize: 10, lineHeight: 15, marginTop: 12 }, photoActions: { flexDirection: 'row', gap: 10 },
  uploadBox: { alignItems: 'center', backgroundColor: '#FAFBFD', borderColor: '#C9CFD9', borderRadius: 16, borderStyle: 'dashed', borderWidth: 1.5, justifyContent: 'center', minHeight: 150, padding: 18 }, uploadIcon: { color: colors.primary, fontSize: 38, fontWeight: '300' }, uploadTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: 6, textAlign: 'center' }, uploadSub: { color: colors.muted, fontSize: 11, marginTop: 7, textAlign: 'center' },
  templateRecommendBox: { backgroundColor: colors.primarySoft, borderColor: '#BFD0FF', borderRadius: 16, borderWidth: 1, marginBottom: 14, padding: 14 }, templateRecommendBadge: { alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: 999, color: '#FFF', fontSize: 10, fontWeight: '900', marginBottom: 8, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 4 }, templateRecommendTitle: { color: colors.text, fontSize: 14, fontWeight: '900', marginBottom: 6 }, templateRecommendBody: { color: '#475569', fontSize: 11, lineHeight: 17 },
  analysisBox: { backgroundColor: colors.primarySoft, borderRadius: 14, marginTop: 14, padding: 14 }, mismatchBox: { backgroundColor: '#FEF2F2' }, analysisHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 9 }, analysisTitle: { color: colors.text, fontSize: 14, fontWeight: '800' }, legalMeta: { color: colors.primary, fontSize: 10, fontWeight: '700', lineHeight: 15, marginBottom: 8 }, noticeText: { color: '#475569', fontSize: 10, lineHeight: 15, marginTop: 10 }, issue: { color: '#475569', fontSize: 12, marginTop: 7 }, demoText: { color: colors.warning, fontSize: 10, fontWeight: '700', marginTop: 10 }, qualityBox: { backgroundColor: colors.successSoft, borderRadius: 14, marginTop: 14, padding: 14 }, qualityRejected: { backgroundColor: colors.dangerSoft }, evidenceImageWrap: { backgroundColor: '#111827', borderRadius: 14, marginTop: 10, overflow: 'hidden', position: 'relative', width: '100%' }, evidenceBox: { borderColor: '#FFCC00', borderWidth: 3, position: 'absolute' }, evidenceLabel: { alignSelf: 'flex-start', backgroundColor: '#FFCC00', color: '#111827', fontSize: 8, fontWeight: '900', paddingHorizontal: 3, paddingVertical: 1 }, evidenceHint: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 7 },
  retryBox: { backgroundColor: '#FFF7ED', borderColor: '#FDBA74', borderRadius: 14, borderWidth: 1, marginTop: 12, padding: 14 }, retryTitle: { color: '#9A3412', fontSize: 13, fontWeight: '900' }, retryBody: { color: '#9A3412', fontSize: 11, lineHeight: 17, marginTop: 6 }, retryHint: { color: '#B45309', fontSize: 10, lineHeight: 15, marginTop: 9 },
  centerScreen: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 18 }, successIcon: { alignItems: 'center', backgroundColor: colors.successSoft, borderRadius: 42, height: 84, justifyContent: 'center', marginBottom: 22, width: 84 }, successIconText: { color: colors.success, fontSize: 42, fontWeight: '900' }, centerTitle: { color: colors.text, fontSize: 23, fontWeight: '900', textAlign: 'center' }, centerBody: { color: colors.muted, fontSize: 14, lineHeight: 22, marginTop: 12, textAlign: 'center' }, centerButtons: { gap: 11, marginTop: 28, width: '100%' },
  stats: { flexDirection: 'row', gap: 9 }, statCard: { alignItems: 'center', flex: 1, padding: 13 }, statValue: { color: colors.primary, fontSize: 24, fontWeight: '900' }, statLabel: { color: colors.muted, fontSize: 10, marginTop: 5 },
  floorBadge: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 19, height: 38, justifyContent: 'center', marginRight: 14, width: 38 }, floorBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '900' }, anomalyTitle: { color: colors.text, flex: 1, fontSize: 14, fontWeight: '800', marginRight: 10 }, remove: { color: colors.danger, fontSize: 12, fontWeight: '800' },
});
