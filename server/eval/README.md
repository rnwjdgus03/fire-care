# Gemini 사진 판정 평가 데이터

실제 현장 사진은 저장소에 올리지 않고 별도 폴더에 보관합니다. 설비명 아래에 촬영 조건 폴더를 만들고 사진을 넣습니다.

```text
평가사진/
  에어컨/
    valid/
    dark/
    blurred/
    far/
    cropped/
    wrong-equipment/
```

- `valid`: 밝기·초점·거리·구도가 적정하고 선택 설비와 일치
- `dark`, `blurred`, `far`, `cropped`: 품질 검사에서 거부되어야 함
- `wrong-equipment`: 품질은 통과할 수 있지만 설비 일치는 거부되어야 함

Gemini 키를 설정하고 서버 폴더에서 실행합니다.

```bash
npm run eval:vision -- "/평가사진/절대경로"
```

평가 스크립트는 원본을 임시 폴더로 복사한 뒤 분석하며 원본 사진을 삭제하지 않습니다.
