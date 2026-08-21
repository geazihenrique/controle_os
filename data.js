import {
  cleanMultilineText,
  cleanText,
  extractLocation,
  formatDate,
  parseCSV,
  parseDateBR,
  slugify,
  splitNames,
  toDateKey,
  uniqueSorted,
} from './utils.js';

const SHEET_ID = '1ul3w4dGk218jWlteoto9fFROzZT9r05NE3Fcy2fG77Q';
const SHEET_GID = '241851784';
const PUBLISHED_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/pub?gid=${SHEET_GID}&single=true&output=csv`;
const LEGACY_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
const MIN_OS_NUMBER = 3053;

const COLUMN_INDEX = {
  os: 0,
  client: 1,
  approvalDate: 2,
  deliveryDate: 3,
  description: 4,
  serviceType: 5,
  status: 6,
  logistics: 7,
  producer: 8,
  salesperson: 9,
  observations: 10,
  collaborators: 11,
  installedBy: 15,
  installationDate: 16,
};

export async function fetchJobs() {
  const { rows, sourceUrl } = await fetchSheetRows();
  const headerIndex = findHeaderIndex(rows);

  if (headerIndex === -1) {
    throw new Error('Cabeçalho da planilha não encontrado.');
  }

  const normalizedJobs = rows
    .slice(headerIndex + 1)
    .map((row, rowIndex) => normalizeRow(row, rowIndex + headerIndex + 2))
    .filter(Boolean)
    .filter((job) => job.osNumber >= MIN_OS_NUMBER)
    .sort((left, right) => {
      const dateDifference = left.effectiveDate - right.effectiveDate;
      if (dateDifference !== 0) {
        return dateDifference;
      }
      return left.os.localeCompare(right.os, 'pt-BR', { numeric: true, sensitivity: 'base' });
    });

  attachConflicts(normalizedJobs);

  return {
    jobs: normalizedJobs,
    filters: {
      responsibles: uniqueSorted(normalizedJobs.map((job) => job.responsible)),
      statuses: uniqueSorted(normalizedJobs.map((job) => job.status)),
      serviceTypes: uniqueSorted(normalizedJobs.map((job) => job.serviceType)),
    },
    meta: {
      sourceUrl,
      updatedAt: new Date(),
    },
  };
}

async function fetchSheetRows() {
  const sourceUrls = [PUBLISHED_CSV_URL, LEGACY_CSV_URL];
  let lastError = null;

  for (const sourceUrl of sourceUrls) {
    try {
      const response = await fetch(`${sourceUrl}${sourceUrl.includes('?') ? '&' : '?'}t=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Falha HTTP ${response.status}`);
      }

      const csvText = await response.text();
      if (looksLikeHtml(csvText)) {
        throw new Error('A fonte pública retornou HTML em vez de CSV.');
      }

      const rows = parseCSV(csvText);
      if (rows.length === 0) {
        throw new Error('A planilha pública foi carregada sem linhas válidas.');
      }

      return { rows, sourceUrl };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Não foi possível carregar a planilha pública.');
}

function findHeaderIndex(rows) {
  return rows.findIndex((row) => {
    const firstCell = compactHeaderValue(row[0]);
    const secondCell = compactHeaderValue(row[1]);
    const thirdCell = compactHeaderValue(row[2]);
    const fourthCell = compactHeaderValue(row[3]);

    return (
      (firstCell === 'os' && secondCell.includes('cliente')) ||
      (secondCell.includes('cliente') &&
        thirdCell.includes('dataaprov') &&
        fourthCell.includes('datadeentrega'))
    );
  });
}

function compactHeaderValue(value) {
  return slugify(value).replace(/\s+/g, '');
}

function looksLikeHtml(value) {
  const normalized = String(value ?? '').trimStart().toLowerCase();
  return normalized.startsWith('<!doctype html') || normalized.startsWith('<html');
}

function normalizeRow(row, sourceLine) {
  const os = cleanText(row[COLUMN_INDEX.os]);
  if (!os || slugify(os) === 'os') {
    return null;
  }

  const osNumber = Number.parseInt(os, 10);
  if (Number.isNaN(osNumber)) {
    return null;
  }

  // The dashboard always prefers the real delivery date and only falls back
  // to the approval date when the delivery date is missing or invalid.
  const approvalDate = parseDateBR(row[COLUMN_INDEX.approvalDate]);
  const deliveryDate = parseDateBR(row[COLUMN_INDEX.deliveryDate]);
  const effectiveDate = deliveryDate || approvalDate;
  if (!effectiveDate) {
    return null;
  }

  const client = cleanText(row[COLUMN_INDEX.client]) || 'Cliente não informado';
  const description = cleanMultilineText(row[COLUMN_INDEX.description]) || 'Descrição não informada';
  const serviceType = cleanText(row[COLUMN_INDEX.serviceType]) || 'Não informado';
  const status = cleanText(row[COLUMN_INDEX.status]) || 'Não informado';
  const logistics = cleanText(row[COLUMN_INDEX.logistics]) || 'Não informado';
  const producer = cleanText(row[COLUMN_INDEX.producer]);
  const salesperson = cleanText(row[COLUMN_INDEX.salesperson]);
  const responsible = producer || salesperson || 'Não informado';
  const observations = cleanMultilineText(row[COLUMN_INDEX.observations]);
  const installers = splitNames(row[COLUMN_INDEX.collaborators]);
  const installationDate = parseDateBR(row[COLUMN_INDEX.installationDate]);
  const installedBy = cleanText(row[COLUMN_INDEX.installedBy]);
  const location = extractLocation(observations, description) || 'Não identificado';

  return {
    id: `${os}-${sourceLine}`,
    os,
    osNumber,
    client,
    approvalDate,
    deliveryDate,
    effectiveDate,
    usesFallbackDate: !deliveryDate && Boolean(approvalDate),
    description,
    shortDescription: buildShortDescription(description),
    serviceType,
    status,
    logistics,
    producer,
    salesperson,
    responsible,
    observations,
    installers,
    installationDate,
    installedBy,
    location,
    sourceLine,
    displayDateLabel: formatDate(effectiveDate),
    deliveryDateLabel: deliveryDate ? formatDate(deliveryDate) : 'A definir',
    installationDateLabel: installationDate ? formatDate(installationDate) : 'Não informada',
    conflictEntries: [],
    hasConflict: false,
  };
}

function buildShortDescription(description) {
  if (description.length <= 110) {
    return description;
  }
  return `${description.slice(0, 107).trimEnd()}...`;
}

function attachConflicts(jobs) {
  const conflictMap = new Map();

  jobs.forEach((job) => {
    // Conflict detection only applies when there is a real delivery date.
    if (!job.deliveryDate || job.installers.length === 0) {
      return;
    }

    const dateKey = toDateKey(job.deliveryDate);
    job.installers.forEach((installerName) => {
      const installerKey = slugify(installerName);
      if (!installerKey) {
        return;
      }
      const combinedKey = `${dateKey}::${installerKey}`;
      const entries = conflictMap.get(combinedKey) || [];
      entries.push({ os: job.os, jobId: job.id, installerName });
      conflictMap.set(combinedKey, entries);
    });
  });

  jobs.forEach((job) => {
    if (!job.deliveryDate || job.installers.length === 0) {
      return;
    }

    const dateKey = toDateKey(job.deliveryDate);
    const conflictEntries = [];

    job.installers.forEach((installerName) => {
      const matches = conflictMap.get(`${dateKey}::${slugify(installerName)}`) || [];
      const others = matches.filter((entry) => entry.jobId !== job.id);
      if (others.length === 0) {
        return;
      }

      conflictEntries.push({
        installer: installerName,
        otherOs: uniqueSorted(others.map((entry) => entry.os)),
      });
    });

    if (conflictEntries.length > 0) {
      job.conflictEntries = conflictEntries;
      job.hasConflict = true;
    }
  });
}
