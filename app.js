import {
  calculateQuote,
  complexityMap,
  createInitialState,
  getCurrentInput,
  normalizeDraft,
  numberValue,
  stepLabels
} from "./lib/pricing.js";

const elements = {
  tabButtons: document.querySelectorAll("[data-tab-trigger]"),
  tabPanels: document.querySelectorAll("[data-tab-panel]"),
  flowSteps: document.querySelectorAll("[data-step-trigger]"),
  flowPanels: document.querySelectorAll("[data-step-panel]"),
  settingsForm: document.querySelector("#settingsForm"),
  materialTable: document.querySelector("#materialTable"),
  printerTable: document.querySelector("#printerTable"),
  historyList: document.querySelector("#historyList"),
  historySummary: document.querySelector("#historySummary"),
  historySelectAllButton: document.querySelector("#historySelectAllButton"),
  historyClearSelectionButton: document.querySelector("#historyClearSelectionButton"),
  queueSummary: document.querySelector("#queueSummary"),
  costBreakdown: document.querySelector("#costBreakdown"),
  currentProjectSnapshot: document.querySelector("#currentProjectSnapshot"),
  addMaterialButton: document.querySelector("#addMaterialButton"),
  addPrinterButton: document.querySelector("#addPrinterButton"),
  resetDataButton: document.querySelector("#resetDataButton"),
  saveProjectButton: document.querySelector("#saveProjectButton"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  exportQuoteButton: document.querySelector("#exportQuoteButton"),
  prevStepButton: document.querySelector("#prevStepButton"),
  nextStepButton: document.querySelector("#nextStepButton"),
  quoteGoDashboardButton: document.querySelector("#quoteGoDashboardButton"),
  quoteGoHistoryButton: document.querySelector("#quoteGoHistoryButton"),
  decisionBadge: document.querySelector("#decisionBadge"),
  grossCostValue: document.querySelector("#grossCostValue"),
  idealPriceValue: document.querySelector("#idealPriceValue"),
  profitPerPieceValue: document.querySelector("#profitPerPieceValue"),
  totalProfitValue: document.querySelector("#totalProfitValue"),
  realMarginValue: document.querySelector("#realMarginValue"),
  breakEvenValue: document.querySelector("#breakEvenValue"),
  feeValue: document.querySelector("#feeValue"),
  capacityValue: document.querySelector("#capacityValue"),
  quoteSidebarPrice: document.querySelector("#quoteSidebarPrice"),
  quoteSidebarDecision: document.querySelector("#quoteSidebarDecision"),
  quoteSidebarBreakdown: document.querySelector("#quoteSidebarBreakdown"),
  quoteSidebarBreakEven: document.querySelector("#quoteSidebarBreakEven"),
  quoteSidebarProfit: document.querySelector("#quoteSidebarProfit")
};

const draftFieldIds = [
  "projectName",
  "printerId",
  "materialId",
  "complexity",
  "modelWeightG",
  "printTimeHours",
  "quantity",
  "supportEnabled",
  "supportMode",
  "supportValue",
  "postProcessingEnabled",
  "postProcessingHours",
  "paintingEnabled",
  "paintingHours",
  "paintingConsumablesPerPiece",
  "packagingEnabled",
  "marketplaceEnabled",
  "manualDiscountPercent",
  "projectNotes",
  "scenarioFilamentPriceKg",
  "scenarioMarginPercent",
  "scenarioFeePercent"
];

let state = loadState();
let lastCalculation = null;
const pendingTimers = new Map();
const selectedHistoryIds = new Set();

const emptyCalculation = {
  grossCost: 0,
  finalSalePrice: 0,
  profitPerPiece: 0,
  totalProfit: 0,
  realMarginPercent: 0,
  breakEvenPrice: 0,
  marketplaceFeesValue: 0,
  capacityHours: 0,
  isWorthProducing: false,
  input: {
    projectName: "Nenhum projeto em edição",
    quantity: 0,
    complexity: "medium",
    paintingEnabled: false,
    packagingEnabled: false
  },
  printer: { name: "Nenhuma impressora selecionada" },
  material: { name: "Nenhum material selecionado" },
  settingsSnapshot: { marketplaceFeePercent: 0 },
  supportWeightG: 0
};

function loadState() {
  return createInitialState();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const fallbackMessage = `Falha na requisição ${response.status}`;
    let message = fallbackMessage;

    try {
      const payload = await response.json();
      message = payload.error || fallbackMessage;
    } catch {
      message = fallbackMessage;
    }

    throw new Error(message);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json();
}

function schedulePersist(key, action, delay = 350) {
  window.clearTimeout(pendingTimers.get(key));
  const timer = window.setTimeout(async () => {
    pendingTimers.delete(key);
    try {
      await action();
    } catch (error) {
      console.error(error);
      showToast(error.message || "Falha ao salvar no servidor.");
    }
  }, delay);
  pendingTimers.set(key, timer);
}

async function persistNow(key, action) {
  window.clearTimeout(pendingTimers.get(key));
  pendingTimers.delete(key);
  await action();
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function getDraftElement(id) {
  if (id === "projectNotes") {
    return document.querySelector("#projectNotes");
  }
  return document.querySelector(`#${id}`);
}

function renderTabs() {
  elements.tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tabTrigger === state.ui.activeTab);
  });

  elements.tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.tabPanel === state.ui.activeTab);
  });
}

function renderFlowSteps() {
  elements.flowSteps.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.stepTrigger) === state.ui.activeQuoteStep);
  });

  elements.flowPanels.forEach((panel) => {
    panel.classList.toggle("active", Number(panel.dataset.stepPanel) === state.ui.activeQuoteStep);
  });

  elements.prevStepButton.disabled = state.ui.activeQuoteStep === 0;
  elements.nextStepButton.textContent = state.ui.activeQuoteStep === stepLabels.length - 1 ? "Fechar fluxo" : "Avançar etapa";
}

function renderSettings() {
  elements.settingsForm.querySelectorAll("[data-setting]").forEach((input) => {
    input.value = state.settings[input.dataset.setting] ?? "";
  });
}

function renderMaterials() {
  const rows = state.materials.map((material) => `
    <div class="table-row material-row" data-material-id="${material.id}">
      <input class="inline-input" data-field="name" value="${material.name}">
      <input class="inline-input" data-field="priceKg" type="number" min="0" step="0.01" value="${material.priceKg}">
      <input class="inline-input" data-field="wastePercent" type="number" min="0" step="0.1" value="${material.wastePercent}">
      <input class="inline-input" data-field="densityLabel" value="${material.densityLabel || ""}">
      <button class="icon-button" type="button" data-action="remove-material">×</button>
    </div>
  `).join("");

  elements.materialTable.innerHTML = `
    <div class="table-grid">
      <div class="table-row material-row header">
        <div>Material</div>
        <div>R$/kg</div>
        <div>Desperdício %</div>
        <div>Perfil</div>
        <div></div>
      </div>
      ${rows}
    </div>
  `;

  renderQuoteSelectors();
}

function renderPrinters() {
  const rows = state.printers.map((printer) => `
    <div class="table-row printer-row" data-printer-id="${printer.id}">
      <input class="inline-input" data-field="name" value="${printer.name}">
      <input class="inline-input" data-field="powerW" type="number" min="0" step="1" value="${printer.powerW}">
      <input class="inline-input" data-field="value" type="number" min="0" step="0.01" value="${printer.value}">
      <input class="inline-input" data-field="usefulHours" type="number" min="1" step="1" value="${printer.usefulHours}">
      <input class="inline-input" data-field="maintenanceMonthly" type="number" min="0" step="0.01" value="${printer.maintenanceMonthly}">
      <input class="inline-input" data-field="monthlyHours" type="number" min="1" step="1" value="${printer.monthlyHours}">
      <select class="inline-input" data-field="active">
        <option value="true" ${printer.active ? "selected" : ""}>Ativa</option>
        <option value="false" ${!printer.active ? "selected" : ""}>Off</option>
      </select>
      <button class="icon-button" type="button" data-action="remove-printer">×</button>
    </div>
  `).join("");

  elements.printerTable.innerHTML = `
    <div class="table-grid">
      <div class="table-row printer-row header">
        <div>Impressora</div>
        <div>W</div>
        <div>Valor</div>
        <div>Vida útil</div>
        <div>Manut./mês</div>
        <div>Horas/mês</div>
        <div>Status</div>
        <div>Ações</div>
      </div>
      ${rows}
    </div>
  `;

  renderQuoteSelectors();
}

function renderQuoteSelectors() {
  const materialSelect = document.querySelector("#materialId");
  const printerSelect = document.querySelector("#printerId");

  if (materialSelect) {
    materialSelect.innerHTML = state.materials.map((material) => `<option value="${material.id}">${material.name}</option>`).join("");
    materialSelect.value = state.quoteDraft.materialId;
  }

  if (printerSelect) {
    printerSelect.innerHTML = state.printers.map((printer) => `<option value="${printer.id}">${printer.name}</option>`).join("");
    printerSelect.value = state.quoteDraft.printerId;
  }
}

function renderDraft() {
  draftFieldIds.forEach((fieldId) => {
    const element = getDraftElement(fieldId);
    if (!element) {
      return;
    }

    const draftKey = fieldId === "projectNotes" ? "notes" : fieldId;
    const value = state.quoteDraft[draftKey];
    if (element.type === "checkbox") {
      element.checked = Boolean(value);
    } else {
      element.value = value ?? "";
    }
  });

  syncDependentFields();
}

function syncDependentFields() {
  document.querySelectorAll("[data-dependency]").forEach((container) => {
    const control = document.querySelector(`#${container.dataset.dependency}`);
    const enabled = Boolean(control?.checked);
    container.classList.toggle("is-disabled", !enabled);
    container.querySelectorAll("input, select").forEach((field) => {
      field.disabled = !enabled;
    });
  });
}

function hasActiveProjectDraft() {
  const draft = state.quoteDraft;
  return Boolean(
    draft.projectName?.trim() &&
    draft.printerId &&
    draft.materialId &&
    numberValue(draft.quantity) > 0 &&
    numberValue(draft.modelWeightG) > 0 &&
    numberValue(draft.printTimeHours) > 0
  );
}

function renderCalculation(calculation) {
  lastCalculation = calculation;
  elements.grossCostValue.textContent = formatCurrency(calculation.grossCost);
  elements.idealPriceValue.textContent = formatCurrency(calculation.finalSalePrice);
  elements.profitPerPieceValue.textContent = formatCurrency(calculation.profitPerPiece);
  elements.totalProfitValue.textContent = formatCurrency(calculation.totalProfit);
  elements.realMarginValue.textContent = formatPercent(calculation.realMarginPercent);
  elements.breakEvenValue.textContent = formatCurrency(calculation.breakEvenPrice);
  elements.feeValue.textContent = formatCurrency(calculation.marketplaceFeesValue);
  elements.capacityValue.textContent = `${calculation.capacityHours.toFixed(2)} h`;
  elements.decisionBadge.textContent = hasActiveProjectDraft()
    ? (calculation.isWorthProducing ? "Vale a pena produzir" : "Revisar preço ou custo")
    : "Nenhum projeto carregado";
  elements.decisionBadge.className = `decision-badge ${hasActiveProjectDraft() && calculation.isWorthProducing ? "good" : hasActiveProjectDraft() ? "bad" : ""}`;

  const breakdownItems = [
    ["Material", calculation.materialCost],
    ["Energia", calculation.energyCost],
    ["Depreciação", calculation.depreciationCost],
    ["Manutenção", calculation.maintenanceCost],
    ["Mão de obra", calculation.laborCost],
    ["Consumíveis de pintura", calculation.paintingConsumablesCost],
    ["Embalagem", calculation.packagingCost],
    ["Falhas diluídas", calculation.failureCost],
    ["Taxas", calculation.marketplaceFeesValue]
  ];

  elements.costBreakdown.innerHTML = breakdownItems.map(([label, value]) => `
    <div class="breakdown-item">
      <span>${label}</span>
      <strong>${formatCurrency(value)}</strong>
    </div>
  `).join("");

  elements.quoteSidebarPrice.textContent = formatCurrency(calculation.finalSalePrice);
  elements.quoteSidebarDecision.textContent = hasActiveProjectDraft()
    ? (calculation.isWorthProducing
      ? "Margem saudável para seguir com a produção."
      : "Esse pedido merece revisão antes de fechar.")
    : "Abra ou preencha um projeto para ver o fechamento financeiro.";
  elements.quoteSidebarBreakEven.textContent = formatCurrency(calculation.breakEvenPrice);
  elements.quoteSidebarProfit.textContent = formatCurrency(calculation.totalProfit);
  elements.quoteSidebarBreakdown.innerHTML = [
    ["Suporte", calculation.supportWeightG > 0 ? `${calculation.supportWeightG.toFixed(1)} g` : "Não incluso"],
    ["Marketplace", calculation.settingsSnapshot.marketplaceFeePercent > 0 ? formatPercent(calculation.settingsSnapshot.marketplaceFeePercent) : "Venda direta"],
    ["Pintura", calculation.input.paintingEnabled ? "Ativada" : "Desligada"],
    ["Embalagem", calculation.input.packagingEnabled ? "Ativada" : "Desligada"]
  ].map(([label, value]) => `
    <div class="breakdown-item">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");
}

function renderQueueSummary(calculation) {
  const activePrinters = state.printers.filter((printer) => printer.active);
  const pendingByPrinter = state.history.reduce((accumulator, project) => {
    accumulator[project.printerId] = (accumulator[project.printerId] || 0) + numberValue(project.totalPrintHours);
    return accumulator;
  }, {});

  const cards = state.printers.map((printer) => {
    const queuedHours = pendingByPrinter[printer.id] || 0;
    return `
      <article class="queue-card">
        <span>${printer.name}</span>
        <strong>${queuedHours.toFixed(1)} h</strong>
        <small>${(queuedHours / 24).toFixed(1)} dias corridos estimados</small>
        <small>${printer.active ? "Fila salva da farm" : "Impressora inativa"}</small>
      </article>
    `;
  }).join("");

  const farmHours = hasActiveProjectDraft()
    ? (activePrinters.length > 0 ? calculation.totalPrintHours / activePrinters.length : calculation.totalPrintHours)
    : 0;
  const previewLabel = hasActiveProjectDraft() ? "Planejamento do batch atual" : "Sem lote em edição no momento";
  elements.queueSummary.innerHTML = `${cards}
    <article class="queue-card">
      <span>Preview do lote atual</span>
      <strong>${farmHours.toFixed(1)} h</strong>
      <small>Distribuindo entre ${Math.max(1, activePrinters.length)} impressora(s) ativas</small>
      <small>${previewLabel}</small>
    </article>
  `;
}

function renderSnapshot(calculation) {
  if (!hasActiveProjectDraft()) {
    elements.currentProjectSnapshot.innerHTML = `
      <article class="snapshot-item">
        <small>Status</small>
        <strong>Nenhum projeto em edição</strong>
      </article>
      <article class="snapshot-item">
        <small>Ação</small>
        <strong>Preencha o orçamento ou carregue do histórico</strong>
      </article>
    `;
    return;
  }

  const items = [
    ["Projeto", calculation.input.projectName],
    ["Impressora", calculation.printer.name],
    ["Material", calculation.material.name],
    ["Quantidade", `${calculation.input.quantity} un.`],
    ["Tempo total", `${calculation.totalPrintHours.toFixed(2)} h`],
    ["Complexidade", complexityMap[calculation.input.complexity].label]
  ];

  elements.currentProjectSnapshot.innerHTML = items.map(([label, value]) => `
    <article class="snapshot-item">
      <small>${label}</small>
      <strong>${value}</strong>
    </article>
  `).join("");
}

function getSelectedHistoryEntries() {
  return state.history.filter((project) => selectedHistoryIds.has(project.id));
}

function renderHistorySummary() {
  const selectedEntries = getSelectedHistoryEntries();
  const summarySource = selectedEntries.length ? selectedEntries : [];
  const selectedRevenue = summarySource.reduce((total, project) => total + numberValue(project.finalSalePrice), 0);
  const selectedProfit = summarySource.reduce((total, project) => total + numberValue(project.totalProfit), 0);
  const selectedHours = summarySource.reduce((total, project) => total + numberValue(project.totalPrintHours), 0);

  elements.historySummary.innerHTML = `
    <article class="history-summary-card">
      <span>Orçamentos selecionados</span>
      <strong>${selectedEntries.length}</strong>
      <small>${selectedEntries.length ? "Resumo calculado sobre a seleção atual" : "Selecione um ou mais orçamentos abaixo"}</small>
    </article>
    <article class="history-summary-card emphasis">
      <span>Faturamento total</span>
      <strong>${formatCurrency(selectedRevenue)}</strong>
      <small>Soma do preço a cobrar dos selecionados</small>
    </article>
    <article class="history-summary-card success">
      <span>Lucro total</span>
      <strong>${formatCurrency(selectedProfit)}</strong>
      <small>Resultado acumulado da seleção</small>
    </article>
    <article class="history-summary-card">
      <span>Horas de impressão</span>
      <strong>${selectedHours.toFixed(2)} h</strong>
      <small>Capacidade comprometida pelos selecionados</small>
    </article>
  `;
}

function renderHistory() {
  renderHistorySummary();

  if (!state.history.length) {
    elements.historyList.innerHTML = '<div class="muted-empty">Nenhum orçamento salvo ainda.</div>';
    return;
  }

  elements.historyList.innerHTML = state.history.map((project) => `
    <article class="history-item ${selectedHistoryIds.has(project.id) ? "is-selected" : ""}" data-history-id="${project.id}">
      <div class="history-header-row">
        <label class="history-select-label">
          <input type="checkbox" data-action="toggle-history-selection" ${selectedHistoryIds.has(project.id) ? "checked" : ""}>
          <span>Selecionar</span>
        </label>
        <span class="history-saved-at">${new Date(project.savedAt).toLocaleString("pt-BR")}</span>
      </div>
      <div class="history-title-row">
        <div>
          <h3>${project.projectName}</h3>
          <div class="history-meta">
            <span>${project.materialName}</span>
            <span>${project.printerName}</span>
            <span>${project.quantity} un.</span>
          </div>
        </div>
        <div class="history-value-grid">
          <article class="history-value-card emphasis">
            <span>Preço a cobrar</span>
            <strong>${formatCurrency(project.finalSalePrice)}</strong>
          </article>
          <article class="history-value-card success">
            <span>Lucro</span>
            <strong>${formatCurrency(project.totalProfit)}</strong>
          </article>
        </div>
      </div>
      <div class="history-detail-grid">
        <div class="history-detail-item">
          <span>Peso por peça</span>
          <strong>${numberValue(project.rawInput?.modelWeightG).toFixed(1)} g</strong>
        </div>
        <div class="history-detail-item">
          <span>Tempo por peça</span>
          <strong>${numberValue(project.rawInput?.printTimeHours).toFixed(2)} h</strong>
        </div>
        <div class="history-detail-item">
          <span>Tempo total</span>
          <strong>${numberValue(project.totalPrintHours).toFixed(2)} h</strong>
        </div>
        <div class="history-detail-item">
          <span>Custo bruto</span>
          <strong>${formatCurrency(project.grossCost)}</strong>
        </div>
      </div>
      ${project.notes ? `<div class="history-note">${project.notes}</div>` : ""}
      <div class="history-actions">
        <button class="secondary-button" type="button" data-action="load-history">Carregar</button>
        <button class="ghost-button" type="button" data-action="delete-history">Excluir</button>
      </div>
    </article>
  `).join("");
}

function updateCalculation() {
  normalizeDraft(state);
  const calculation = hasActiveProjectDraft()
    ? calculateQuote(getCurrentInput(state), state)
    : emptyCalculation;
  renderCalculation(calculation);
  renderQueueSummary(calculation);
  renderSnapshot(calculation);
  return calculation;
}

function persistAndRender() {
  renderTabs();
  renderFlowSteps();
  renderSettings();
  renderMaterials();
  renderPrinters();
  renderDraft();
  renderHistory();
  updateCalculation();
}

function addMaterial() {
  const material = {
    id: `material-${crypto.randomUUID()}`,
    name: "Novo material",
    priceKg: state.settings.defaultFilamentPriceKg,
    wastePercent: 5,
    densityLabel: "Custom"
  };
  state.materials.push(material);
  normalizeDraft(state);
  persistAndRender();
  api("/api/materials", {
    method: "POST",
    body: JSON.stringify({ material })
  }).catch((error) => {
    console.error(error);
    showToast(error.message || "Falha ao salvar material.");
  });
}

function addPrinter() {
  const printer = {
    id: crypto.randomUUID(),
    name: "Nova impressora",
    powerW: state.settings.defaultPrinterPowerW,
    value: state.settings.defaultPrinterValue,
    usefulHours: state.settings.defaultPrinterUsefulHours,
    maintenanceMonthly: state.settings.defaultMaintenanceMonthly,
    monthlyHours: state.settings.monthlyOperatingHours,
    active: true
  };
  state.printers.push(printer);
  normalizeDraft(state);
  persistAndRender();
  api("/api/printers", {
    method: "POST",
    body: JSON.stringify({ printer })
  }).catch((error) => {
    console.error(error);
    showToast(error.message || "Falha ao salvar impressora.");
  });
}

async function restoreDefaults() {
  try {
    state = normalizeDraft(await api("/api/reset", { method: "POST" }));
    persistAndRender();
    showToast("Banco restaurado para o padrão inicial.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Falha ao restaurar os padrões.");
  }
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2200);
}

function setActiveTab(tabId) {
  state.ui.activeTab = tabId;
  renderTabs();
  schedulePersist("ui", () => api("/api/ui", {
    method: "PUT",
    body: JSON.stringify({ ui: state.ui })
  }));
}

function setActiveStep(stepIndex) {
  state.ui.activeQuoteStep = Math.max(0, Math.min(stepLabels.length - 1, stepIndex));
  renderFlowSteps();
  schedulePersist("ui", () => api("/api/ui", {
    method: "PUT",
    body: JSON.stringify({ ui: state.ui })
  }));
}

async function saveProject() {
  updateCalculation();
  try {
    const entry = await api("/api/quotes", { method: "POST" });
    state.history = [entry, ...state.history];
    renderHistory();
    renderQueueSummary(lastCalculation);
    showToast("Projeto salvo no banco de dados.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Falha ao salvar projeto.");
  }
}

function loadHistoryEntry(entryId) {
  const entry = state.history.find((item) => item.id === entryId);
  if (!entry) {
    return;
  }

  state.quoteDraft = { ...createInitialState().quoteDraft, ...entry.rawInput };
  normalizeDraft(state);
  state.ui.activeTab = "quote";
  state.ui.activeQuoteStep = 3;
  persistAndRender();
  schedulePersist("draft", () => api("/api/draft", {
    method: "PUT",
    body: JSON.stringify({ quoteDraft: state.quoteDraft })
  }));
  schedulePersist("ui", () => api("/api/ui", {
    method: "PUT",
    body: JSON.stringify({ ui: state.ui })
  }));
  showToast("Projeto carregado no fluxo de orçamento.");
}

async function deleteHistoryEntry(entryId) {
  try {
    await api(`/api/quotes/${entryId}`, { method: "DELETE" });
    selectedHistoryIds.delete(entryId);
    state.history = state.history.filter((item) => item.id !== entryId);
    renderHistory();
    updateCalculation();
    showToast("Projeto removido do banco.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Falha ao excluir projeto.");
  }
}

function toggleHistorySelection(entryId) {
  if (selectedHistoryIds.has(entryId)) {
    selectedHistoryIds.delete(entryId);
  } else {
    selectedHistoryIds.add(entryId);
  }
  renderHistory();
}

function selectAllHistory() {
  state.history.forEach((project) => selectedHistoryIds.add(project.id));
  renderHistory();
}

function clearHistorySelection() {
  selectedHistoryIds.clear();
  renderHistory();
}

function exportQuote() {
  const calculation = lastCalculation ?? updateCalculation();
  const template = document.querySelector("#quoteTemplate").textContent;
  const exportText = template
    .replace("{{projectName}}", calculation.input.projectName)
    .replace("{{printerName}}", calculation.printer.name)
    .replace("{{materialName}}", calculation.material.name)
    .replace("{{quantity}}", String(calculation.input.quantity))
    .replace("{{complexityLabel}}", complexityMap[calculation.input.complexity].label)
    .replace("{{grossCost}}", formatCurrency(calculation.grossCost))
    .replace("{{breakEven}}", formatCurrency(calculation.breakEvenPrice))
    .replace("{{idealPrice}}", formatCurrency(calculation.finalSalePrice))
    .replace("{{fees}}", formatCurrency(calculation.marketplaceFeesValue))
    .replace("{{profitPerPiece}}", formatCurrency(calculation.profitPerPiece))
    .replace("{{totalProfit}}", formatCurrency(calculation.totalProfit))
    .replace("{{realMargin}}", formatPercent(calculation.realMarginPercent))
    .replace("{{notes}}", calculation.input.notes || "Sem observações")
    .replace("{{generatedAt}}", new Date().toLocaleString("pt-BR"));

  const blob = new Blob([exportText], { type: "text/plain;charset=utf-8" });
  const fileUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = fileUrl;
  link.download = `${calculation.input.projectName.toLowerCase().replace(/\s+/g, "-") || "orcamento-3d"}.txt`;
  link.click();
  URL.revokeObjectURL(fileUrl);
  showToast("Orçamento exportado.");
}

function handleSettingsChange(event) {
  const settingKey = event.target.dataset.setting;
  if (!settingKey) {
    return;
  }

  state.settings[settingKey] = numberValue(event.target.value);
  schedulePersist("settings", () => api("/api/settings", {
    method: "PUT",
    body: JSON.stringify({ settings: state.settings })
  }));
  updateCalculation();
}

async function saveSettingsNow() {
  try {
    await persistNow("settings", () => api("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ settings: state.settings })
    }));
    showToast("Configurações salvas no banco.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Falha ao salvar configurações.");
  }
}

function handleDraftChange(event) {
  const target = event.target;
  if (!target.id) {
    return;
  }

  const draftKey = target.id === "projectNotes" ? "notes" : target.id;
  if (!Object.prototype.hasOwnProperty.call(state.quoteDraft, draftKey)) {
    return;
  }

  if (target.type === "checkbox") {
    state.quoteDraft[draftKey] = target.checked;
  } else {
    state.quoteDraft[draftKey] = target.value;
  }

  syncDependentFields();
  schedulePersist("draft", () => api("/api/draft", {
    method: "PUT",
    body: JSON.stringify({ quoteDraft: state.quoteDraft })
  }));
  updateCalculation();
}

function handleTableEdit(event) {
  const materialRow = event.target.closest("[data-material-id]");
  if (materialRow) {
    const material = state.materials.find((item) => item.id === materialRow.dataset.materialId);
    if (material && event.target.dataset.field) {
      const field = event.target.dataset.field;
      material[field] = ["priceKg", "wastePercent"].includes(field) ? numberValue(event.target.value) : event.target.value;
      renderQuoteSelectors();
      updateCalculation();
      schedulePersist(`material:${material.id}`, () => api(`/api/materials/${material.id}`, {
        method: "PUT",
        body: JSON.stringify({ material })
      }));
    }
    return;
  }

  const printerRow = event.target.closest("[data-printer-id]");
  if (printerRow) {
    const printer = state.printers.find((item) => item.id === printerRow.dataset.printerId);
    if (printer && event.target.dataset.field) {
      const field = event.target.dataset.field;
      if (field === "active") {
        printer[field] = event.target.value === "true";
      } else if (["powerW", "value", "usefulHours", "maintenanceMonthly", "monthlyHours"].includes(field)) {
        printer[field] = numberValue(event.target.value);
      } else {
        printer[field] = event.target.value;
      }
      renderQuoteSelectors();
      updateCalculation();
      schedulePersist(`printer:${printer.id}`, () => api(`/api/printers/${printer.id}`, {
        method: "PUT",
        body: JSON.stringify({ printer })
      }));
    }
  }
}

async function handleTableClick(event) {
  const action = event.target.dataset.action;
  if (!action) {
    return;
  }

  if (action === "toggle-history-selection") {
    const row = event.target.closest("[data-history-id]");
    if (row) {
      toggleHistorySelection(row.dataset.historyId);
    }
    return;
  }

  if (action === "remove-material") {
    const row = event.target.closest("[data-material-id]");
    if (row && state.materials.length > 1) {
      state.materials = state.materials.filter((item) => item.id !== row.dataset.materialId);
      normalizeDraft(state);
      persistAndRender();
      try {
        await api(`/api/materials/${row.dataset.materialId}`, { method: "DELETE" });
      } catch (error) {
        console.error(error);
        showToast(error.message || "Falha ao excluir material.");
      }
    }
  }

  if (action === "remove-printer") {
    const row = event.target.closest("[data-printer-id]");
    if (row && state.printers.length > 1) {
      state.printers = state.printers.filter((item) => item.id !== row.dataset.printerId);
      normalizeDraft(state);
      persistAndRender();
      try {
        await api(`/api/printers/${row.dataset.printerId}`, { method: "DELETE" });
      } catch (error) {
        console.error(error);
        showToast(error.message || "Falha ao excluir impressora.");
      }
    }
  }

  if (action === "load-history") {
    const row = event.target.closest("[data-history-id]");
    if (row) {
      loadHistoryEntry(row.dataset.historyId);
    }
  }

  if (action === "delete-history") {
    const row = event.target.closest("[data-history-id]");
    if (row) {
      deleteHistoryEntry(row.dataset.historyId);
    }
  }
}

function bindEvents() {
  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => setActiveTab(button.dataset.tabTrigger));
  });

  elements.flowSteps.forEach((button) => {
    button.addEventListener("click", () => setActiveStep(Number(button.dataset.stepTrigger)));
  });

  elements.prevStepButton.addEventListener("click", () => setActiveStep(state.ui.activeQuoteStep - 1));
  elements.nextStepButton.addEventListener("click", () => {
    if (state.ui.activeQuoteStep === stepLabels.length - 1) {
      setActiveTab("dashboard");
      return;
    }
    setActiveStep(state.ui.activeQuoteStep + 1);
  });

  elements.quoteGoDashboardButton.addEventListener("click", () => setActiveTab("dashboard"));
  elements.quoteGoHistoryButton.addEventListener("click", () => setActiveTab("history"));
  elements.settingsForm.addEventListener("input", handleSettingsChange);
  elements.saveSettingsButton.addEventListener("click", saveSettingsNow);

  draftFieldIds.forEach((fieldId) => {
    const element = getDraftElement(fieldId);
    if (!element) {
      return;
    }
    element.addEventListener("input", handleDraftChange);
    element.addEventListener("change", handleDraftChange);
  });

  elements.materialTable.addEventListener("input", handleTableEdit);
  elements.materialTable.addEventListener("click", handleTableClick);
  elements.printerTable.addEventListener("input", handleTableEdit);
  elements.printerTable.addEventListener("change", handleTableEdit);
  elements.printerTable.addEventListener("click", handleTableClick);
  elements.historyList.addEventListener("click", handleTableClick);
  elements.historySelectAllButton.addEventListener("click", selectAllHistory);
  elements.historyClearSelectionButton.addEventListener("click", clearHistorySelection);
  elements.addMaterialButton.addEventListener("click", addMaterial);
  elements.addPrinterButton.addEventListener("click", addPrinter);
  elements.resetDataButton.addEventListener("click", restoreDefaults);
  elements.saveProjectButton.addEventListener("click", saveProject);
  elements.exportQuoteButton.addEventListener("click", exportQuote);
}

function init() {
  return api("/api/bootstrap")
    .then((bootstrapState) => {
      state = normalizeDraft(bootstrapState);
      bindEvents();
      persistAndRender();
    })
    .catch((error) => {
      console.error(error);
      state = createInitialState();
      bindEvents();
      persistAndRender();
      showToast("Falha ao carregar dados do servidor. Usando estado temporário.");
    });
}

await init();
