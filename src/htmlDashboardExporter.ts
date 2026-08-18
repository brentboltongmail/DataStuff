import type { QueryResult } from "./types";
import { formatCell } from "./csv";

interface HtmlDashboardOptions {
  sql?: string;
  title?: string;
  themeName?: string;
}

export function generateHtmlDashboard(
  result: QueryResult,
  options: HtmlDashboardOptions = {},
): string {
  const title = options.title || "DataStuff Query Dashboard";
  const sqlText = options.sql || "SELECT * FROM QUERY_RESULTS";
  const timestamp = new Date().toLocaleString();
  const columns = result.columns.map((c) => c.name);
  const rows = result.rows;
  const totalRows = rows.length;
  const elapsedMs = result.elapsedMs || 0;

  // Escape HTML helper
  const escHtml = (str: unknown): string => {
    if (str === null || str === undefined) return '<span class="null-val">NULL</span>';
    const text = typeof str === "object" ? JSON.stringify(str) : String(str);
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  // Convert row data to JSON string safely for client-side search/sorting script
  const tableDataJson = JSON.stringify({
    columns,
    rows: rows.map((row) =>
      row.map((cell) => (cell === null || cell === undefined ? null : formatCell(cell))),
    ),
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)}</title>
  <style>
    :root {
      --bg-dark: #0f1115;
      --bg-card: #161920;
      --bg-hover: #1e222d;
      --border: #2a2e3d;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --accent-glow: rgba(56, 189, 248, 0.25);
      --success: #10b981;
      --font: "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --font-mono: "IBM Plex Mono", "SF Mono", Menlo, Consolas, monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg-dark);
      color: var(--text);
      font-family: var(--font);
      font-size: 13px;
      line-height: 1.5;
      padding: 24px;
      min-height: 100vh;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    header {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    }

    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .brand-logo {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, var(--accent), #818cf8);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      color: #0f1115;
      font-size: 16px;
    }

    .brand-title {
      font-size: 18px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.5px;
    }

    .meta-time {
      font-size: 12px;
      color: var(--text-muted);
    }

    .kpi-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
    }

    .kpi-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 16px;
    }

    .kpi-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);

    }

    .kpi-value {
      font-size: 20px;
      font-weight: 700;
      color: var(--accent);
      margin-top: 2px;
      font-variant-numeric: tabular-nums;
    }

    .sql-box {
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 16px;
      font-family: var(--font-mono);
      font-size: 12px;
      color: #f1f5f9;
      white-space: pre-wrap;
      word-break: break-word;
      position: relative;
    }

    .copy-sql-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      background: var(--bg-hover);
      border: 1px solid var(--border);
      color: var(--text-muted);
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .copy-sql-btn:hover {
      color: #fff;
      background: var(--accent);
      border-color: var(--accent);
    }

    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px 16px;
    }

    .search-box {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--bg-dark);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px 12px;
      width: 320px;
      max-width: 100%;
    }

    .search-box input {
      background: transparent;
      border: none;
      color: var(--text);
      font-size: 13px;
      width: 100%;
      outline: none;
    }

    .toolbar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn {
      background: var(--bg-hover);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }

    .btn:hover {
      background: var(--border);
      border-color: var(--accent);
      color: #fff;
    }

    .btn-primary {
      background: var(--accent);
      color: #0f1115;
      font-weight: 600;
      border-color: var(--accent);
    }

    .btn-primary:hover {
      background: #7dd3fc;
      border-color: #7dd3fc;
      color: #0f1115;
    }

    .grid-container {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }

    .table-wrapper {
      overflow-x: auto;
      max-height: 600px;
      overflow-y: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }

    th {
      background: #1a1d26;
      color: #cbd5e1;
      font-weight: 600;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 10;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }

    th:hover {
      background: #232734;
      color: var(--accent);
    }

    th .sort-icon {
      font-size: 10px;
      margin-left: 6px;
      opacity: 0.5;
    }

    th.sorted .sort-icon {
      opacity: 1;
      color: var(--accent);
    }

    td {
      padding: 8px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      color: var(--text);
      font-family: var(--font-mono);
      font-size: 12px;
      white-space: nowrap;
    }

    tr:hover td {
      background: rgba(56, 189, 248, 0.05);
    }

    .null-val {
      color: #64748b;
      font-style: italic;
    }

    .pagination-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: var(--bg-card);
      border-top: 1px solid var(--border);
      flex-wrap: wrap;
      gap: 12px;
    }

    .page-info {
      color: var(--text-muted);
      font-size: 12px;
    }

    .page-controls {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    select.page-size-select {
      background: var(--bg-dark);
      color: var(--text);
      border: 1px solid var(--border);
      padding: 4px 8px;
      border-radius: 6px;
      outline: none;
    }

    footer {
      text-align: center;
      color: var(--text-muted);
      font-size: 11px;
      padding: 16px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-top">
        <div class="brand">
          <div class="brand-logo">D</div>
          <div>
            <div class="brand-title">${escHtml(title)}</div>
            <div class="meta-time">Generated on ${timestamp} via DataStuff IDE</div>
          </div>
        </div>
      </div>

      <div class="kpi-row">
        <div class="kpi-card">
          <div class="kpi-label">Total Rows</div>
          <div class="kpi-value" id="kpi-rows">${totalRows.toLocaleString()}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Columns</div>
          <div class="kpi-value">${columns.length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Elapsed Time</div>
          <div class="kpi-value">${elapsedMs} ms</div>
        </div>
      </div>

      <div class="sql-box">
        <button class="copy-sql-btn" onclick="copySql()">Copy SQL</button>
        <code id="sql-text">${escHtml(sqlText)}</code>
      </div>
    </header>

    <div class="toolbar">
      <div class="search-box">
        🔍 <input type="text" id="search-input" placeholder="Search table contents..." oninput="onSearchChange()">
      </div>

      <div class="toolbar-actions">
        <button class="btn" onclick="copyTableAsCsv()">📋 Copy CSV</button>
        <button class="btn btn-primary" onclick="downloadCsv()">📥 Download CSV</button>
      </div>
    </div>

    <div class="grid-container">
      <div class="table-wrapper">
        <table id="data-table">
          <thead>
            <tr>
              ${columns
                .map(
                  (col, idx) =>
                    `<th onclick="sortTable(${idx})">${escHtml(col)}<span class="sort-icon" id="sort-icon-${idx}">↕</span></th>`,
                )
                .join("")}
            </tr>
          </thead>
          <tbody id="table-body">
            <!-- Rows rendered dynamically by JS -->
          </tbody>
        </table>
      </div>

      <div class="pagination-bar">
        <div class="page-info" id="page-info">Showing 0 rows</div>
        <div class="page-controls">
          <label>Rows per page:
            <select class="page-size-select" id="page-size-select" onchange="onPageSizeChange()">
              <option value="25" selected>25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="500">500</option>
              <option value="-1">All</option>
            </select>
          </label>
          <button class="btn" id="btn-prev" onclick="prevPage()">‹ Prev</button>
          <button class="btn" id="btn-next" onclick="nextPage()">Next ›</button>
        </div>
      </div>
    </div>

    <footer>
      Exported with DataStuff IDE • Interactive Offline Data Dashboard
    </footer>
  </div>

  <script>
    const DATA = ${tableDataJson};
    let filteredIndices = DATA.rows.map((_, i) => i);
    let currentPage = 1;
    let pageSize = 25;
    let sortColumnIndex = -1;
    let sortAscending = true;

    function renderTable() {
      const tbody = document.getElementById('table-body');
      const startIdx = pageSize === -1 ? 0 : (currentPage - 1) * pageSize;
      const endIdx = pageSize === -1 ? filteredIndices.length : Math.min(startIdx + pageSize, filteredIndices.length);
      const pageRowIndices = filteredIndices.slice(startIdx, endIdx);

      let html = '';
      for (const rowIdx of pageRowIndices) {
        const row = DATA.rows[rowIdx];
        html += '<tr>';
        for (const cell of row) {
          if (cell === null || cell === undefined) {
            html += '<td><span class="null-val">NULL</span></td>';
          } else {
            const str = String(cell);
            const escaped = str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            html += '<td>' + escaped + '</td>';
          }
        }
        html += '</tr>';
      }
      tbody.innerHTML = html;

      // Update Pagination UI
      const total = filteredIndices.length;
      document.getElementById('kpi-rows').innerText = total.toLocaleString();
      const pageInfo = total === 0 ? 'No matching rows' :
        pageSize === -1 ? \`Showing all \${total} rows\` :
        \`Showing \${startIdx + 1} to \${endIdx} of \${total} rows\`;
      document.getElementById('page-info').innerText = pageInfo;

      document.getElementById('btn-prev').disabled = currentPage <= 1 || pageSize === -1;
      document.getElementById('btn-next').disabled = endIdx >= total || pageSize === -1;
    }

    function onSearchChange() {
      const q = document.getElementById('search-input').value.toLowerCase().trim();
      if (!q) {
        filteredIndices = DATA.rows.map((_, i) => i);
      } else {
        filteredIndices = [];
        for (let i = 0; i < DATA.rows.length; i++) {
          const row = DATA.rows[i];
          const match = row.some(cell => cell !== null && String(cell).toLowerCase().includes(q));
          if (match) filteredIndices.push(i);
        }
      }
      currentPage = 1;
      if (sortColumnIndex !== -1) applySort();
      else renderTable();
    }

    function sortTable(colIdx) {
      if (sortColumnIndex === colIdx) {
        sortAscending = !sortAscending;
      } else {
        sortColumnIndex = colIdx;
        sortAscending = true;
      }

      // Reset icons
      for (let i = 0; i < DATA.columns.length; i++) {
        const icon = document.getElementById('sort-icon-' + i);
        if (icon) {
          icon.innerText = i === colIdx ? (sortAscending ? '▲' : '▼') : '↕';
          icon.parentElement.classList.toggle('sorted', i === colIdx);
        }
      }

      applySort();
    }

    function applySort() {
      if (sortColumnIndex === -1) return renderTable();
      const idx = sortColumnIndex;
      filteredIndices.sort((aIdx, bIdx) => {
        const aVal = DATA.rows[aIdx][idx];
        const bVal = DATA.rows[bIdx][idx];
        if (aVal === bVal) return 0;
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        const numA = Number(aVal);
        const numB = Number(bVal);
        if (!isNaN(numA) && !isNaN(numB)) {
          return sortAscending ? numA - numB : numB - numA;
        }
        return sortAscending
          ? String(aVal).localeCompare(String(bVal))
          : String(bVal).localeCompare(String(aVal));
      });
      renderTable();
    }

    function onPageSizeChange() {
      pageSize = Number(document.getElementById('page-size-select').value);
      currentPage = 1;
      renderTable();
    }

    function prevPage() {
      if (currentPage > 1) {
        currentPage--;
        renderTable();
      }
    }

    function nextPage() {
      const maxPage = Math.ceil(filteredIndices.length / pageSize);
      if (currentPage < maxPage) {
        currentPage++;
        renderTable();
      }
    }

    function copySql() {
      const text = document.getElementById('sql-text').innerText;
      navigator.clipboard.writeText(text);
      alert('SQL query copied to clipboard!');
    }

    function getCsvString() {
      let csv = DATA.columns.map(c => '"' + c.replace(/"/g, '""') + '"').join(',') + '\\n';
      for (const idx of filteredIndices) {
        const row = DATA.rows[idx];
        csv += row.map(cell => {
          if (cell === null || cell === undefined) return '""';
          return '"' + String(cell).replace(/"/g, '""') + '"';
        }).join(',') + '\\n';
      }
      return csv;
    }

    function copyTableAsCsv() {
      navigator.clipboard.writeText(getCsvString());
      alert('CSV data copied to clipboard!');
    }

    function downloadCsv() {
      const blob = new Blob([getCsvString()], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', 'dashboard-data.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    // Initial render
    renderTable();
  </script>
</body>
</html>`;
}
