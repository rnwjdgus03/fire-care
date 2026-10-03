export type Role = '작업자' | '관리자';

export type ScreenName =
  | 'login'
  | 'register'
  | 'home'
  | 'equipment'
  | 'inspectionSelect'
  | 'inspection'
  | 'reportDecision'
  | 'reportTemplate'
  | 'success'
  | 'admin'
  | 'anomalyList'
  | 'anomalyDetail'
  | 'profile';

export type Equipment = {
  id: string;
  name: string;
  floor: string;
  count: number;
  status: '정상' | '점검 예정' | '이상';
  dueDate: string;
};

export type EquipmentInput = Pick<Equipment, 'name' | 'floor' | 'count' | 'dueDate'>;

export type RegistrationInput = {
  name: string;
  organization: string;
  email: string;
  phone: string;
  building: string;
  password: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
};

export type InspectionResult = {
  equipmentId: string;
  inspector: string;
  checkedAt: string;
  checklist: Record<string, '정상' | '이상' | '확인 불가' | '해당 없음'>;
  notes: string;
  mediaUri?: string;
  mediaType?: 'image' | 'video';
  aiSummary?: string;
  aiEquipmentMatch?: boolean;
  assistanceNotice?: string;
  legalBasis?: string;
  checklistDetails?: Array<{
    id: string;
    sourceItemId: string;
    label: string;
    status: '정상' | '이상' | '확인 불가' | '해당 없음';
    aiStatus: '정상' | '이상' | '확인 불가';
    aiConfidence: number;
    userOverrodeAi: boolean;
    evidenceRegions: Array<{ x: number; y: number; width: number; height: number; label: string }>;
    verificationMode: 'PHOTO' | 'MANUAL';
  }>;
  aiPhotoQuality?: {
    acceptable: boolean;
    brightness: string;
    sharpness: string;
    coverage: string;
    issues: string[];
    retakeGuidance: string;
  };
  aiThresholds?: { equipmentMatch: number; itemJudgement: number; evidenceRequired: true };
  aiValidation?: {
    comparedCount: number;
    agreedCount: number;
    overriddenCount: number;
    agreementRate: number | null;
  };
  measurements?: Array<{ id: string; label: string; value: string; unit: string; requiredMethod: string }>;
};

export type AppSession = {
  userId: string;
  organizationId: string;
  buildingId: string;
  role: Role;
  name: string;
  organization: string;
  company: string;
  email: string;
};
