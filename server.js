import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  deleteMaterial,
  deletePrinter,
  deleteQuote,
  getAppState,
  insertQuote,
  resetDatabase,
  updateDraft,
  updateSettings,
  updateUi,
  upsertMaterial,
  upsertPrinter
} from "./lib/database.js";
import { calculateQuote, getCurrentInput, normalizeDraft } from "./lib/pricing.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "1mb" }));

app.get("/api/bootstrap", async (_request, response, next) => {
  try {
    const state = await getAppState();
    response.json(state);
  } catch (error) {
    next(error);
  }
});

app.put("/api/settings", async (request, response, next) => {
  try {
    await updateSettings(request.body.settings || {});
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.put("/api/draft", async (request, response, next) => {
  try {
    await updateDraft(request.body.quoteDraft || {});
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.put("/api/ui", async (request, response, next) => {
  try {
    await updateUi(request.body.ui || {});
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/materials", async (request, response, next) => {
  try {
    await upsertMaterial(request.body.material);
    response.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.put("/api/materials/:id", async (request, response, next) => {
  try {
    await upsertMaterial({ ...request.body.material, id: request.params.id });
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/materials/:id", async (request, response, next) => {
  try {
    await deleteMaterial(request.params.id);
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/printers", async (request, response, next) => {
  try {
    await upsertPrinter(request.body.printer);
    response.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.put("/api/printers/:id", async (request, response, next) => {
  try {
    await upsertPrinter({ ...request.body.printer, id: request.params.id });
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/printers/:id", async (request, response, next) => {
  try {
    await deletePrinter(request.params.id);
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/quotes", async (_request, response, next) => {
  try {
    const state = normalizeDraft(await getAppState());
    const calculation = calculateQuote(getCurrentInput(state), state);
    const entry = {
      id: crypto.randomUUID(),
      savedAt: new Date().toISOString(),
      projectName: calculation.input.projectName,
      printerId: calculation.printer.id,
      printerName: calculation.printer.name,
      materialId: calculation.material.id,
      materialName: calculation.material.name,
      quantity: calculation.input.quantity,
      complexity: calculation.input.complexity,
      finalSalePrice: calculation.finalSalePrice,
      totalProfit: calculation.totalProfit,
      grossCost: calculation.grossCost,
      breakEvenPrice: calculation.breakEvenPrice,
      totalPrintHours: calculation.totalPrintHours,
      notes: calculation.input.notes,
      rawInput: state.quoteDraft
    };

    await insertQuote(entry);
    response.status(201).json(entry);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/quotes/:id", async (request, response, next) => {
  try {
    await deleteQuote(request.params.id);
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/reset", async (_request, response, next) => {
  try {
    const state = await resetDatabase();
    response.json(state);
  } catch (error) {
    next(error);
  }
});

app.use(express.static(__dirname));

app.get("*", (_request, response) => {
  response.sendFile(path.join(__dirname, "index.html"));
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: "Falha interna ao processar a solicitação." });
});

app.listen(port, () => {
  console.log(`Precificação 3D Pro rodando em http://localhost:${port}`);
});