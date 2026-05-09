import fs from "node:fs/promises";
import path from "node:path";
import { open } from "sqlite";
import sqlite3 from "sqlite3";

import { createInitialState, defaultState, normalizeDraft } from "./pricing.js";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "precificacao.sqlite");

let databasePromise;

function parseJson(raw, fallback) {
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function asRow(item) {
  return JSON.stringify(item);
}

export async function getDb() {
  if (!databasePromise) {
    databasePromise = initializeDb();
  }
  return databasePromise;
}

async function initializeDb() {
  await fs.mkdir(dataDir, { recursive: true });

  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      settings_json TEXT NOT NULL,
      quote_draft_json TEXT NOT NULL,
      ui_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS printers (
      id TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      project_name TEXT NOT NULL,
      printer_id TEXT NOT NULL,
      material_id TEXT NOT NULL,
      saved_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
  `);

  await seedIfNeeded(db);
  return db;
}

async function seedIfNeeded(db) {
  const stateRow = await db.get("SELECT id FROM app_state WHERE id = 1");
  if (!stateRow) {
    const initialState = createInitialState();
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO app_state (id, settings_json, quote_draft_json, ui_json, updated_at) VALUES (1, ?, ?, ?, ?)`,
      asRow(initialState.settings),
      asRow(initialState.quoteDraft),
      asRow(initialState.ui),
      now
    );

    for (const material of initialState.materials) {
      await db.run(
        `INSERT INTO materials (id, data_json, updated_at) VALUES (?, ?, ?)`,
        material.id,
        asRow(material),
        now
      );
    }

    for (const printer of initialState.printers) {
      await db.run(
        `INSERT INTO printers (id, data_json, updated_at) VALUES (?, ?, ?)`,
        printer.id,
        asRow(printer),
        now
      );
    }
  }
}

export async function getAppState() {
  const db = await getDb();
  const [stateRow, materialRows, printerRows, quoteRows] = await Promise.all([
    db.get("SELECT * FROM app_state WHERE id = 1"),
    db.all("SELECT data_json FROM materials ORDER BY json_extract(data_json, '$.name') COLLATE NOCASE ASC"),
    db.all("SELECT data_json FROM printers ORDER BY json_extract(data_json, '$.name') COLLATE NOCASE ASC"),
    db.all("SELECT data_json FROM quotes ORDER BY saved_at DESC")
  ]);

  const state = {
    settings: { ...defaultState.settings, ...parseJson(stateRow?.settings_json, {}) },
    materials: materialRows.map((row) => parseJson(row.data_json, null)).filter(Boolean),
    printers: printerRows.map((row) => parseJson(row.data_json, null)).filter(Boolean),
    quoteDraft: { ...defaultState.quoteDraft, ...parseJson(stateRow?.quote_draft_json, {}) },
    ui: { ...defaultState.ui, ...parseJson(stateRow?.ui_json, {}) },
    history: quoteRows.map((row) => parseJson(row.data_json, null)).filter(Boolean)
  };

  return normalizeDraft(state);
}

export async function resetDatabase() {
  const db = await getDb();
  const now = new Date().toISOString();
  const nextState = createInitialState();

  await db.exec("DELETE FROM quotes; DELETE FROM materials; DELETE FROM printers;");
  await db.run(
    `UPDATE app_state SET settings_json = ?, quote_draft_json = ?, ui_json = ?, updated_at = ? WHERE id = 1`,
    asRow(nextState.settings),
    asRow(nextState.quoteDraft),
    asRow(nextState.ui),
    now
  );

  for (const material of nextState.materials) {
    await db.run(
      `INSERT INTO materials (id, data_json, updated_at) VALUES (?, ?, ?)`,
      material.id,
      asRow(material),
      now
    );
  }

  for (const printer of nextState.printers) {
    await db.run(
      `INSERT INTO printers (id, data_json, updated_at) VALUES (?, ?, ?)`,
      printer.id,
      asRow(printer),
      now
    );
  }

  return nextState;
}

export async function updateSettings(settings) {
  const db = await getDb();
  await db.run(
    `UPDATE app_state SET settings_json = ?, updated_at = ? WHERE id = 1`,
    asRow(settings),
    new Date().toISOString()
  );
}

export async function updateDraft(quoteDraft) {
  const db = await getDb();
  await db.run(
    `UPDATE app_state SET quote_draft_json = ?, updated_at = ? WHERE id = 1`,
    asRow(quoteDraft),
    new Date().toISOString()
  );
}

export async function updateUi(ui) {
  const db = await getDb();
  await db.run(
    `UPDATE app_state SET ui_json = ?, updated_at = ? WHERE id = 1`,
    asRow(ui),
    new Date().toISOString()
  );
}

export async function upsertMaterial(material) {
  const db = await getDb();
  await db.run(
    `INSERT INTO materials (id, data_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`,
    material.id,
    asRow(material),
    new Date().toISOString()
  );
}

export async function deleteMaterial(materialId) {
  const db = await getDb();
  await db.run(`DELETE FROM materials WHERE id = ?`, materialId);
}

export async function upsertPrinter(printer) {
  const db = await getDb();
  await db.run(
    `INSERT INTO printers (id, data_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`,
    printer.id,
    asRow(printer),
    new Date().toISOString()
  );
}

export async function deletePrinter(printerId) {
  const db = await getDb();
  await db.run(`DELETE FROM printers WHERE id = ?`, printerId);
}

export async function insertQuote(quote) {
  const db = await getDb();
  await db.run(
    `INSERT INTO quotes (id, project_name, printer_id, material_id, saved_at, data_json) VALUES (?, ?, ?, ?, ?, ?)`,
    quote.id,
    quote.projectName,
    quote.printerId,
    quote.materialId,
    quote.savedAt,
    asRow(quote)
  );
}

export async function deleteQuote(quoteId) {
  const db = await getDb();
  await db.run(`DELETE FROM quotes WHERE id = ?`, quoteId);
}