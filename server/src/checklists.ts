export type VerificationMode = 'PHOTO' | 'MANUAL';

export type OfficialChecklistItem = {
  id: string;
  sourceItemId: string;
  isOfficialItemNumber: boolean;
  label: string;
  section: string;
  inspectionScope: '작동·종합점검' | '종합점검' | '성능점검';
  verificationMode: VerificationMode;
};

export type OfficialChecklist = {
  key: string;
  requestedEquipmentType: string;
  officialEquipmentType: string;
  detectionHints: string[];
  classificationNotice?: string;
  assistanceNotice?: string;
  legalBasis: {
    regulation: string;
    noticeNumber: string;
    effectiveDate: string;
    form: string;
    versionLabel: string;
    sourceUrl: string;
    verifiedAt: string;
  };
  items: OfficialChecklistItem[];
};

const legalBasis: OfficialChecklist['legalBasis'] = {
  regulation: '소방시설 자체점검사항 등에 관한 고시',
  noticeNumber: '소방청고시 제2022-71호',
  effectiveDate: '2022-12-01',
  form: '별지 제4호서식 소방시설등 작동점검·종합점검 점검표',
  versionLabel: '소방청고시 제2022-71호 / 시행 2022-12-01',
  sourceUrl: 'https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000216342&chrClsCd=010201',
  verifiedAt: '2026-09-01',
};

const item = (
  sourceItemId: string,
  label: string,
  verificationMode: VerificationMode,
  inspectionScope: OfficialChecklistItem['inspectionScope'] = '작동·종합점검',
  suffix = '',
): OfficialChecklistItem => ({
  id: `${sourceItemId}${suffix}`,
  sourceItemId,
  // The notice groups rows by section but does not publish these server mapping IDs.
  // Keep them clearly marked as internal IDs so the UI never misrepresents them as legal form numbers.
  isOfficialItemNumber: false,
  label,
  section: sourceItemId.startsWith('1-A') ? '소화기구' :
    sourceItemId.startsWith('2-C') ? '가압송수장치(펌프방식)' :
    sourceItemId.startsWith('2-F') ? '함 및 방수구' :
    sourceItemId.startsWith('3-D') ? '폐쇄형 방호구역·유수검지장치' :
    sourceItemId.startsWith('3-E') ? '개방형 방수구역·일제개방밸브' :
    sourceItemId.startsWith('3-F') ? '스프링클러 배관' :
    sourceItemId.startsWith('3-H') ? '스프링클러 헤드' :
    sourceItemId.startsWith('4-A') ? '가스계소화설비' :
    sourceItemId.startsWith('5-A') ? '물분무등소화설비' :
    sourceItemId.startsWith('6-A') ? '경보설비 수신기' :
    sourceItemId.startsWith('6-B') ? '감지기' :
    sourceItemId.startsWith('6-C') ? '발신기·음향장치' :
    sourceItemId.startsWith('7-A') ? '비상방송설비' :
    sourceItemId.startsWith('21-A') ? '유도등' :
    sourceItemId.startsWith('22-A') ? '비상조명등' :
    sourceItemId.startsWith('23-A') ? '소화용수 가압송수장치' :
    sourceItemId.startsWith('24-A') ? '옥외소화전설비' :
    sourceItemId.startsWith('26-A') ? '제연설비' :
    sourceItemId.startsWith('27-A') ? '연결송수관설비' :
    sourceItemId.startsWith('30-A') ? '피난기구' :
    sourceItemId.startsWith('31-A') ? '피난·방화시설' :
    sourceItemId.startsWith('31-B') ? '방화셔터' :
    sourceItemId.startsWith('PAC') ? '패키지 에어컨 성능점검' : '공식 점검항목',
  inspectionScope,
  verificationMode,
});

type ChecklistDefinition = Omit<OfficialChecklist, 'requestedEquipmentType' | 'legalBasis'> & {
  legalBasis?: OfficialChecklist['legalBasis'];
};

const registry: Record<string, ChecklistDefinition> = {
  소화전: {
    key: 'indoor-hydrant',
    officialEquipmentType: '옥내소화전설비',
    detectionHints: ['옥내소화전함', '소방호스', '관창', '소화전 표시', '기동 표시등'],
    items: [
      item('2-F-001', '함 개방 용이성 및 장애물 설치 여부 등 사용 편의성 적정 여부', 'PHOTO'),
      item('2-F-002', '위치·기동 표시등 적정 설치 및 정상 점등 여부', 'PHOTO'),
      item('2-F-003', '“소화전” 표시 및 사용요령 표지판 설치상태 적정 여부', 'PHOTO'),
      item('2-F-004', '대형공간의 소화전 함 설치상태 적정 여부', 'MANUAL', '종합점검'),
      item('2-F-005', '방수구 설치상태 적정 여부', 'MANUAL', '종합점검'),
      item('2-F-006', '함 내 소방호스 및 관창 비치 적정 여부', 'PHOTO'),
      item('2-F-007', '호스 접결상태·구경 및 방수압력 적정 여부', 'MANUAL'),
      item('2-F-008', '호스릴방식 노즐 개폐장치 사용 용이 여부', 'MANUAL', '종합점검'),
    ],
  },
  소화펌프: {
    key: 'indoor-hydrant-pump',
    officialEquipmentType: '옥내소화전설비 가압송수장치(펌프방식)',
    detectionHints: ['소화펌프', '주펌프', '예비펌프', '충압펌프', '압력계', '제어반'],
    items: [
      item('2-C-001', '동결방지조치 상태 적정 여부', 'PHOTO', '종합점검'),
      item('2-C-002', '옥내소화전 방수량 및 방수압력 적정 여부', 'MANUAL'),
      item('2-C-003', '방수압력 초과 조건에서 감압장치 설치 여부', 'MANUAL', '종합점검'),
      item('2-C-004', '성능시험배관을 통한 펌프 성능시험 적정 여부', 'MANUAL'),
      item('2-C-005', '다른 소화설비와 겸용 시 펌프 성능 확보 여부', 'MANUAL', '종합점검'),
      item('2-C-006', '흡입측 연성계·진공계 및 토출측 압력계 등 부속장치의 변형·손상 유무', 'PHOTO'),
      item('2-C-007', '기동장치 설치 및 기동압력 설정 적정 여부', 'MANUAL', '종합점검'),
      item('2-C-008', '기동스위치 설치 적정 여부(ON/OFF 방식)', 'PHOTO'),
      item('2-C-009', '주펌프와 동등 이상인 펌프의 추가 설치 여부', 'MANUAL', '종합점검'),
      item('2-C-010', '물올림장치 설치상태 적정 여부', 'MANUAL', '종합점검'),
      item('2-C-011', '충압펌프의 토출압력·정격토출량 적정 여부', 'MANUAL', '종합점검'),
      item('2-C-012', '내연기관 방식 펌프의 기동장치·제어반·축전지·연료 상태 적정 여부', 'MANUAL'),
      item('2-C-013', '가압송수장치의 “옥내소화전펌프” 표지 설치 여부', 'PHOTO'),
    ],
  },
  급수펌프: {
    key: 'fire-water-supply-pump',
    officialEquipmentType: '소화용수설비 가압송수장치',
    detectionHints: ['소화용수설비펌프', '채수구', '가압송수장치', '토출측 압력계', '성능시험배관'],
    classificationNotice: '일반 생활용 급수펌프는 소방시설 점검표 대상이 아닙니다. 사진과 명판에서 소화용수설비 계통임이 확인되어야 합니다.',
    items: [
      item('23-A-031', '기동스위치가 채수구 직근에 설치되고 정상 작동하는지 여부', 'MANUAL'),
      item('23-A-032', '“소화용수설비펌프” 표지 설치상태 적정 여부', 'PHOTO'),
      item('23-A-033', '동결방지조치 상태 적정 여부', 'PHOTO', '종합점검'),
      item('23-A-034', '토출측 압력계 및 흡입측 연성계·진공계 설치 여부', 'PHOTO', '종합점검'),
      item('23-A-035', '성능시험배관 설치 및 정상 작동 여부', 'MANUAL'),
      item('23-A-036', '순환배관 설치 적정 여부', 'MANUAL'),
      item('23-A-037', '물올림장치 설치상태 적정 여부', 'MANUAL', '종합점검'),
      item('23-A-038', '내연기관 방식 펌프의 기동·표시·축전지 설비 적정 여부', 'MANUAL'),
    ],
  },
  '스프링클러 밸브': {
    key: 'sprinkler-valve',
    officialEquipmentType: '스프링클러설비 유수검지장치·급수배관',
    detectionHints: ['스프링클러 알람밸브', '유수검지장치', '일제개방밸브', '개폐표시형 밸브', '압력스위치'],
    items: [
      item('3-D-001', '방호구역 적정 여부', 'MANUAL', '종합점검'),
      item('3-D-002', '유수검지장치의 수량·접근성·점검 편의성·높이 적정 여부', 'MANUAL', '종합점검'),
      item('3-D-003', '유수검지장치실의 구획·출입문·표지 설치상태 적정 여부', 'PHOTO'),
      item('3-D-004', '자연낙차 유수압력과 유수검지압력 적정 여부', 'MANUAL', '종합점검'),
      item('3-D-005', '조기반응형헤드에 적합한 유수검지장치 설치 여부', 'MANUAL', '종합점검'),
      item('3-E-001', '개방형스프링클러 방수구역 적정 여부', 'MANUAL', '종합점검'),
      item('3-E-002', '방수구역별 일제개방밸브 설치 여부', 'MANUAL', '종합점검'),
      item('3-E-003', '하나의 방수구역을 담당하는 헤드 개수 적정 여부', 'MANUAL', '종합점검'),
      item('3-E-004', '일제개방밸브실의 구획·높이·출입문·표지 적정 여부', 'PHOTO'),
      item('3-F-001', '펌프 흡입측 배관 여과장치 상태 적정 여부', 'MANUAL', '종합점검'),
      item('3-F-002', '성능시험배관의 밸브·유량측정장치 설치상태 적정 여부', 'MANUAL', '종합점검'),
      item('3-F-003', '순환배관과 릴리프밸브 설치상태 적정 여부', 'MANUAL', '종합점검'),
      item('3-F-004', '배관 동결방지조치 상태 적정 여부', 'PHOTO', '종합점검'),
      item('3-F-005', '급수배관 개폐밸브 및 작동표시스위치 설치·작동 적정 여부', 'MANUAL'),
      item('3-F-006', '2차측 배관 부대설비와 압력스위치 설치·감시 적정 여부', 'MANUAL'),
      item('3-F-007', '유수검지장치 시험장치 설치상태 적정 여부', 'PHOTO'),
      item('3-F-008', '주차장 스프링클러 방식 적정 여부', 'MANUAL', '종합점검'),
    ],
  },
  소화기: {
    key: 'fire-extinguisher',
    officialEquipmentType: '소화기구(소화기)',
    detectionHints: ['분말소화기', '소화기 용기', '안전핀', '호스', '지시압력계', '검정표시'],
    items: [
      item('1-A-001', '손쉽게 사용할 수 있는 장소에 설치되어 있는지 여부', 'PHOTO'),
      item('1-A-002', '설치높이 적정 여부', 'MANUAL'),
      item('1-A-003', '배치거리 적정 여부', 'MANUAL'),
      item('1-A-004', '구획된 거실마다 소화기 설치 여부', 'MANUAL'),
      item('1-A-005', '소화기 표지 설치상태 적정 여부', 'PHOTO'),
      item('1-A-006', '소화기의 변형·손상 또는 부식 등 외관 이상 여부', 'PHOTO'),
      item('1-A-007', '지시압력계가 녹색 범위에 있는지 여부', 'PHOTO'),
      item('1-A-008', '수동식 분말소화기 내용연수(10년) 적정 여부', 'PHOTO'),
      item('1-A-009', '설치수량 적정 여부', 'MANUAL', '종합점검'),
      item('1-A-010', '설치장소에 적응성 있는 소화약제 사용 여부', 'MANUAL', '종합점검'),
    ],
  },
  유도등: {
    key: 'exit-light',
    officialEquipmentType: '유도등 및 유도표지',
    detectionHints: ['피난구유도등', '통로유도등', '비상구 그림표지', '점등 표시'],
    items: [
      item('21-A-001', '유도등의 변형 및 손상 여부', 'PHOTO'),
      item('21-A-002', '상시 점등 여부', 'PHOTO'),
      item('21-A-003', '설치 높이·위치·장애물에 따른 시각장애 여부', 'PHOTO'),
      item('21-A-004', '비상전원 성능 및 상용전원 차단 시 자동전환 여부', 'MANUAL'),
      item('21-A-005', '설치 장소(위치) 적정 여부', 'MANUAL', '종합점검'),
      item('21-A-006', '설치 높이 적정 여부', 'MANUAL', '종합점검'),
      item('21-A-007', '객석유도등 설치 개수 적정 여부', 'MANUAL', '종합점검'),
    ],
  },
  방화문: {
    key: 'fire-door',
    officialEquipmentType: '피난·방화시설(방화문)',
    detectionHints: ['방화문', '도어클로저', '방화문 표지', '문틀', '폐쇄장치'],
    items: [
      item('31-A-001', '방화문의 폐쇄·훼손·변경 등 외관 관리상태', 'PHOTO', '작동·종합점검', '-외관'),
      item('31-A-001', '방화문의 자동폐쇄 및 정상 기능 적정 여부', 'MANUAL', '작동·종합점검', '-기능'),
      item('31-A-002', '비상구·피난통로 및 방화문 주변 장애물 적치 여부', 'PHOTO', '종합점검'),
    ],
  },
  자동화재탐지설비: {
    key: 'automatic-fire-alarm',
    officialEquipmentType: '자동화재탐지설비 및 시각경보장치',
    detectionHints: ['수신기', '감지기', '발신기', '경종', '시각경보장치', '화재표시등'],
    items: [
      item('6-A-001', '수신기 설치장소 접근성 및 관리상태 적정 여부', 'PHOTO'),
      item('6-A-002', '수신기 스위치 정상 위치 및 표시 상태 적정 여부', 'PHOTO'),
      item('6-A-003', '상용전원 공급 및 전원표시등 정상 점등 여부', 'PHOTO'),
      item('6-A-004', '예비전원 축전지 상태 및 자동전환 기능 적정 여부', 'MANUAL'),
      item('6-A-005', '경계구역 표시와 회선별 표시상태 적정 여부', 'PHOTO', '종합점검'),
      item('6-B-001', '감지기의 변형·손상·탈락 또는 오염 여부', 'PHOTO'),
      item('6-B-002', '감지기 설치 위치와 살수·공조·장애물 영향 여부', 'PHOTO', '종합점검'),
      item('6-B-003', '감지기 작동시험 및 수신기 화재표시 연동 여부', 'MANUAL'),
      item('6-C-001', '발신기 변형·손상 및 위치표시등 정상 점등 여부', 'PHOTO'),
      item('6-C-002', '음향장치 변형·손상 및 경보음 작동 여부', 'MANUAL'),
      item('6-C-003', '시각경보장치 변형·손상 및 작동 여부', 'MANUAL'),
      item('6-C-004', '배선 단선·단락·접지 및 회로 상태 적정 여부', 'MANUAL', '종합점검'),
    ],
  },
  '스프링클러 헤드': {
    key: 'sprinkler-head',
    officialEquipmentType: '스프링클러설비 헤드',
    detectionHints: ['스프링클러 헤드', '헤드 보호캡', '살수반경', '천장 헤드', '차폐판'],
    items: [
      item('3-H-001', '헤드 변형·손상·부식 또는 페인트 도장 여부', 'PHOTO'),
      item('3-H-002', '헤드 감열부 오염·이물질 부착 여부', 'PHOTO'),
      item('3-H-003', '헤드 주변 살수장애 물건 또는 칸막이 설치 여부', 'PHOTO'),
      item('3-H-004', '헤드 설치 방향과 천장 마감 상태 적정 여부', 'PHOTO'),
      item('3-H-005', '폐쇄형 헤드 예비품 및 전용 렌치 비치 여부', 'PHOTO', '종합점검'),
      item('3-H-006', '헤드 설치 간격·수량 및 방호면적 적정 여부', 'MANUAL', '종합점검'),
      item('3-H-007', '헤드 표시온도와 설치장소 온도 조건 적정 여부', 'MANUAL', '종합점검'),
      item('3-H-008', '동파 우려 장소의 헤드·배관 보온 조치 적정 여부', 'PHOTO', '종합점검'),
    ],
  },
  비상방송설비: {
    key: 'emergency-broadcast',
    officialEquipmentType: '비상방송설비',
    detectionHints: ['비상방송 앰프', '방송 조작부', '스피커', '확성기', '비상방송 표시'],
    items: [
      item('7-A-001', '비상방송 조작부 설치장소 및 접근성 적정 여부', 'PHOTO'),
      item('7-A-002', '조작부 전원표시 및 상태표시 정상 여부', 'PHOTO'),
      item('7-A-003', '층별 또는 구역별 방송 표시 상태 적정 여부', 'PHOTO'),
      item('7-A-004', '확성기 설치 위치와 외관 손상 여부', 'PHOTO'),
      item('7-A-005', '확성기 음량 및 명료도 적정 여부', 'MANUAL'),
      item('7-A-006', '화재신호 수신 시 자동방송 연동 여부', 'MANUAL'),
      item('7-A-007', '비상전원 전환 및 방송 지속 기능 적정 여부', 'MANUAL'),
      item('7-A-008', '배선 회로와 구역별 단락보호 상태 적정 여부', 'MANUAL', '종합점검'),
    ],
  },
  옥외소화전: {
    key: 'outdoor-hydrant',
    officialEquipmentType: '옥외소화전설비',
    detectionHints: ['옥외소화전', '옥외소화전함', '소방호스', '관창', '표지판'],
    items: [
      item('24-A-001', '옥외소화전 위치표시 및 표지 설치상태 적정 여부', 'PHOTO'),
      item('24-A-002', '소화전 주변 접근 장애물 및 사용 공간 확보 여부', 'PHOTO'),
      item('24-A-003', '옥외소화전함 외관 변형·손상·부식 여부', 'PHOTO'),
      item('24-A-004', '함 내 호스·관창·개폐기구 비치 적정 여부', 'PHOTO'),
      item('24-A-005', '방수구 연결부와 캡 체결상태 적정 여부', 'PHOTO'),
      item('24-A-006', '동결방지조치 상태 적정 여부', 'PHOTO', '종합점검'),
      item('24-A-007', '방수압력 및 방수량 적정 여부', 'MANUAL'),
      item('24-A-008', '가압송수장치 기동 및 연동 상태 적정 여부', 'MANUAL'),
    ],
  },
  제연설비: {
    key: 'smoke-control',
    officialEquipmentType: '제연설비',
    detectionHints: ['제연댐퍼', '급기구', '배기구', '제연팬', '차압계', '제연 제어반'],
    items: [
      item('26-A-001', '제연 제어반 설치상태와 표시등 상태 적정 여부', 'PHOTO'),
      item('26-A-002', '급기구·배기구 외관 손상 및 폐쇄 여부', 'PHOTO'),
      item('26-A-003', '제연구역 출입문 및 방연풍속 확보 장애 여부', 'PHOTO', '종합점검'),
      item('26-A-004', '댐퍼 외관 손상·폐쇄·고착 의심 여부', 'PHOTO'),
      item('26-A-005', '제연팬 외관·벨트·방진 상태 적정 여부', 'PHOTO', '종합점검'),
      item('26-A-006', '화재신호에 따른 팬·댐퍼 자동기동 및 연동 여부', 'MANUAL'),
      item('26-A-007', '차압·풍량·방연풍속 측정값 적정 여부', 'MANUAL', '종합점검'),
      item('26-A-008', '비상전원 공급 및 수동조작 기능 적정 여부', 'MANUAL'),
    ],
  },
  피난기구: {
    key: 'evacuation-appliance',
    officialEquipmentType: '피난기구',
    detectionHints: ['완강기', '구조대', '피난사다리', '피난기구 표지', '고정고리'],
    items: [
      item('30-A-001', '피난기구 설치장소 표지 및 사용방법 표시 여부', 'PHOTO'),
      item('30-A-002', '피난기구 접근 장애물 및 피난동선 확보 여부', 'PHOTO'),
      item('30-A-003', '완강기 본체·로프·후크 외관 손상 여부', 'PHOTO'),
      item('30-A-004', '고정고리·지지대 설치상태 적정 여부', 'PHOTO'),
      item('30-A-005', '개구부 크기와 개방상태 적정 여부', 'MANUAL', '종합점검'),
      item('30-A-006', '하강 공간 장애물 및 착지 지점 안전성 여부', 'MANUAL', '종합점검'),
      item('30-A-007', '피난기구 작동시험 및 전개상태 적정 여부', 'MANUAL'),
      item('30-A-008', '설치 개수와 적응성 적정 여부', 'MANUAL', '종합점검'),
    ],
  },
  비상조명등: {
    key: 'emergency-lighting',
    officialEquipmentType: '비상조명등 및 휴대용비상조명등',
    detectionHints: ['비상조명등', '휴대용비상조명등', '충전 표시등', '비상등'],
    items: [
      item('22-A-001', '비상조명등 외관 변형·손상 여부', 'PHOTO'),
      item('22-A-002', '설치 위치와 피난동선 조도 확보 장애 여부', 'PHOTO'),
      item('22-A-003', '상용전원 표시 및 충전상태 적정 여부', 'PHOTO'),
      item('22-A-004', '상용전원 차단 시 자동점등 여부', 'MANUAL'),
      item('22-A-005', '예비전원 용량 및 점등 지속시간 적정 여부', 'MANUAL'),
      item('22-A-006', '휴대용비상조명등 비치 위치와 수량 적정 여부', 'PHOTO', '종합점검'),
      item('22-A-007', '휴대용비상조명등 탈착 및 점등 기능 적정 여부', 'MANUAL'),
    ],
  },
  방화셔터: {
    key: 'fire-shutter',
    officialEquipmentType: '피난·방화시설(방화셔터)',
    detectionHints: ['방화셔터', '셔터 가이드레일', '폐쇄장치', '연동제어기', '감지기'],
    items: [
      item('31-B-001', '방화셔터 외관 변형·손상 및 레일 이탈 여부', 'PHOTO'),
      item('31-B-002', '셔터 하강 구간 장애물 적치 여부', 'PHOTO'),
      item('31-B-003', '연동제어기와 수동조작장치 설치상태 적정 여부', 'PHOTO'),
      item('31-B-004', '감지기 또는 화재신호에 따른 자동폐쇄 여부', 'MANUAL'),
      item('31-B-005', '폐쇄 후 방화구획 형성 및 틈새 상태 적정 여부', 'MANUAL'),
      item('31-B-006', '피난용 출입구 또는 유도표지 상태 적정 여부', 'PHOTO', '종합점검'),
      item('31-B-007', '예비전원 및 수동 복구 기능 적정 여부', 'MANUAL'),
    ],
  },
  에어컨: {
    key: 'package-air-conditioner',
    officialEquipmentType: '패키지 에어컨(실내기·실외기)',
    detectionHints: ['에어컨 실내기', '에어컨 실외기', '냉매배관', '응축수 배관', '실외기 고정대'],
    classificationNotice: '기계설비 유지관리기준의 법정 적용 여부는 건축물 규모와 설비 유형에 따라 달라집니다. 일반 가정용 에어컨까지 일률적으로 법정 성능점검 대상이 되는 것은 아닙니다.',
    assistanceNotice: '이 결과는 패키지 에어컨의 사진 기반 유지관리·성능점검 보조 정보이며, 기계설비법상 성능점검 완료 또는 적합 판정을 의미하지 않습니다. 적용 대상 여부와 최종 결과는 기계설비유지관리자가 확인해야 합니다.',
    legalBasis: {
      regulation: '기계설비 유지관리기준',
      noticeNumber: '국토교통부고시 제2023-695호',
      effectiveDate: '2023-11-29',
      form: '별지 제3호서식 패키지 에어컨 성능점검표(12쪽)',
      versionLabel: '국토교통부고시 제2023-695호 / 시행 2023-11-29',
      sourceUrl: 'https://law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000232392',
      verifiedAt: '2026-09-01',
    },
    items: [
      item('PAC-01', '유지관리 점검표 확인', 'MANUAL', '성능점검'),
      item('PAC-02', '실내기 및 실외기 소음 상태', 'MANUAL', '성능점검'),
      item('PAC-03', '실외기 고정 상태', 'PHOTO', '성능점검'),
      item('PAC-04', '과열차단기 작동 상태', 'MANUAL', '성능점검'),
      item('PAC-05', '필터 오염상태', 'PHOTO', '성능점검'),
    ],
  },
};

export const supportedEquipmentTypes = Object.keys(registry);

export function getOfficialChecklist(equipmentType: string): OfficialChecklist {
  const normalized = equipmentType.trim();
  const definition = registry[normalized];
  if (!definition) throw new Error(`공식 점검표가 등록되지 않은 설비 종류입니다: ${normalized || '(없음)'}`);
  const { legalBasis: customLegalBasis, ...rest } = definition;
  return { ...rest, requestedEquipmentType: normalized, legalBasis: customLegalBasis ?? legalBasis, items: definition.items.map((entry) => ({ ...entry })) };
}
