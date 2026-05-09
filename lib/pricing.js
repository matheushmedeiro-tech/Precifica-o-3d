export const defaultState = {
  settings: {
    defaultFilamentPriceKg: 95,
    defaultPrinterPowerW: 130,
    energyCostKwh: 0.95,
    defaultPrinterValue: 2800,
    defaultPrinterUsefulHours: 5000,
    defaultMaintenanceMonthly: 180,
    monthlyOperatingHours: 160,
    failureRatePercent: 8,
    packagingCostPerOrder: 4.5,
    marketplaceFeePercent: 12,
    desiredMarginPercent: 35,
    laborHourCost: 30,
    setupMinutesPerOrder: 20,
    complexityLowPercent: 0,
    complexityMediumPercent: 8,
    complexityHighPercent: 18
  },
  materials: [
    { id: "pla", name: "PLA", priceKg: 95, wastePercent: 4, densityLabel: "Padrão" },
    { id: "petg", name: "PETG", priceKg: 118, wastePercent: 5, densityLabel: "Resistente" },
    { id: "abs", name: "ABS", priceKg: 130, wastePercent: 7, densityLabel: "Técnico" },
    { id: "tpu", name: "TPU", priceKg: 185, wastePercent: 8, densityLabel: "Flexível" }
  ],
  printers: [
    {
      id: "printer-farm-a-ender-3-s1",
      name: "Farm A - Ender 3 S1",
      powerW: 130,
      value: 2800,
      usefulHours: 5000,
      maintenanceMonthly: 180,
      monthlyHours: 160,
      active: true
    },
    {
      id: "printer-farm-b-corexy",
      name: "Farm B - CoreXY",
      powerW: 220,
      value: 6200,
      usefulHours: 6500,
      maintenanceMonthly: 320,
      monthlyHours: 200,
      active: true
    }
  ],
  quoteDraft: {
    projectName: "",
    printerId: "",
    materialId: "",
    complexity: "medium",
    modelWeightG: 120,
    printTimeHours: 6.5,
    quantity: 1,
    supportEnabled: true,
    supportMode: "percent",
    supportValue: 8,
    postProcessingEnabled: false,
    postProcessingHours: 0.4,
    paintingEnabled: false,
    paintingHours: 0.5,
    paintingConsumablesPerPiece: 5,
    packagingEnabled: true,
    marketplaceEnabled: true,
    manualDiscountPercent: 0,
    notes: "",
    scenarioFilamentPriceKg: "",
    scenarioMarginPercent: "",
    scenarioFeePercent: ""
  },
  ui: {
    activeTab: "dashboard",
    activeQuoteStep: 0
  }
};

export const complexityMap = {
  low: { label: "Baixa", settingKey: "complexityLowPercent" },
  medium: { label: "Média", settingKey: "complexityMediumPercent" },
  high: { label: "Alta", settingKey: "complexityHighPercent" }
};

export const stepLabels = ["Projeto", "Produção", "Opcionais", "Fechamento"];

export function createInitialState() {
  const nextState = structuredClone(defaultState);
  nextState.quoteDraft.printerId = nextState.printers[0]?.id || "";
  nextState.quoteDraft.materialId = nextState.materials[0]?.id || "";
  return nextState;
}

export function numberValue(input, fallback = 0) {
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function optionalNumberValue(input) {
  if (input === "" || input === null || input === undefined) {
    return null;
  }

  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeDraft(state) {
  if (!state.printers.some((printer) => printer.id === state.quoteDraft.printerId)) {
    state.quoteDraft.printerId = state.printers[0]?.id || "";
  }

  if (!state.materials.some((material) => material.id === state.quoteDraft.materialId)) {
    state.quoteDraft.materialId = state.materials[0]?.id || "";
  }

  return state;
}

export function getCurrentInput(state) {
  const draft = state.quoteDraft;
  return {
    projectName: draft.projectName.trim() || "Projeto sem nome",
    printerId: draft.printerId,
    materialId: draft.materialId,
    complexity: draft.complexity,
    modelWeightG: numberValue(draft.modelWeightG),
    printTimeHours: numberValue(draft.printTimeHours),
    quantity: Math.max(1, Math.round(numberValue(draft.quantity, 1))),
    supportEnabled: Boolean(draft.supportEnabled),
    supportMode: draft.supportMode,
    supportValue: numberValue(draft.supportValue),
    postProcessingEnabled: Boolean(draft.postProcessingEnabled),
    postProcessingHours: numberValue(draft.postProcessingHours),
    paintingEnabled: Boolean(draft.paintingEnabled),
    paintingHours: numberValue(draft.paintingHours),
    paintingConsumablesPerPiece: numberValue(draft.paintingConsumablesPerPiece),
    packagingEnabled: Boolean(draft.packagingEnabled),
    marketplaceEnabled: Boolean(draft.marketplaceEnabled),
    manualDiscountPercent: numberValue(draft.manualDiscountPercent),
    notes: draft.notes || "",
    scenario: {
      filamentPriceKg: optionalNumberValue(draft.scenarioFilamentPriceKg),
      marginPercent: optionalNumberValue(draft.scenarioMarginPercent),
      feePercent: optionalNumberValue(draft.scenarioFeePercent)
    }
  };
}

export function calculateQuote(input, state) {
  const settings = state.settings;
  const printer = state.printers.find((item) => item.id === input.printerId) ?? state.printers[0];
  const material = state.materials.find((item) => item.id === input.materialId) ?? state.materials[0];
  const complexitySettingKey = complexityMap[input.complexity]?.settingKey ?? "complexityMediumPercent";
  const complexityPercent = numberValue(settings[complexitySettingKey]);
  const filamentPriceKg = input.scenario.filamentPriceKg !== null
    ? input.scenario.filamentPriceKg
    : numberValue(material.priceKg, settings.defaultFilamentPriceKg);
  const desiredMarginPercent = input.scenario.marginPercent !== null
    ? input.scenario.marginPercent
    : numberValue(settings.desiredMarginPercent);
  const marketplaceFeePercent = input.marketplaceEnabled
    ? (input.scenario.feePercent !== null ? input.scenario.feePercent : numberValue(settings.marketplaceFeePercent))
    : 0;

  const supportWeightG = input.supportEnabled
    ? (input.supportMode === "percent" ? input.modelWeightG * (input.supportValue / 100) : input.supportValue)
    : 0;
  const baseWeightPerPieceG = input.modelWeightG + supportWeightG;
  const effectiveWeightPerPieceG = baseWeightPerPieceG * (1 + (numberValue(material.wastePercent) / 100));
  const totalEffectiveWeightKg = (effectiveWeightPerPieceG * input.quantity) / 1000;
  const materialCost = totalEffectiveWeightKg * filamentPriceKg;

  const totalPrintHours = input.printTimeHours * input.quantity;
  const energyCost = (numberValue(printer.powerW, settings.defaultPrinterPowerW) / 1000) * totalPrintHours * numberValue(settings.energyCostKwh);
  const depreciationPerHour = numberValue(printer.value, settings.defaultPrinterValue) /
    Math.max(1, numberValue(printer.usefulHours, settings.defaultPrinterUsefulHours));
  const depreciationCost = depreciationPerHour * totalPrintHours;

  const maintenancePerHour = numberValue(printer.maintenanceMonthly, settings.defaultMaintenanceMonthly) /
    Math.max(1, numberValue(printer.monthlyHours, settings.monthlyOperatingHours));
  const maintenanceCost = maintenancePerHour * totalPrintHours;

  const setupLaborHours = numberValue(settings.setupMinutesPerOrder) / 60;
  const postProcessingHours = input.postProcessingEnabled ? input.postProcessingHours * input.quantity : 0;
  const paintingHours = input.paintingEnabled ? input.paintingHours * input.quantity : 0;
  const laborHours = setupLaborHours + postProcessingHours + paintingHours;
  const laborCost = laborHours * numberValue(settings.laborHourCost);
  const paintingConsumablesCost = input.paintingEnabled ? input.paintingConsumablesPerPiece * input.quantity : 0;
  const packagingCost = input.packagingEnabled ? numberValue(settings.packagingCostPerOrder) : 0;

  const preFailureCost = materialCost + energyCost + depreciationCost + maintenanceCost + laborCost + paintingConsumablesCost + packagingCost;
  const failureRate = Math.min(99, numberValue(settings.failureRatePercent)) / 100;
  const failureCost = preFailureCost * (failureRate / Math.max(0.01, 1 - failureRate));
  const grossCost = preFailureCost + failureCost;

  const markupPercent = (desiredMarginPercent + complexityPercent) / 100;
  const breakEvenPrice = grossCost / Math.max(0.01, 1 - (marketplaceFeePercent / 100));
  const targetPriceBeforeDiscount = (grossCost * (1 + markupPercent)) / Math.max(0.01, 1 - (marketplaceFeePercent / 100));
  const discountMultiplier = Math.max(0, 1 - (input.manualDiscountPercent / 100));
  const finalSalePrice = targetPriceBeforeDiscount * discountMultiplier;
  const marketplaceFeesValue = finalSalePrice * (marketplaceFeePercent / 100);
  const netRevenue = finalSalePrice - marketplaceFeesValue;
  const totalProfit = netRevenue - grossCost;
  const profitPerPiece = totalProfit / input.quantity;
  const realMarginPercent = finalSalePrice > 0 ? (totalProfit / finalSalePrice) * 100 : 0;

  return {
    input,
    settingsSnapshot: { desiredMarginPercent, marketplaceFeePercent, complexityPercent, filamentPriceKg },
    printer,
    material,
    supportWeightG,
    effectiveWeightPerPieceG,
    totalEffectiveWeightKg,
    totalPrintHours,
    capacityHours: totalPrintHours,
    materialCost,
    energyCost,
    depreciationCost,
    maintenanceCost,
    laborCost,
    paintingConsumablesCost,
    packagingCost,
    failureCost,
    grossCost,
    breakEvenPrice,
    targetPriceBeforeDiscount,
    finalSalePrice,
    marketplaceFeesValue,
    totalProfit,
    profitPerPiece,
    realMarginPercent,
    isWorthProducing: totalProfit > 0 && realMarginPercent >= Math.max(8, desiredMarginPercent * 0.4)
  };
}