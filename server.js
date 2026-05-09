import express from "express";
import session from "express-session";
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
const authUsername = process.env.APP_USERNAME || "admin";
const authPassword = process.env.APP_PASSWORD || "admin123";
const sessionSecret = process.env.SESSION_SECRET || "precificacao-3d-pro-dev-secret";

app.set("trust proxy", 1);

app.use(express.json({ limit: "1mb" }));
app.use(session({
  name: "precificacao.sid",
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

function isAuthenticated(request) {
  return Boolean(request.session?.authenticated);
}

function requireAuth(request, response, next) {
  if (isAuthenticated(request)) {
    next();
    return;
  }

  response.status(401).json({ error: "Sessão expirada ou acesso não autorizado." });
}

app.get("/login", (request, response) => {
  if (isAuthenticated(request)) {
    response.redirect("/");
    return;
  }

  response.sendFile(path.join(__dirname, "login.html"));
});

app.post("/api/auth/login", (request, response) => {
  const { username, password } = request.body || {};

  if (username === authUsername && password === authPassword) {
    request.session.authenticated = true;
    request.session.username = username;
    response.json({ ok: true });
    return;
  }

  response.status(401).json({ error: "Login inválido." });
});

app.post("/api/auth/logout", (request, response, next) => {
  request.session.destroy((error) => {
    if (error) {
      next(error);
      return;
    }

    response.clearCookie("precificacao.sid");
    response.json({ ok: true });
  });
});

app.get("/api/auth/status", (request, response) => {
  response.json({ authenticated: isAuthenticated(request) });
});

app.use("/api", (request, response, next) => {
  if (["/auth/login", "/auth/logout", "/auth/status"].includes(request.path)) {
    next();
    return;
  }

  requireAuth(request, response, next);
});

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

app.use((request, response, next) => {
  if (request.path === "/login" || request.path === "/login.html") {
    next();
    return;
  }

  if (isAuthenticated(request)) {
    next();
    return;
  }

  response.redirect("/login");
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