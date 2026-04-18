const MONTH_MAP = {
  jan: 0,
  'jan.': 0,
  janeiro: 0,
  fev: 1,
  'fev.': 1,
  fevereiro: 1,
  mar: 2,
  'mar.': 2,
  marco: 2,
  março: 2,
  abr: 3,
  'abr.': 3,
  abril: 3,
  mai: 4,
  'mai.': 4,
  maio: 4,
  jun: 5,
  'jun.': 5,
  junho: 5,
  jul: 6,
  'jul.': 6,
  julho: 6,
  ago: 7,
  'ago.': 7,
  agosto: 7,
  set: 8,
  'set.': 8,
  setembro: 8,
  out: 9,
  'out.': 9,
  outubro: 9,
  nov: 10,
  'nov.': 10,
  novembro: 10,
  dez: 11,
  'dez.': 11,
  dezembro: 11,
};

export function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      currentRow.push(currentCell);
      if (currentRow.some((cell) => cell.trim() !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    if (currentRow.some((cell) => cell.trim() !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export function cleanText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanMultilineText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

export function slugify(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function splitNames(value) {
  return cleanMultilineText(value)
    .split(',')
    .map((item) => cleanText(item))
    .filter(Boolean);
}

export function parseDateBR(value) {
  const raw = cleanText(value);
  if (!raw || raw === '-' || slugify(raw) === 'a definir') {
    return null;
  }

  const normalized = raw
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, '')
    .replace(/[–—]/g, '-')
    .replace(/[ç]/g, 'c');

  const fullDateMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (fullDateMatch) {
    const day = Number(fullDateMatch[1]);
    const monthIndex = Number(fullDateMatch[2]) - 1;
    let year = Number(fullDateMatch[3]);
    if (year < 100) {
      year += year >= 70 ? 1900 : 2000;
    }
    return buildDate(year, monthIndex, day);
  }

  const monthNameMatch = normalized.match(/^(\d{1,2})\/?([a-z]+)$/);
  if (monthNameMatch) {
    const day = Number(monthNameMatch[1]);
    const monthIndex = MONTH_MAP[monthNameMatch[2]];
    if (monthIndex === undefined) {
      return null;
    }
    const inferredYear = inferYearFromMonth(monthIndex);
    return buildDate(inferredYear, monthIndex, day);
  }

  const dottedDateMatch = normalized.match(/^(\d{1,2})\.(\d{1,2})-(\d{2,4})$/);
  if (dottedDateMatch) {
    const day = Number(dottedDateMatch[1]);
    const monthIndex = Number(dottedDateMatch[2]) - 1;
    let year = Number(dottedDateMatch[3]);
    if (year < 100) {
      year += 2000;
    }
    return buildDate(year, monthIndex, day);
  }

  return null;
}

function inferYearFromMonth(monthIndex) {
  const currentYear = new Date().getFullYear();
  return monthIndex >= 9 ? currentYear - 1 : currentYear;
}

function buildDate(year, monthIndex, day) {
  if (
    Number.isNaN(year) ||
    Number.isNaN(monthIndex) ||
    Number.isNaN(day) ||
    monthIndex < 0 ||
    monthIndex > 11
  ) {
    return null;
  }

  const date = new Date(year, monthIndex, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null;
  }

  date.setHours(12, 0, 0, 0);
  return date;
}

export function formatDate(date) {
  if (!(date instanceof Date)) {
    return '-';
  }
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function formatMonthYear(date) {
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatDateLong(date) {
  if (!(date instanceof Date)) {
    return '-';
  }
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function toDateKey(date) {
  if (!(date instanceof Date)) {
    return '';
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

export function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12, 0, 0, 0);
}

export function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12, 0, 0, 0);
}

export function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, 'pt-BR', { sensitivity: 'base' }),
  );
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function extractLocation(observations, description) {
  const observationText = cleanMultilineText(observations);
  if (observationText) {
    const firstLine = observationText.split('\n')[0];
    const locationHints = ['rua', 'avenida', 'av ', 'alameda', 'rodovia', 'cep', 'instalação em'];
    if (locationHints.some((hint) => slugify(firstLine).includes(slugify(hint)))) {
      return firstLine;
    }

    const hyphenParts = firstLine.split('-').map((item) => cleanText(item)).filter(Boolean);
    if (hyphenParts.length > 1) {
      return hyphenParts[0];
    }

    if (firstLine.length >= 6 && firstLine.length <= 80) {
      return firstLine;
    }
  }

  const descriptionText = cleanText(description);
  const descriptionMatch = descriptionText.match(/\b(?:em|para)\s+([A-ZÀ-Ú][\wÀ-ú\s/-]{3,50})/i);
  return descriptionMatch ? cleanText(descriptionMatch[1]) : '';
}

export function debounce(callback, delay = 180) {
  let timeoutId;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), delay);
  };
}
