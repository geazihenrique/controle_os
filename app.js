import { fetchJobs } from './data.js';
import {
  addMonths,
  debounce,
  endOfMonth,
  escapeHtml,
  formatDateLong,
  formatMonthYear,
  slugify,
  startOfMonth,
  toDateKey,
} from './utils.js';

const state = {
  jobs: [],
  filteredJobs: [],
  filters: {
    search: '',
    responsible: '',
    status: '',
    serviceType: '',
    period: 'all',
  },
  selectedJobId: '',
  currentMonth: startOfMonth(new Date()),
};

const elements = {
  calendarGrid: document.getElementById('calendar-grid'),
  calendarLabel: document.getElementById('calendar-label'),
  prevMonth: document.getElementById('prev-month'),
  nextMonth: document.getElementById('next-month'),
  searchInput: document.getElementById('search-input'),
  responsibleFilter: document.getElementById('responsible-filter'),
  statusFilter: document.getElementById('status-filter'),
  serviceTypeFilter: document.getElementById('service-type-filter'),
  periodFilter: document.getElementById('period-filter'),
  refreshData: document.getElementById('refresh-data'),
  osList: document.getElementById('os-list'),
  resultsCount: document.getElementById('results-count'),
  emptyState: document.getElementById('empty-state'),
  detailEmpty: document.getElementById('detail-empty'),
  detailContent: document.getElementById('detail-content'),
  detailTemplate: document.getElementById('detail-template'),
  detailDateChip: document.getElementById('detail-date-chip'),
  calendarLoading: document.getElementById('calendar-loading'),
  listLoading: document.getElementById('list-loading'),
};

init();

async function init() {
  wireEvents();
  await loadDashboard();
}

function wireEvents() {
  elements.prevMonth.addEventListener('click', () => {
    state.currentMonth = addMonths(state.currentMonth, -1);
    renderCalendar();
    if (state.filters.period === 'month') {
      applyFilters();
    }
  });

  elements.nextMonth.addEventListener('click', () => {
    state.currentMonth = addMonths(state.currentMonth, 1);
    renderCalendar();
    if (state.filters.period === 'month') {
      applyFilters();
    }
  });

  elements.searchInput.addEventListener(
    'input',
    debounce((event) => {
      state.filters.search = event.target.value.trim().toLowerCase();
      applyFilters();
    }),
  );

  [
    ['responsibleFilter', 'responsible'],
    ['statusFilter', 'status'],
    ['serviceTypeFilter', 'serviceType'],
    ['periodFilter', 'period'],
  ].forEach(([elementKey, filterKey]) => {
    elements[elementKey].addEventListener('change', (event) => {
      state.filters[filterKey] = event.target.value;
      applyFilters();
    });
  });

  elements.refreshData.addEventListener('click', async () => {
    elements.refreshData.disabled = true;
    elements.refreshData.textContent = 'Atualizando...';
    try {
      await loadDashboard();
    } finally {
      elements.refreshData.disabled = false;
      elements.refreshData.textContent = 'Atualizar dados';
    }
  });
}

async function loadDashboard() {
  toggleLoading(true);

  try {
    const payload = await fetchJobs();
    state.jobs = payload.jobs;
    populateSelect(elements.responsibleFilter, payload.filters.responsibles);
    populateSelect(elements.statusFilter, payload.filters.statuses);
    populateSelect(elements.serviceTypeFilter, payload.filters.serviceTypes);

    const currentMonthWithJobs = payload.jobs.find(
      (job) =>
        job.effectiveDate.getMonth() === state.currentMonth.getMonth() &&
        job.effectiveDate.getFullYear() === state.currentMonth.getFullYear(),
    );

    if (!currentMonthWithJobs && payload.jobs.length > 0) {
      state.currentMonth = startOfMonth(payload.jobs[0].effectiveDate);
    }

    applyFilters();
  } catch (error) {
    renderFailureState(error);
  } finally {
    toggleLoading(false);
  }
}

function populateSelect(selectElement, values) {
  const firstOption = selectElement.querySelector('option');
  selectElement.innerHTML = '';
  selectElement.append(firstOption);
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    selectElement.append(option);
  });
}

function applyFilters() {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const searchTerm = slugify(state.filters.search);

  state.filteredJobs = state.jobs.filter((job) => {
    const matchesSearch =
      !searchTerm ||
      [job.os, job.client, job.description].some((field) =>
        slugify(field).includes(searchTerm),
      );

    const matchesResponsible =
      !state.filters.responsible || job.responsible === state.filters.responsible;
    const matchesStatus = !state.filters.status || job.status === state.filters.status;
    const matchesServiceType =
      !state.filters.serviceType || job.serviceType === state.filters.serviceType;
    const isUpcoming = job.effectiveDate >= now;
    const matchesPeriod = matchPeriod(job.effectiveDate, state.filters.period, now);

    return (
      matchesSearch &&
      matchesResponsible &&
      matchesStatus &&
      matchesServiceType &&
      isUpcoming &&
      matchesPeriod
    );
  });

  syncSelection();
  renderCalendar();
  renderList();
  renderDetail();
}

function matchPeriod(date, period, now) {
  if (period === 'all') {
    return true;
  }

  if (period === 'month') {
    return (
      date.getMonth() === state.currentMonth.getMonth() &&
      date.getFullYear() === state.currentMonth.getFullYear()
    );
  }

  const days = Number(period);
  if (Number.isNaN(days)) {
    return true;
  }

  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + days);
  return date >= now && date <= maxDate;
}

function syncSelection() {
  const selectionStillVisible = state.filteredJobs.some((job) => job.id === state.selectedJobId);
  if (!selectionStillVisible) {
    state.selectedJobId = state.filteredJobs[0]?.id || '';
  }
}

function renderCalendar() {
  elements.calendarLabel.textContent = capitalize(formatMonthYear(state.currentMonth));
  const dayNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];
  const monthStart = startOfMonth(state.currentMonth);
  const monthEnd = endOfMonth(state.currentMonth);
  const jobsByDate = groupJobsByDate(state.filteredJobs);
  const calendarDates = buildCalendarDates(monthStart, monthEnd);

  elements.calendarGrid.innerHTML = '';

  dayNames.forEach((name) => {
    const dayHeader = document.createElement('div');
    dayHeader.className = 'day-name';
    dayHeader.textContent = name;
    elements.calendarGrid.append(dayHeader);
  });

  calendarDates.forEach((date) => {
    const card = document.createElement('article');
    const dateKey = toDateKey(date);
    const jobs = jobsByDate.get(dateKey) || [];
    const isCurrentMonth = date.getMonth() === state.currentMonth.getMonth();
    const hasConflict = jobs.some((job) => job.hasConflict && !job.usesFallbackDate);

    card.className = `calendar-day${isCurrentMonth ? '' : ' is-muted'}${hasConflict ? ' is-conflict' : ''}`;

    const dayHeader = document.createElement('div');
    dayHeader.className = 'calendar-day-head';
    dayHeader.innerHTML = `<span>${date.getDate()}</span><small>${jobs.length || ''}</small>`;
    card.append(dayHeader);

    const jobsContainer = document.createElement('div');
    jobsContainer.className = 'calendar-day-jobs';

    jobs.slice(0, 3).forEach((job) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `calendar-job${job.id === state.selectedJobId ? ' is-selected' : ''}`;
      button.innerHTML = `
        <span class="calendar-job-os">OS ${escapeHtml(job.os)}</span>
        <span class="calendar-job-client">${escapeHtml(job.client)}</span>
        ${job.usesFallbackDate ? '<span class="mini-badge warning">A definir</span>' : ''}
        ${job.hasConflict ? '<span class="mini-badge danger">Conflito</span>' : ''}
      `;
      button.addEventListener('click', () => selectJob(job.id));
      jobsContainer.append(button);
    });

    if (jobs.length > 3) {
      const more = document.createElement('p');
      more.className = 'calendar-more';
      more.textContent = `+${jobs.length - 3} OS`;
      jobsContainer.append(more);
    }

    card.append(jobsContainer);
    elements.calendarGrid.append(card);
  });
}

function buildCalendarDates(monthStart, monthEnd) {
  const dates = [];
  const firstWeekday = getWeekdayIndex(monthStart);
  const lastWeekday = getWeekdayIndex(monthEnd);
  const cursor = new Date(monthStart);
  cursor.setDate(cursor.getDate() - firstWeekday);

  const endCursor = new Date(monthEnd);
  endCursor.setDate(endCursor.getDate() + (6 - lastWeekday));

  while (cursor <= endCursor) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function getWeekdayIndex(date) {
  return (date.getDay() + 6) % 7;
}

function groupJobsByDate(jobs) {
  return jobs.reduce((map, job) => {
    const dateKey = toDateKey(job.effectiveDate);
    const entries = map.get(dateKey) || [];
    entries.push(job);
    map.set(dateKey, entries);
    return map;
  }, new Map());
}

function renderList() {
  elements.osList.innerHTML = '';
  elements.resultsCount.textContent = `${state.filteredJobs.length} OS exibidas`;
  elements.emptyState.hidden = state.filteredJobs.length > 0;

  state.filteredJobs.forEach((job) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `os-card${job.id === state.selectedJobId ? ' is-selected' : ''}`;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(job.id === state.selectedJobId));
    button.innerHTML = buildCardMarkup(job);
    button.addEventListener('click', () => selectJob(job.id));
    elements.osList.append(button);
  });
}

function buildCardMarkup(job) {
  const installers = job.installers.length > 0 ? job.installers.join(', ') : 'Nao informado';
  const conflictHtml = job.hasConflict
    ? `<span class="badge badge-danger">Conflito de instalador</span>`
    : '';
  const fallbackHtml = job.usesFallbackDate
    ? `<span class="badge badge-warning">A definir</span>`
    : '';

  return `
    <div class="os-card-head">
      <div>
        <p class="os-number">OS ${escapeHtml(job.os)}</p>
        <h3>${escapeHtml(job.client)}</h3>
      </div>
      <div class="card-date-block">
        <strong>${escapeHtml(job.displayDateLabel)}</strong>
        <span>${job.usesFallbackDate ? 'Data de aprovacao' : 'Data de entrega'}</span>
      </div>
    </div>

    <p class="os-description">${escapeHtml(job.shortDescription)}</p>

    <div class="badge-row">
      <span class="badge">${escapeHtml(job.status)}</span>
      <span class="badge">${escapeHtml(job.serviceType)}</span>
      ${fallbackHtml}
      ${conflictHtml}
    </div>

    <dl class="card-meta-grid">
      <div>
        <dt>Responsável</dt>
        <dd>${escapeHtml(job.responsible)}</dd>
      </div>
      <div>
        <dt>Instaladores</dt>
        <dd>${escapeHtml(installers)}</dd>
      </div>
      <div>
        <dt>Logística</dt>
        <dd>${escapeHtml(job.logistics)}</dd>
      </div>
      <div>
        <dt>Local</dt>
        <dd>${escapeHtml(job.location)}</dd>
      </div>
    </dl>

    ${
      job.hasConflict
        ? `<p class="conflict-inline">${escapeHtml(formatConflictSummary(job))}</p>`
        : ''
    }
  `;
}

function renderDetail() {
  const job = state.filteredJobs.find((entry) => entry.id === state.selectedJobId);

  if (!job) {
    elements.detailEmpty.hidden = false;
    elements.detailContent.hidden = true;
    elements.detailDateChip.textContent = '';
    return;
  }

  elements.detailEmpty.hidden = true;
  elements.detailContent.hidden = false;
  elements.detailDateChip.textContent = formatDateLong(job.effectiveDate);

  const fragment = elements.detailTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.detail-card');
  const grid = fragment.querySelector('.detail-grid');
  const badges = fragment.querySelector('[data-detail="badges"]');
  const conflictBlock = fragment.querySelector('[data-detail="conflict-block"]');

  fragment.querySelector('[data-detail="os"]').textContent = `OS ${job.os}`;
  fragment.querySelector('[data-detail="client"]').textContent = job.client;
  fragment.querySelector('[data-detail="description"]').textContent = job.description;

  if (job.usesFallbackDate) {
    badges.append(buildBadge('A definir', 'warning'));
  }
  if (job.hasConflict) {
    badges.append(buildBadge('Conflito de instalador', 'danger'));
    conflictBlock.hidden = false;
    conflictBlock.innerHTML = `<strong>Atenção operacional.</strong><span>${escapeHtml(
      formatConflictSummary(job),
    )}</span>`;
  }

  const detailFields = [
    ['Status', job.status],
    ['Tipo de serviço', job.serviceType],
    ['Responsável', job.responsible],
    ['Vendedor / atendimento', job.salesperson || 'Nao informado'],
    ['Logística', job.logistics],
    ['Local', job.location],
    ['Data de entrega', job.deliveryDateLabel],
    ['Data de instalação', job.installationDateLabel],
    ['Instaladores', job.installers.join(', ') || 'Nao informado'],
    ['Instalado por', job.installedBy || 'Nao informado'],
    ['Observações gerenciais', job.observations || 'Sem observações'],
  ];

  detailFields.forEach(([label, value]) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'detail-item';
    wrapper.innerHTML = `
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value).replace(/\n/g, '<br />')}</dd>
    `;
    grid.append(wrapper);
  });

  elements.detailContent.innerHTML = '';
  elements.detailContent.append(card);
}

function buildBadge(label, tone = '') {
  const badge = document.createElement('span');
  badge.className = `badge${tone ? ` badge-${tone}` : ''}`;
  badge.textContent = label;
  return badge;
}

function formatConflictSummary(job) {
  return job.conflictEntries
    .map((entry) => `${entry.installer} em conflito com OS ${entry.otherOs.join(', ')}`)
    .join(' | ');
}

function selectJob(jobId) {
  state.selectedJobId = jobId;
  renderCalendar();
  renderList();
  renderDetail();
}

function toggleLoading(isLoading) {
  elements.calendarLoading.style.display = isLoading ? 'block' : 'none';
  elements.listLoading.style.display = isLoading ? 'block' : 'none';
}

function renderFailureState(error) {
  const message = error instanceof Error ? error.message : 'Falha ao carregar dados.';
  elements.calendarGrid.innerHTML = `<div class="empty-state visible"><h3>Falha ao carregar</h3><p>${escapeHtml(
    message,
  )}</p></div>`;
  elements.osList.innerHTML = '';
  elements.emptyState.hidden = false;
  elements.emptyState.querySelector('h3').textContent = 'Falha ao carregar dados';
  elements.emptyState.querySelector('p').textContent = message;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
