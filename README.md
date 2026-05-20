# 지역 랜덤 뽑기

서울시청을 기준점으로 두고 전국 후보 지역을 가중치 랜덤으로 뽑는 정적 웹 앱입니다.

## 실행

`index.html` 하나만 브라우저에서 열면 됩니다. CSS, 후보 데이터, 앱 로직은 모두 이 파일 안에 들어 있습니다.

## 현재 규칙

- 후보: 전국 시, 전국 군, 광역시, 세종특별자치시
- 제외: 서울특별시, 지정한 경기도 서울 생활권 도시, 광역시 내부 자치구/군, 제주 행정시
- 기본 상수:
  - 중심 거리: `160km`
  - 근거리 완충: `335km`
  - 원거리 완충: `180km`
  - 광역시/세종 점수: `0.8`

## 확률식

```js
spreadKm = distanceKm < idealDistanceKm ? nearDistanceSpreadKm : distanceSpreadKm
distanceWeight = Math.exp(-Math.abs(distanceKm - idealDistanceKm) / spreadKm)
typeWeight = type === "광역시" || type === "특별자치시" ? metroPenalty : 1
weight = distanceWeight * typeWeight
probability = weight / totalWeight
```

## 좌표

후보 좌표는 현재 `index.html` 안에 들어 있습니다. 기본값은 공개 행정구역 GeoJSON의 경계 좌표에서 후보 단위별 대표점을 계산한 값입니다.

시청/군청 좌표로 바꾸고 싶으면 `index.html`에서 해당 지역의 `lat`, `lng`를 수정하면 됩니다.
