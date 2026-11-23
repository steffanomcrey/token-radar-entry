// Token Radar — main.ts
// Reads the sealed snapshot, ranks pre-token protocols with lib/model.ts, writes the board,
// the dashboard bundle and the dossier into $MAKEFUN_OUTPUT_DIR. Node 22 stdlib only.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json

import { parseArgs } from 'node:util';
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  buildRadar,
  boardIssue,
  dataScript,
  parseSnapshot,
  MIN_BOARD_ROWS,
  MAX_BOARD_ROWS,
  SnapshotError,
} from './lib/model.ts';
import { buildDossier, DossierError } from './vendor/makefun-board.ts';

const DEFAULT_INPUT = '/input/snapshot.json';
/** The gate's own caps, restated so buildDossier refuses an output the gate would refuse. */
const DOSSIER_TEXT_MAX_BYTES = 65_536;
const DASHBOARD_MAX_FILES = 400;
const DASHBOARD_MAX_BYTES = 4 * 1024 * 1024;

function fail(message: string): never {
  console.error(`main: ${message}`);
  process.exit(1);
}

// ---------------------------------------------------------------- arguments

const { values } = parseArgs({
  options: { input: { type: 'string', default: DEFAULT_INPUT } },
});
const inputPath = resolve(values.input ?? DEFAULT_INPUT);
const outDir = process.env.MAKEFUN_OUTPUT_DIR;
if (outDir === undefined || outDir === '') fail('MAKEFUN_OUTPUT_DIR is not set: no directory to write the board into');

// ---------------------------------------------------------------- the snapshot

let text: string;
try {
  text = readFileSync(inputPath, 'utf8');
} catch {
  fail(`cannot read the snapshot at ${inputPath}`);
}
let snapshot;
try {
  snapshot = parseSnapshot(text);
} catch (err) {
  fail(err instanceof SnapshotError ? err.message : 'snapshot.json is not the shape the model scores');
}

// ---------------------------------------------------------------- the board

const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(`the board is not one the gate takes: ${issue}`);
if (board.length < MIN_BOARD_ROWS || board.length > MAX_BOARD_ROWS) {
  fail(`the board holds ${board.length} rows, outside the ${MIN_BOARD_ROWS}..${MAX_BOARD_ROWS} the gate takes`);
}

// ---------------------------------------------------------------- write /output

const output = resolve(outDir);
try {
  mkdirSync(output, { recursive: true });

  // board.json: the ranked rows, gate shape.
  writeFileSync(join(output, 'board.json'), `${JSON.stringify({ schema: 'token-radar/board/v1', as_of: snapshot.as_of, source: snapshot.source, rows: board }, null, 2)}\n`);

  // The dashboard: page, data and screenshots, copied, with data.js written beside index.html.
  const dashOut = join(output, 'dashboard');
  cpSync(join(process.cwd(), 'dashboard'), dashOut, { recursive: true });
  writeFileSync(join(dashOut, 'data.js'), dataScript(radar));
  cpSync(join(process.cwd(), 'screenshots'), join(output, 'screenshots'), { recursive: true });

  // dossier.json: byte for byte what buildDossier writes from the output directory.
  const dossier = buildDossier(output, {
    text_max_bytes: DOSSIER_TEXT_MAX_BYTES,
    screenshots: { max: 8, max_bytes: 4 * 1024 * 1024 },
    dashboard: { max_files: DASHBOARD_MAX_FILES, max_bytes: DASHBOARD_MAX_BYTES },
  });
  writeFileSync(join(output, 'dossier.json'), dossier);
} catch (err) {
  if (err instanceof DossierError) fail(err.message);
  fail(`writing the output failed: ${err instanceof Error ? err.message : String(err)}`);
}

if (!existsSync(join(output, 'dashboard', 'index.html'))) fail('the dashboard landed without an index.html');

// ---------------------------------------------------------------- report

const implied = board.reduce((n, r) => n + r.implied_value_usd, 0);
console.log(`token radar: ${board.length} rows (watchlist ${radar.watchlist_size}, peers ${radar.peer_pairs}, global ${radar.global_multiple}x)`);
console.log(`  implied total $${implied.toLocaleString('en-US')}, top row ${board[0]?.slug} at $${board[0]?.implied_value_usd.toLocaleString('en-US')}`);
console.log(`  written to ${output}: board.json, dashboard/ (data.js), screenshots/, dossier.json`);
