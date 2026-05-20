(function () {
  const DEFAULT_SETTINGS = Object.freeze({
    idealDistanceKm: 160,
    nearDistanceSpreadKm: 335,
    distanceSpreadKm: 180,
    metroPenalty: 0.8,
  });

  const SEOUL_BASE = Object.freeze({
    name: "서울시청",
    lat: 37.5665,
    lng: 126.9780,
  });

  const STORAGE_KEYS = Object.freeze({
    settings: "region-random-picker:settings",
    history: "region-random-picker:history",
  });

  function readStorage(key) {
    try {
      return window.localStorage?.getItem(key);
    } catch {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage?.setItem(key, value);
    } catch {
      // 일부 모바일 파일 뷰어는 localStorage를 막습니다. 저장만 생략하고 앱은 계속 동작합니다.
    }
  }

  const state = {
    settings: loadSettings(),
    scoredRegions: [],
    picked: null,
    history: loadHistory(),
    simulationResults: [],
  };

  const elements = {
    pickButton: document.getElementById("pickButton"),
    runSimulationButton: document.getElementById("runSimulationButton"),
    resetButton: document.getElementById("resetButton"),
    clearHistoryButton: document.getElementById("clearHistoryButton"),
    idealDistanceInput: document.getElementById("idealDistanceInput"),
    nearDistanceSpreadInput: document.getElementById("nearDistanceSpreadInput"),
    distanceSpreadInput: document.getElementById("distanceSpreadInput"),
    metroPenaltyInput: document.getElementById("metroPenaltyInput"),
    resultType: document.getElementById("resultType"),
    resultDistance: document.getElementById("resultDistance"),
    resultProbability: document.getElementById("resultProbability"),
    resultName: document.getElementById("resultName"),
    resultWeight: document.getElementById("resultWeight"),
    resultDistanceWeight: document.getElementById("resultDistanceWeight"),
    resultTypeWeight: document.getElementById("resultTypeWeight"),
    summaryText: document.getElementById("summaryText"),
    candidateCount: document.getElementById("candidateCount"),
    probabilityTotal: document.getElementById("probabilityTotal"),
    totalWeight: document.getElementById("totalWeight"),
    tableBody: document.getElementById("regionTableBody"),
    searchInput: document.getElementById("searchInput"),
    typeFilter: document.getElementById("typeFilter"),
    simulationSummary: document.getElementById("simulationSummary"),
    simulationList: document.getElementById("simulationList"),
    historyList: document.getElementById("historyList"),
    mapCanvas: document.getElementById("mapCanvas"),
  };

  function loadSettings() {
    try {
      const saved = JSON.parse(readStorage(STORAGE_KEYS.settings));
      return {
        idealDistanceKm: Number(saved && saved.idealDistanceKm) || DEFAULT_SETTINGS.idealDistanceKm,
        nearDistanceSpreadKm: Number(saved && saved.nearDistanceSpreadKm) || DEFAULT_SETTINGS.nearDistanceSpreadKm,
        distanceSpreadKm: Number(saved && saved.distanceSpreadKm) || DEFAULT_SETTINGS.distanceSpreadKm,
        metroPenalty: Number(saved && saved.metroPenalty) || DEFAULT_SETTINGS.metroPenalty,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings() {
    writeStorage(STORAGE_KEYS.settings, JSON.stringify(state.settings));
  }

  function loadHistory() {
    try {
      const saved = JSON.parse(readStorage(STORAGE_KEYS.history));
      return Array.isArray(saved) ? saved.slice(0, 20) : [];
    } catch {
      return [];
    }
  }

  function saveHistory() {
    writeStorage(STORAGE_KEYS.history, JSON.stringify(state.history.slice(0, 20)));
  }

  function haversineKm(a, b) {
    const earthRadiusKm = 6371.0088;
    const toRad = (degree) => degree * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const x = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * earthRadiusKm * Math.asin(Math.sqrt(x));
  }

  function distanceWeight(distanceKm) {
    const spreadKm = distanceKm < state.settings.idealDistanceKm
      ? state.settings.nearDistanceSpreadKm
      : state.settings.distanceSpreadKm;
    return Math.exp(-Math.abs(distanceKm - state.settings.idealDistanceKm) / spreadKm);
  }

  function typeWeight(type) {
    return type === "광역시" || type === "특별자치시"
      ? state.settings.metroPenalty
      : 1;
  }

  function scoreRegions() {
    const regions = window.CANDIDATE_REGIONS || [];
    const scored = regions.map((region) => {
      const distanceKm = haversineKm(SEOUL_BASE, region);
      const distanceScore = distanceWeight(distanceKm);
      const typeScore = typeWeight(region.type);
      const weight = distanceScore * typeScore;
      return {
        ...region,
        distanceKm,
        distanceWeight: distanceScore,
        typeWeight: typeScore,
        weight,
      };
    });

    const totalWeight = scored.reduce((sum, region) => sum + region.weight, 0);
    state.scoredRegions = scored
      .map((region) => ({
        ...region,
        probability: region.weight / totalWeight,
        probabilityPercent: region.weight / totalWeight * 100,
      }))
      .sort((a, b) => b.probabilityPercent - a.probabilityPercent);
  }

  function cryptoRandom() {
    if (!window.crypto?.getRandomValues) {
      return Math.random();
    }

    const buffer = new Uint32Array(1);
    window.crypto.getRandomValues(buffer);
    return buffer[0] / 2 ** 32;
  }

  function pickWeightedRandom() {
    const totalWeight = state.scoredRegions.reduce((sum, region) => sum + region.weight, 0);
    let cursor = cryptoRandom() * totalWeight;

    for (const region of state.scoredRegions) {
      cursor -= region.weight;
      if (cursor <= 0) {
        return region;
      }
    }

    return state.scoredRegions[state.scoredRegions.length - 1];
  }

  function formatPercent(value) {
    return `${value.toFixed(3)}%`;
  }

  function formatKm(value) {
    return `${value.toFixed(1)}km`;
  }

  function syncInputs() {
    elements.idealDistanceInput.value = String(state.settings.idealDistanceKm);
    elements.nearDistanceSpreadInput.value = String(state.settings.nearDistanceSpreadKm);
    elements.distanceSpreadInput.value = String(state.settings.distanceSpreadKm);
    elements.metroPenaltyInput.value = String(state.settings.metroPenalty);
  }

  function updateMetrics() {
    const totalProbability = state.scoredRegions.reduce((sum, region) => sum + region.probabilityPercent, 0);
    const totalWeight = state.scoredRegions.reduce((sum, region) => sum + region.weight, 0);
    elements.candidateCount.textContent = String(state.scoredRegions.length);
    elements.probabilityTotal.textContent = `${totalProbability.toFixed(2)}%`;
    elements.totalWeight.textContent = totalWeight.toFixed(3);
    elements.summaryText.textContent = `${SEOUL_BASE.name} 기준 · 후보 ${state.scoredRegions.length}개 · 합계 ${totalProbability.toFixed(2)}%`;
  }

  function updateResult(region) {
    if (!region) {
      return;
    }

    elements.resultType.textContent = region.type;
    elements.resultDistance.textContent = formatKm(region.distanceKm);
    elements.resultProbability.textContent = formatPercent(region.probabilityPercent);
    elements.resultName.textContent = region.fullName;
    elements.resultWeight.textContent = region.weight.toFixed(3);
    elements.resultDistanceWeight.textContent = region.distanceWeight.toFixed(3);
    elements.resultTypeWeight.textContent = region.typeWeight.toFixed(2);
  }

  function filteredRegions() {
    const query = elements.searchInput.value.trim().toLowerCase();
    const type = elements.typeFilter.value;
    return state.scoredRegions.filter((region) => {
      const typeMatch = type === "all" || region.type === type;
      const textMatch = !query
        || region.fullName.toLowerCase().includes(query)
        || region.name.toLowerCase().includes(query)
        || region.province.toLowerCase().includes(query);
      return typeMatch && textMatch;
    });
  }

  function renderTable() {
    const selected = state.picked?.fullName;
    elements.tableBody.innerHTML = filteredRegions().map((region) => {
      const pickedClass = region.fullName === selected ? " class=\"is-picked\"" : "";
      return `
        <tr${pickedClass}>
          <td>${region.fullName}</td>
          <td>${region.type}</td>
          <td>${formatKm(region.distanceKm)}</td>
          <td>${formatPercent(region.probabilityPercent)}</td>
        </tr>
      `;
    }).join("");
  }

  function renderHistory() {
    if (state.history.length === 0) {
      elements.historyList.innerHTML = "<li><strong>기록 없음</strong><span>0회</span></li>";
      return;
    }

    elements.historyList.innerHTML = state.history.map((item) => `
      <li>
        <strong>${item.fullName}</strong>
        <span>${item.type} · ${item.distanceKm.toFixed(1)}km · ${item.probabilityPercent.toFixed(3)}%</span>
      </li>
    `).join("");
  }

  function renderSimulation() {
    if (state.simulationResults.length === 0) {
      elements.simulationSummary.textContent = "아직 실행하지 않았습니다";
      elements.simulationList.innerHTML = "<li><strong>기록 없음</strong><span>100회 실행 전</span></li>";
      return;
    }

    const topCount = state.simulationResults[0].count;
    const topRegions = state.simulationResults
      .filter((item) => item.count === topCount)
      .map((item) => item.region.name)
      .join(", ");
    elements.simulationSummary.textContent = `최다 ${topCount}회 · ${topRegions}`;
    elements.simulationList.innerHTML = state.simulationResults.map((item) => `
      <li>
        <strong>${item.region.fullName}</strong>
        <span>${item.count}회 · ${item.count}% · 기준확률 ${item.region.probabilityPercent.toFixed(3)}%</span>
      </li>
    `).join("");
  }

  function resizeCanvasForDisplay() {
    const canvas = elements.mapCanvas;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(320, Math.floor(rect.width * ratio));
    const height = Math.max(240, Math.floor(rect.height * ratio));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    return { width, height, ratio };
  }

  function drawMap() {
    const canvas = elements.mapCanvas;
    const ctx = canvas.getContext("2d");
    const { width, height, ratio } = resizeCanvasForDisplay();
    const bounds = {
      minLng: 124.4,
      maxLng: 131.3,
      minLat: 33.0,
      maxLat: 39.3,
    };
    const pad = 34 * ratio;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#fbfcfa";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#d8ddd7";
    ctx.lineWidth = 1 * ratio;
    for (let i = 0; i <= 5; i += 1) {
      const x = pad + (width - pad * 2) * i / 5;
      const y = pad + (height - pad * 2) * i / 5;
      ctx.beginPath();
      ctx.moveTo(x, pad);
      ctx.lineTo(x, height - pad);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(width - pad, y);
      ctx.stroke();
    }

    const project = (region) => {
      const x = pad + (region.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng) * (width - pad * 2);
      const y = height - pad - (region.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat) * (height - pad * 2);
      return { x, y };
    };

    const drawPoint = (region, radius, color, stroke) => {
      const point = project(region);
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius * ratio, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (stroke) {
        ctx.lineWidth = 2 * ratio;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }
    };

    state.scoredRegions.forEach((region) => {
      const alpha = Math.min(0.9, Math.max(0.24, region.probabilityPercent / 1.2));
      const color = region.type === "광역시" || region.type === "특별자치시"
        ? `rgba(138, 90, 34, ${alpha})`
        : `rgba(36, 107, 87, ${alpha})`;
      drawPoint(region, 3.4, color);
    });

    drawPoint(SEOUL_BASE, 5.5, "#1d3340", "#ffffff");

    if (state.picked) {
      drawPoint(state.picked, 8, "#d14b3d", "#ffffff");
      const point = project(state.picked);
      ctx.font = `${13 * ratio}px Segoe UI, Malgun Gothic, sans-serif`;
      ctx.fillStyle = "#17211b";
      ctx.fillText(state.picked.name, point.x + 10 * ratio, point.y - 10 * ratio);
    }
  }

  function recalculate() {
    scoreRegions();
    updateMetrics();
    if (state.picked) {
      const refreshed = state.scoredRegions.find((region) => region.fullName === state.picked.fullName);
      state.picked = refreshed || null;
      updateResult(state.picked);
    }
    renderTable();
    drawMap();
  }

  function onPick() {
    const picked = pickWeightedRandom();
    state.picked = picked;
    state.history.unshift({
      fullName: picked.fullName,
      type: picked.type,
      distanceKm: picked.distanceKm,
      probabilityPercent: picked.probabilityPercent,
      pickedAt: new Date().toISOString(),
    });
    state.history = state.history.slice(0, 20);
    saveHistory();
    updateResult(picked);
    renderTable();
    renderHistory();
    drawMap();
  }

  function onRunSimulation() {
    const counts = new Map();

    for (let index = 0; index < 100; index += 1) {
      const picked = pickWeightedRandom();
      const current = counts.get(picked.fullName);
      counts.set(picked.fullName, {
        region: picked,
        count: (current ? current.count : 0) + 1,
      });
    }

    state.simulationResults = Array.from(counts.values())
      .sort((a, b) => b.count - a.count || b.region.probabilityPercent - a.region.probabilityPercent);
    renderSimulation();
  }

  function readSettingsFromInputs() {
    state.settings = {
      idealDistanceKm: Math.max(1, Number(elements.idealDistanceInput.value) || DEFAULT_SETTINGS.idealDistanceKm),
      nearDistanceSpreadKm: Math.max(1, Number(elements.nearDistanceSpreadInput.value) || DEFAULT_SETTINGS.nearDistanceSpreadKm),
      distanceSpreadKm: Math.max(1, Number(elements.distanceSpreadInput.value) || DEFAULT_SETTINGS.distanceSpreadKm),
      metroPenalty: Math.min(1, Math.max(0.1, Number(elements.metroPenaltyInput.value) || DEFAULT_SETTINGS.metroPenalty)),
    };
    syncInputs();
    saveSettings();
    state.simulationResults = [];
    recalculate();
    renderSimulation();
  }

  function bindEvents() {
    elements.pickButton.addEventListener("click", onPick);
    elements.runSimulationButton.addEventListener("click", onRunSimulation);
    elements.resetButton.addEventListener("click", () => {
      state.settings = { ...DEFAULT_SETTINGS };
      syncInputs();
      saveSettings();
      state.simulationResults = [];
      recalculate();
      renderSimulation();
    });
    elements.clearHistoryButton.addEventListener("click", () => {
      state.history = [];
      saveHistory();
      renderHistory();
    });

    [
      elements.idealDistanceInput,
      elements.nearDistanceSpreadInput,
      elements.distanceSpreadInput,
      elements.metroPenaltyInput,
    ].forEach((input) => {
      input.addEventListener("change", readSettingsFromInputs);
      input.addEventListener("blur", readSettingsFromInputs);
    });

    elements.searchInput.addEventListener("input", renderTable);
    elements.typeFilter.addEventListener("change", renderTable);
    window.addEventListener("resize", drawMap);
  }

  function init() {
    syncInputs();
    bindEvents();
    recalculate();
    renderHistory();
    renderSimulation();
  }

  init();
})();
