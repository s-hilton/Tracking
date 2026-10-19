// A small .xlsx writer: enough for exporting tables (no dependencies).
//
//   const bytes = buildXlsx([{ name: 'Companies', columns: [{ header: 'Name', width: 30 }], rows: [['Acme']] }]);
//
// Cell values: string, number, boolean, null/'' (blank), or
//   { date: 'YYYY-MM-DD' }, { dateTime: ms }, { money: n }, { url, text }.
// Each sheet gets a bold header row that stays put when scrolling, and filters.

const enc = new TextEncoder();

// Excel stores dates as days since 1899-12-30 (local time).
const EPOCH = Date.UTC(1899, 11, 30);
const serial = (y, m, d, ms = 0) => (Date.UTC(y, m, d) - EPOCH + ms) / 86400000;
const dateSerial = (iso) => { const [y, m, d] = iso.split('-').map(Number); return serial(y, m - 1, d); };
const dateTimeSerial = (ms) => {
  const t = new Date(ms);
  return serial(t.getFullYear(), t.getMonth(), t.getDate(), ((t.getHours() * 60 + t.getMinutes()) * 60 + t.getSeconds()) * 1000);
};

// Text Excel accepts: escaped, without control characters, at most 32,767 characters.
const xmlText = (s) => String(s)
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
  .slice(0, 32767)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const colName = (i) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

// Style ids (see STYLES): 1 header, 2 date, 3 date + time, 4 money, 5 wrapped text, 6 link.
function cell(ref, v) {
  if (v == null || v === '') return '';
  const str = (s, style = 0) => `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${xmlText(s)}</t></is></c>`;
  if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"><v>${v}</v></c>` : '';
  if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
  if (typeof v === 'string') return str(v, v.includes('\n') ? 5 : 0);
  if (v.date) return /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? `<c r="${ref}" s="2"><v>${dateSerial(v.date)}</v></c>` : str(v.date);
  if (v.dateTime != null) return `<c r="${ref}" s="3"><v>${dateTimeSerial(v.dateTime)}</v></c>`;
  if (v.money != null) return `<c r="${ref}" s="4"><v>${Number(v.money)}</v></c>`;
  if (v.url) return /^https?:\/\//i.test(v.url) ? `<c r="${ref}" t="str" s="6"><f>${xmlText(`HYPERLINK("${v.url.replace(/"/g, '""')}","${String(v.text ?? v.url).replace(/"/g, '""')}")`)}</f><v>${xmlText(v.text ?? v.url)}</v></c>` : str(v.text ?? v.url);
  return '';
}

function sheetXml({ columns, rows }) {
  const last = colName(columns.length - 1);
  const all = [columns.map((c) => c.header), ...rows];
  const body = all.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => (ri === 0
    ? `<c r="${colName(ci)}1" t="inlineStr" s="1"><is><t>${xmlText(v)}</t></is></c>`
    : cell(`${colName(ci)}${ri + 1}`, v))).join('')}</row>`).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<dimension ref="A1:${last}${all.length}"/>`
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + `<cols>${columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 16}" customWidth="1"/>`).join('')}</cols>`
    + `<sheetData>${body}</sheetData>`
    + (rows.length ? `<autoFilter ref="A1:${last}${all.length}"/>` : '')
    + '</worksheet>';
}

const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<numFmts count="3"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd hh:mm"/><numFmt numFmtId="166" formatCode="#,##0"/></numFmts>'
  + '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Calibri"/></font></fonts>'
  + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/></patternFill></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="7">'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
  + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
  + '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
  + '</cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
  + '</styleSheet>';

// Sheet names: unique, at most 31 characters, none of []:*?/\
function sheetNames(sheets) {
  const used = new Set();
  return sheets.map((s) => {
    const base = String(s.name).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet';
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 28)} ${i}`;
    used.add(name.toLowerCase());
    return name;
  });
}

export function buildXlsx(sheets) {
  const names = sheetNames(sheets);
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '</Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + `<sheets>${names.map((n, i) => `<sheet name="${xmlText(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`
      + `<definedNames>${sheets.map((s, i) => (s.rows.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xmlText(names[i].replace(/'/g, "''"))}'!$A$1:$${colName(s.columns.length - 1)}$${s.rows.length + 1}</definedName>` : '')).join('')}</definedNames>`
      + '</workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
      + '</Relationships>'],
    ['xl/styles.xml', STYLES],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]),
  ];
  return zip(files.map(([name, text]) => [name, enc.encode(text)]));
}

// ---- Zip (stored, no compression) ------------------------------------------------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(12, 0x21, true); // 1 Jan 1980, the earliest zip date
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(14, 0x21, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}
