import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  AdminScreen, AnomalyDetailScreen, AnomalyListScreen, EquipmentScreen, HomeScreen,
  InspectionSelectScreen, InspectionScreen, LoginScreen, ProfileScreen, RegisterScreen,
  ReportDecisionScreen, ReportTemplateScreen, SuccessScreen,
} from './src/screens';
import { AppSession, AuthTokens, Equipment, EquipmentInput, InspectionResult, RegistrationInput, ScreenName } from './src/types';
import {
  AuthResponse, bootstrapWorkspace, fetchEquipment, loginAccount, refreshAccount, registerAccount,
  removeEquipment as removeEquipmentFromServer, saveEquipment, sendBuildingReportEmail, sendInspectionEmail,
} from './src/services/api';

const TOKEN_KEY = 'fire-care-auth-v2';
const emptySession: AppSession = { userId: '', organizationId: '', buildingId: '', role: '작업자', name: '', organization: '', company: '', email: '' };

export default function App() {
  const [screen, setScreen] = useState<ScreenName>('login');
  const [session, setSession] = useState<AppSession>(emptySession);
  const [tokens, setTokens] = useState<AuthTokens>();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment>();
  const [lastInspection, setLastInspection] = useState<InspectionResult>();
  const [storageReady, setStorageReady] = useState(false);
  const [syncState, setSyncState] = useState<'동기화 중' | '동기화 완료' | 'DB 설정 필요' | '로그인 필요'>('로그인 필요');

  const persistTokens = async (next?: AuthTokens) => {
    setTokens(next);
    if (next) await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(next));
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  };

  const applyAuthenticated = async (auth: AuthResponse) => {
    const nextTokens = { accessToken: auth.accessToken, refreshToken: auth.refreshToken, expiresAt: auth.expiresAt };
    await persistTokens(nextTokens);
    const remote = await bootstrapWorkspace(nextTokens.accessToken);
    const building = remote.workspace.buildings.find((item) => item.id === remote.buildingId) ?? remote.workspace.buildings[0];
    setSession({
      userId: remote.workspace.context.userId,
      organizationId: remote.workspace.context.organizationId,
      buildingId: building?.id ?? '',
      role: remote.workspace.context.role === 'admin' ? '관리자' : '작업자',
      name: remote.workspace.context.name,
      organization: remote.workspace.organization,
      company: building?.name ?? '',
      email: remote.workspace.context.email,
    });
    setEquipment(remote.equipment);
    setSyncState('동기화 완료');
    setScreen('home');
  };

  useEffect(() => {
    void (async () => {
      try {
        const saved = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!saved) return;
        const stored = JSON.parse(saved) as AuthTokens;
        setSyncState('동기화 중');
        const auth = await refreshAccount(stored.refreshToken);
        await applyAuthenticated(auth);
      } catch {
        await persistTokens(undefined);
        setSyncState('로그인 필요');
      } finally { setStorageReady(true); }
    })();
  }, []);

  useEffect(() => {
    if (!storageReady || !tokens?.accessToken || !session.buildingId) return;
    let active = true;
    const refresh = async () => {
      try { const remote = await fetchEquipment(session.buildingId, tokens.accessToken); if (active) { setEquipment(remote); setSyncState('동기화 완료'); } }
      catch { if (active) setSyncState('DB 설정 필요'); }
    };
    const timer = setInterval(() => { void refresh(); }, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [session.buildingId, storageReady, tokens?.accessToken]);

  const navigate = (next: ScreenName) => {
    if (next === 'inspection' && !selectedEquipment) return setScreen('equipment');
    if (next === 'admin' && session.role !== '관리자') return setScreen('home');
    setScreen(next);
  };
  const login = async (email: string, password: string) => { setSyncState('동기화 중'); await applyAuthenticated(await loginAccount(email, password)); };
  const register = async (input: RegistrationInput) => { setSyncState('동기화 중'); await applyAuthenticated(await registerAccount(input)); };
  const logout = async () => { await persistTokens(undefined); setSession(emptySession); setEquipment([]); setSelectedEquipment(undefined); setLastInspection(undefined); setSyncState('로그인 필요'); setScreen('login'); };

  const addEquipment = async (input: EquipmentInput) => {
    if (!tokens?.accessToken || !session.buildingId) throw new Error('로그인과 건물 DB 연결이 필요합니다.');
    const created: Equipment = { ...input, id: `EQ-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`, status: '점검 예정' };
    const saved = await saveEquipment(session.buildingId, created, tokens.accessToken);
    setEquipment((prev) => [...prev, saved]); setSyncState('동기화 완료');
  };
  const removeEquipment = async (id: string) => {
    if (!tokens?.accessToken || !session.buildingId) throw new Error('로그인과 건물 DB 연결이 필요합니다.');
    await removeEquipmentFromServer(session.buildingId, id, tokens.accessToken);
    setEquipment((prev) => prev.filter((item) => item.id !== id)); if (selectedEquipment?.id === id) setSelectedEquipment(undefined);
  };

  if (!storageReady) return <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  const accessToken = tokens?.accessToken ?? '';

  switch (screen) {
    case 'register': return <RegisterScreen navigate={navigate} onRegister={register} />;
    case 'home': return <HomeScreen session={session} navigate={navigate} logout={() => { void logout(); }} syncState={syncState} />;
    case 'equipment': return <EquipmentScreen navigate={navigate} onSelect={setSelectedEquipment} equipment={equipment} building={session.company} onAdd={addEquipment} onRemove={removeEquipment} canManage={session.role === '관리자'} />;
    case 'inspectionSelect': return <InspectionSelectScreen navigate={navigate} equipment={equipment} building={session.company} onSelect={(item) => { setSelectedEquipment(item); setScreen('inspection'); }} />;
    case 'inspection': return selectedEquipment ? <InspectionScreen session={session} selected={selectedEquipment} navigate={navigate} onComplete={setLastInspection} accessToken={accessToken} /> : null;
    case 'reportDecision': return <ReportDecisionScreen navigate={navigate} recipientEmail={session.email} sendPhotoOnly={async () => { if (!lastInspection) throw new Error('저장된 점검 결과가 없습니다.'); await sendInspectionEmail({ recipient: session.email, result: lastInspection, accessToken }); }} />;
    case 'reportTemplate': return <ReportTemplateScreen navigate={navigate} recipientEmail={session.email} sendReport={async (template) => { if (!session.buildingId) throw new Error('건물 DB 연결이 필요합니다.'); await sendBuildingReportEmail({ recipient: session.email, buildingId: session.buildingId, template, accessToken }); }} />;
    case 'success': return <SuccessScreen navigate={navigate} />;
    case 'admin': return <AdminScreen navigate={navigate} equipment={equipment} building={session.company} buildingId={session.buildingId} accessToken={accessToken} />;
    case 'anomalyList': return <AnomalyListScreen navigate={navigate} equipment={equipment} />;
    case 'anomalyDetail': return <AnomalyDetailScreen navigate={navigate} />;
    case 'profile': return <ProfileScreen session={session} navigate={navigate} onSave={(next) => setSession((prev) => ({ ...prev, ...next }))} />;
    default: return <LoginScreen onLogin={login} navigate={navigate} />;
  }
}
