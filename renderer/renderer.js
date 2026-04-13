// ── renderer.js — UI logic ───────────────────────────────────────────────────

// ── Settings persistence ──────────────────────────────────────────────────────
const MODELS = {
  openai: [
    { value: 'gpt-4o',                label: 'GPT-4o' },
    { value: 'gpt-4o-mini',           label: 'GPT-4o Mini' },
    { value: 'gpt-4-turbo',           label: 'GPT-4 Turbo' },
    { value: 'gpt-3.5-turbo',         label: 'GPT-3.5 Turbo' },
  ],
  anthropic: [
    { value: 'claude-opus-4-6',       label: 'Claude Opus 4.6' },
    { value: 'claude-sonnet-4-6',     label: 'Claude Sonnet 4.6' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  ],
  google: [
    { value: 'gemini-1.5-pro',        label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash',      label: 'Gemini 1.5 Flash' },
    { value: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash' },
  ],
};

const DEFAULTS = {
  openai:    { model: 'gpt-4o' },
  anthropic: { model: 'claude-opus-4-6' },
  google:    { model: 'gemini-1.5-pro' },
};

function loadSettings() {
  const raw = localStorage.getItem('tdSettings');
  const s = raw ? JSON.parse(raw) : {
    provider: 'openai',
    model:    DEFAULTS.openai.model,
    delayMs:  300,
  };
  delete s.apiKey; // credentials are server-side; never load from cache
  return s;
}

function saveSettings(s) {
  const toSave = { ...s };
  delete toSave.apiKey; // never persist credentials in localStorage
  localStorage.setItem('tdSettings', JSON.stringify(toSave));
}

let settings = loadSettings();

// ── DOM refs ──────────────────────────────────────────────────────────────────
const btnSettings      = document.getElementById('btn-settings');
const btnSettingsClose = document.getElementById('btn-settings-close');
const settingsPanel    = document.getElementById('settings-panel');
const overlay          = document.getElementById('overlay');
const selProvider      = document.getElementById('sel-provider');
const inpModel         = document.getElementById('inp-model');
const inpApiKey        = document.getElementById('inp-apikey');
const inpDelay         = document.getElementById('inp-delay');
const btnSaveSettings  = document.getElementById('btn-save-settings');
const settingsStatus   = document.getElementById('settings-status');

// Tabs
const tabs        = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

// Single
const inpMessage       = document.getElementById('inp-message');
const inpContext       = document.getElementById('inp-context');
const btnAnalyzeSingle = document.getElementById('btn-analyze-single');
const singleResult     = document.getElementById('single-result');

// Batch
const btnLoadCsv     = document.getElementById('btn-load-csv');
const btnAnalyzeBatch= document.getElementById('btn-analyze-batch');
const btnExportCsv   = document.getElementById('btn-export-csv');
const batchPreview   = document.getElementById('batch-preview');
const batchProgress  = document.getElementById('batch-progress');
const progressFill   = document.getElementById('progress-fill');
const progressLabel  = document.getElementById('progress-label');
const batchResults   = document.getElementById('batch-results');

let batchRows    = [];   // [{message, context?}]
let batchData    = [];   // analysis results

// ── API helper ────────────────────────────────────────────────────────────────
async function apiAnalyze(messages, settingsOverride = {}) {
  const resp = await fetch('/api/analyze', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ messages, settings: { ...settings, ...settingsOverride } }),
  });
  const data = await resp.json();
  if (!data.ok) throw new Error(data.error);
  return data.results;
}

// ── Settings panel ────────────────────────────────────────────────────────────
function populateModelSelect(provider, selectedModel) {
  inpModel.innerHTML = '';
  (MODELS[provider] ?? []).forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if (value === selectedModel) opt.selected = true;
    inpModel.appendChild(opt);
  });
}

function openSettings() {
  selProvider.value = settings.provider;
  populateModelSelect(settings.provider, settings.model);
  inpApiKey.value   = settings.apiKey;
  inpDelay.value    = settings.delayMs;
  settingsPanel.classList.add('open');
  overlay.classList.add('active');
}
function closeSettings() {
  settingsPanel.classList.remove('open');
  overlay.classList.remove('active');
}

btnSettings.addEventListener('click', openSettings);
btnSettingsClose.addEventListener('click', closeSettings);
overlay.addEventListener('click', closeSettings);

selProvider.addEventListener('change', () => {
  populateModelSelect(selProvider.value, DEFAULTS[selProvider.value]?.model);
});

btnSaveSettings.addEventListener('click', () => {
  settings = {
    provider: selProvider.value,
    model:    inpModel.value.trim(),
    apiKey:   inpApiKey.value.trim(),
    delayMs:  parseInt(inpDelay.value, 10) || 300,
  };
  saveSettings(settings);
  settingsStatus.textContent = 'Settings saved.';
  setTimeout(() => (settingsStatus.textContent = ''), 2000);
});

// ── Tabs ──────────────────────────────────────────────────────────────────────
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    tabContents.forEach((c) => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

// ── Single message analysis ───────────────────────────────────────────────────
btnAnalyzeSingle.addEventListener('click', async () => {
  const message = inpMessage.value.trim();
  if (!message) { alert('Please enter a message to analyze.'); return; }

  btnAnalyzeSingle.disabled = true;
  singleResult.innerHTML = '<div style="display:flex;align-items:center;gap:10px;color:var(--text2);padding:20px"><div class="spinner"></div> Analyzing…</div>';

  try {
    const [result] = await apiAnalyze(
      [{ message, context: inpContext.value.trim() || undefined }]
    );
    singleResult.innerHTML = '';
    singleResult.appendChild(buildResultCard(result, true));
  } catch (err) {
    singleResult.innerHTML = `<div class="error-msg" style="padding:16px">Error: ${escHtml(err.message)}</div>`;
  } finally {
    btnAnalyzeSingle.disabled = false;
  }
});

// ── Batch CSV ─────────────────────────────────────────────────────────────────
const fileInput = document.getElementById('file-input');

btnLoadCsv.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  fileInput.value = '';
  const reader = new FileReader();
  reader.onload = (e) => {
    batchRows = parseCSV(e.target.result);
    if (batchRows.length === 0) { alert('No rows found. Ensure the CSV has a "message" column.'); return; }
    renderBatchPreview(batchRows);
    btnAnalyzeBatch.disabled = false;
    batchResults.innerHTML   = '';
    batchData = [];
    btnExportCsv.disabled    = true;
  };
  reader.readAsText(file);
});

btnAnalyzeBatch.addEventListener('click', async () => {
  btnAnalyzeBatch.disabled = true;
  btnLoadCsv.disabled      = true;
  batchResults.innerHTML   = '';
  batchData = [];

  batchProgress.style.display = 'flex';
  progressFill.style.width    = '0%';
  progressLabel.textContent   = `0 / ${batchRows.length}`;

  const container = document.createElement('div');
  container.className = 'result-cards';
  batchResults.appendChild(container);

  for (let i = 0; i < batchRows.length; i++) {
    const row = batchRows[i];
    const placeholder = document.createElement('div');
    placeholder.className = 'result-card';
    placeholder.innerHTML = `<div class="card-header"><div class="spinner"></div><span class="card-msg">${escHtml(row.message)}</span></div>`;
    container.appendChild(placeholder);
    placeholder.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    try {
      const [result] = await apiAnalyze([row], { delayMs: 0 });
      batchData.push(result);
      placeholder.replaceWith(buildResultCard(result, false));
    } catch (err) {
      const errResult = { message: row.message, error: err.message, layer1: null, layer2: null, layer3: null };
      batchData.push(errResult);
      placeholder.replaceWith(buildResultCard(errResult, false));
    }

    const pct = Math.round(((i + 1) / batchRows.length) * 100);
    progressFill.style.width  = pct + '%';
    progressLabel.textContent = `${i + 1} / ${batchRows.length}`;

    // Rate limit delay between rows
    if (i < batchRows.length - 1 && settings.delayMs > 0) {
      await sleep(settings.delayMs);
    }
  }

  btnAnalyzeBatch.disabled = false;
  btnLoadCsv.disabled      = false;
  btnExportCsv.disabled    = false;
});

btnExportCsv.addEventListener('click', () => {
  const csv  = exportResultsCSV(batchData);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'results.csv';
  a.click();
  URL.revokeObjectURL(url);
});

// ── CSV parsing ───────────────────────────────────────────────────────────────
function parseCSV(raw) {
  const lines  = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
  const msgIdx  = headers.indexOf('message');
  if (msgIdx === -1) return [];
  const ctxIdx  = headers.indexOf('context');

  return lines.slice(1).map((line) => {
    const cols = parseCSVLine(line);
    const row  = { message: (cols[msgIdx] ?? '').trim() };
    if (ctxIdx !== -1 && cols[ctxIdx]) row.context = cols[ctxIdx].trim();
    return row;
  }).filter((r) => r.message);
}

function parseCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

function renderBatchPreview(rows) {
  const cols = ['message', 'context'];
  let html = '<table><thead><tr>' + cols.map((c) => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
  rows.slice(0, 50).forEach((r) => {
    html += `<tr><td>${escHtml(r.message)}</td><td>${escHtml(r.context ?? '')}</td></tr>`;
  });
  if (rows.length > 50) html += `<tr><td colspan="2" style="color:var(--text3);text-align:center">… and ${rows.length - 50} more rows</td></tr>`;
  html += '</tbody></table>';
  batchPreview.innerHTML = html;
}

// ── Result card builder ───────────────────────────────────────────────────────
function buildResultCard(result, expanded) {
  const { message, layer1, layer2, layer3, error } = result;
  const verdict = layer3?.verdict ?? (error ? 'ERROR' : 'SAFE');
  const action  = layer3?.action  ?? (error ? 'ERROR' : 'NO_ACTION');

  const card = document.createElement('div');
  card.className = 'result-card';

  // Header — dot colour driven by action, badge driven by verdict
  const dotColor = action === 'RECOMMEND' ? 'var(--danger)' : 'var(--ok)';
  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = `
    <div class="severity" style="background:${dotColor}" title="${escHtml(action)}"></div>
    <span class="card-msg">${escHtml(message)}</span>
    <span class="verdict verdict-${verdict}">${verdict}</span>
    <button class="collapse-btn" title="Toggle details">${expanded ? '▲' : '▼'}</button>
  `;
  card.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.className = 'card-body';
  body.style.display = expanded ? 'flex' : 'none';

  if (error) {
    body.innerHTML = `<div class="error-msg">Error: ${escHtml(error)}</div>`;
  } else {
    body.appendChild(buildLayer1Section(layer1));
    body.appendChild(buildLayer2Section(layer2));
    body.appendChild(buildLayer3Section(layer3));
  }
  card.appendChild(body);

  // Toggle collapse
  header.addEventListener('click', () => {
    const isOpen = body.style.display !== 'none';
    body.style.display     = isOpen ? 'none' : 'flex';
    header.querySelector('.collapse-btn').textContent = isOpen ? '▼' : '▲';
  });

  return card;
}

function buildLayer1Section(l1) {
  const sec = document.createElement('div');
  sec.className = 'layer-section';
  sec.innerHTML = `<div class="layer-title">Layer 1 — Category Detection</div>`;
  const body = document.createElement('div');
  body.className = 'layer-body';

  const cats = (l1?.categories_detected ?? []);
  body.innerHTML += kv('Categories', cats.length ? cats.map(tagHtml).join(' ') : tagHtml('None'));
  body.innerHTML += kv('Primary', l1?.primary_category ? tagHtml(l1.primary_category) : '—');
  body.innerHTML += kv('Harm Candidate', l1?.harm_candidate ? '<span style="color:var(--danger)">Yes</span>' : '<span style="color:var(--ok)">No</span>');

  if (l1?.confidence_per_category) {
    const conf = l1.confidence_per_category;
    const bars = Object.entries(conf).map(([cat, val]) =>
      `<div style="display:flex;align-items:center;gap:8px;font-size:11px">
        <span style="color:var(--text3);min-width:140px">${escHtml(cat)}</span>
        <div style="flex:1;height:4px;background:var(--bg3);border-radius:99px">
          <div style="width:${Math.round(val*100)}%;height:100%;background:var(--accent);border-radius:99px"></div>
        </div>
        <span style="color:var(--text2);min-width:32px">${Math.round(val*100)}%</span>
      </div>`
    ).join('');
    body.innerHTML += `<div style="display:flex;flex-direction:column;gap:4px;margin-top:4px">${bars}</div>`;
  }

  if (l1?.supporting_quotes?.length) {
    const quotes = l1.supporting_quotes.map((q) => `<div class="quote">"${escHtml(q)}"</div>`).join('');
    body.innerHTML += kv('Quotes', `<div style="display:flex;flex-direction:column;gap:4px">${quotes}</div>`);
  }

  sec.appendChild(body);
  return sec;
}

function buildLayer2Section(l2) {
  const sec = document.createElement('div');
  sec.className = 'layer-section';
  sec.innerHTML = `<div class="layer-title">Layer 2 — Edge-case Policy Filter</div>`;
  const body = document.createElement('div');
  body.className = 'layer-body';

  const overrideColor = { KEEP: 'var(--danger)', DOWNGRADE: 'var(--warn)', CLEAR_ALL: 'var(--ok)' };
  if (l2?.target_analysis) body.innerHTML += kv('Target', `<em style="color:var(--text2)">${escHtml(l2.target_analysis)}</em>`);
  body.innerHTML += kv('Override', `<span style="color:${overrideColor[l2?.override] ?? 'var(--text)'};font-weight:700">${escHtml(l2?.override ?? '—')}</span>`);
  if (l2?.rule_applied) body.innerHTML += kv('Rule applied', `<code>Rule ${escHtml(l2.rule_applied)}</code>`);
  body.innerHTML += kv('Adjusted Categories', (l2?.adjusted_categories ?? []).map(tagHtml).join(' ') || tagHtml('None'));
  body.innerHTML += kv('Confidence', l2?.adjusted_confidence != null ? `${Math.round(l2.adjusted_confidence * 100)}%` : '—');
  body.innerHTML += kv('Reason', escHtml(l2?.policy_reason ?? '—'));

  sec.appendChild(body);
  return sec;
}

function buildLayer3Section(l3) {
  const sec = document.createElement('div');
  sec.className = 'layer-section';
  sec.innerHTML = `<div class="layer-title">Layer 3 — Final Decision</div>`;
  const body = document.createElement('div');
  body.className = 'layer-body';

  body.innerHTML += kv('Verdict', `<span class="verdict verdict-${l3?.verdict ?? 'SAFE'}">${escHtml(l3?.verdict ?? '—')}</span>`);

  const action = l3?.action ?? 'NO_ACTION';
  const actionColor = action === 'RECOMMEND' ? 'var(--danger)' : 'var(--ok)';
  body.innerHTML += kv('Action', `<code style="color:${actionColor};font-weight:700">${escHtml(action)}</code>`);

  const cats = l3?.recommended_report_categories ?? [];
  if (cats.length) {
    body.innerHTML += kv('Report as', cats.map(tagHtml).join(' '));
  }

  if (l3?.replacement_suggestion) {
    body.innerHTML += kv('Suggested replacement',
      `<div style="background:var(--bg3);border:1px solid var(--border);border-left:3px solid var(--accent);
        border-radius:0 var(--radius) var(--radius) 0;padding:6px 10px;font-style:italic;color:var(--text)">
        ${escHtml(l3.replacement_suggestion)}
      </div>`
    );
  }

  body.innerHTML += kv('Explanation', `<em style="color:var(--text2)">${escHtml(l3?.explanation ?? '—')}</em>`);

  sec.appendChild(body);
  return sec;
}

// ── CSV export ────────────────────────────────────────────────────────────────
function exportResultsCSV(results) {
  const headers = [
    'message', 'verdict', 'action',
    'recommended_report_categories', 'replacement_suggestion', 'explanation',
    'l1_categories', 'l1_primary', 'l1_harm_candidate',
    'l2_override', 'l2_reason', 'error',
  ];
  const rows = results.map((r) => [
    r.message,
    r.layer3?.verdict ?? '',
    r.layer3?.action ?? '',
    (r.layer3?.recommended_report_categories ?? []).join('; '),
    r.layer3?.replacement_suggestion ?? '',
    r.layer3?.explanation ?? '',
    (r.layer1?.categories_detected ?? []).join('; '),
    r.layer1?.primary_category ?? '',
    r.layer1?.harm_candidate ?? '',
    r.layer2?.override ?? '',
    r.layer2?.policy_reason ?? '',
    r.error ?? '',
  ].map(csvCell));
  return [headers.map(csvCell).join(','), ...rows.map((r) => r.join(','))].join('\r\n');
}

function csvCell(v) {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function tagHtml(t) { return `<span class="tag">${escHtml(t)}</span>`; }
function kv(key, valHtml) {
  return `<div class="kv"><span class="k">${escHtml(key)}</span><span class="v">${valHtml}</span></div>`;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
