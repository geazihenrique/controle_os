import { fetchJobs } from './data.js';
import {
  addMonths,
  endOfMonth,
  escapeHtml,
  formatDateLong,
  formatMonthYear,
  slugify,
  startOfMonth,
  toDateKey,
} from './utils.js';

const AUTO_REFRESH_INTERVAL = 10 * 60 * 1000;

const state = {
  jobs: [],
  calendarJobs: [],
  listJobs: [],
  filters: {
    search: '',
    responsible: '',
    status: '',
    serviceType: '',
  },
  selectedJobId: '',
  currentMonth: startOfMonth(new Date()),
  lastUpdatedAt: null,
};

const elements = {
  calendarGrid: document.getElementById('calendar-grid'),
  calendarLabel: document.getElementById('calendar-label'),
  prevMonth: document.getElementById('prev-month'),
  nextMonth: document.getElementById('next-month'),
  searchInput: document.getElementById('search-input'),
  searchButton: document.getElementById('search-button'),
  responsibleFilter: document.getElementById('responsible-filter'),
  statusFilter: document.getElementById('status-filter'),
  serviceTypeFilter: document.getElementById('service-type-filter'),
  lastUpdated: document.getElementById('last-updated'),
  osList: document.getElementById('os-list'),
  resultsCount: document.getElementById('results-count'),
  emptyState: document.getElementById('empty-state'),
  detailContent: document.getElementById('detail-content'),
  detailTemplate: document.getElementById('detail-template'),
  detailDateChip: document.getElementById('detail-date-chip'),
  calendarLoading: document.getElementById('calendar-loading'),
  listLoading: document.getElementById('list-loading'),
};

init();

async function init() {
  wireEvents();
  await loadDashboard({ isInitialLoad: true });
  window.setInterval(() => {
    loadDashboard({ preserveMonth: true, backgroundRefresh: true });
  }, AUTO_REFRESH_INTERVAL);
}

function wireEvents() {
  elements.prevMonth.addEventListener('click', () => {
    state.currentMonth = addMonths(state.currentMonth, -1);
    applyFilters();
  });

  elements.nextMonth.addEventListener('click', () => {
    state.currentMonth = addMonths(state.currentMonth, 1);
    applyFilters();
  });

  elements.searchButton.addEventListener('click', () => {
    state.filters.search = elements.searchInput.value.trim();
    applyFilters();
  });

  elements.searchInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    state.filters.search = elements.searchInput.value.trim();
    applyFilters();
  });

  [
    ['responsibleFilter', 'responsible'],
    ['statusFilter', 'status'],
    ['serviceTypeFilter', 'serviceType'],
  ].forEach(([elementKey, filterKey]) => {
    elements[elementKey].addEventListener('change', (event) => {
      state.filters[filterKey] = event.target.value;
      applyFilters();
    });
  });
}

async function loadDashboard(options = {}) {
  const { isInitialLoad = false, preserveMonth = true, backgroundRefresh = false } = options;

  if (!backgroundRefresh) {
    toggleLoading(true);
  }

  try {
    const payload = await fetchJobs();
    state.jobs = payload.jobs;
    state.lastUpdatedAt = payload.meta.updatedAt;

    if (isInitialLoad && !preserveMonth) {
      state.currentMonth = startOfMonth(new Date());
    }

    populateSelect(
      elements.responsibleFilter,
      payload.filters.responsibles,
      state.filters.responsible,
    );
    populateSelect(elements.statusFilter, payload.filters.statuses, state.filters.status);
    populateSelect(
      elements.serviceTypeFilter,
      payload.filters.serviceTypes,
      state.filters.serviceType,
    );

    renderLastUpdated();
    applyFilters();
  } catch (error) {
    if (state.jobs.length > 0) {
      console.error(
        backgroundRefresh
          ? 'Falha ao atualizar dados automaticamente.'
          : 'Falha ao atualizar dados.',
        error,
      );
      return;
    }

    renderFailureState(error);
  } finally {
    if (!backgroundRefresh) {
      toggleLoading(false);
    }
  }
}

function populateSelect(selectElement, values, selectedValue = '') {
  const firstOptionLabel = selectElement.querySelector('option')?.textContent || 'Todos';
  selectElement.innerHTML = '';

  const firstOption = document.createElement('option');
  firstOption.value = '';
  firstOption.textContent = firstOptionLabel;
  selectElement.append(firstOption);

  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    selectElement.append(option);
  });

  selectElement.value = values.includes(selectedValue) ? selectedValue : '';
}

function renderLastUpdated() {
  elements.lastUpdated.textContent = state.lastUpdatedAt
    ? `Última atualização: ${formatLastUpdatedLabel(state.lastUpdatedAt)}`
    : '';
}

function formatLastUpdatedLabel(date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function applyFilters() {
  state.calendarJobs = state.jobs.filter((job) => {
    const matchesResponsible =
      !state.filters.responsible || job.responsible === state.filters.responsible;
    const matchesStatus = !state.filters.status || job.status === state.filters.status;
    const matchesServiceType =
      !state.filters.serviceType || job.serviceType === state.filters.serviceType;

    return matchesResponsible && matchesStatus && matchesServiceType;
  });

  state.listJobs = filterOperationalJobs(state.calendarJobs);
  state.listJobs = filterListJobsBySearch(state.listJobs, state.filters.search);

  syncSelection();
  renderCalendar();
  renderList();
  renderDetail();
}

function filterOperationalJobs(jobs) {
  const today = getTodayReference();

  return jobs.filter((job) => {
    if (job.effectiveDate >= today) {
      return true;
    }

    return isJobOverdue(job, today);
  });
}

function filterListJobsBySearch(jobs, searchValue) {
  const searchTerm = slugify(searchValue);
  if (!searchTerm) {
    return jobs;
  }

  return jobs.filter((job) =>
    [job.os, job.client, job.description].some((field) => slugify(field).includes(searchTerm)),
  );
}

function getTodayReference() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function isJobOverdue(job, referenceDate = getTodayReference()) {
  return job.effectiveDate < referenceDate && slugify(job.status) !== 'finalizado';
}

function syncSelection() {
  const selectionStillVisible = state.calendarJobs.some((job) => job.id === state.selectedJobId);
  if (!selectionStillVisible) {
    state.selectedJobId = state.listJobs[0]?.id || state.calendarJobs[0]?.id || '';
  }
}

function renderCalendar() {
  elements.calendarLabel.textContent = capitalize(formatMonthYear(state.currentMonth));
  const dayNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];
  const monthStart = startOfMonth(state.currentMonth);
  const monthEnd = endOfMonth(state.currentMonth);
  const jobsByDate = groupJobsByDate(state.calendarJobs);
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

    jobs.forEach((job) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `calendar-job${job.id === state.selectedJobId ? ' is-selected' : ''}${isJobOverdue(job) ? ' is-overdue' : ''}`;
      button.innerHTML = `
        <span class="calendar-job-os">OS ${escapeHtml(job.os)}</span>
        <span class="calendar-job-client">${escapeHtml(job.client)}</span>
      `;
      button.addEventListener('click', () => selectJob(job.id));
      jobsContainer.append(button);
    });

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
  elements.resultsCount.textContent = `${state.listJobs.length} OS exibidas`;
  elements.emptyState.hidden = state.listJobs.length > 0;

  state.listJobs.forEach((job) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `os-card${job.id === state.selectedJobId ? ' is-selected' : ''}${isJobOverdue(job) ? ' is-overdue' : ''}`;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(job.id === state.selectedJobId));
    button.innerHTML = buildCardMarkup(job);
    button.addEventListener('click', () => selectJob(job.id));
    elements.osList.append(button);
  });
}

function buildCardMarkup(job) {
  const installers = job.installers.length > 0 ? job.installers.join(', ') : 'Não informado';
  const conflictHtml = job.hasConflict
    ? `<span class="badge badge-danger">Conflito de instalador</span>`
    : '';
  const fallbackHtml = job.usesFallbackDate
    ? `<span class="badge badge-warning">A definir</span>`
    : '';
  const overdueHtml = isJobOverdue(job)
    ? `<span class="badge badge-danger">Em atraso</span>`
    : '';

  return `
    <div class="os-card-head${isJobOverdue(job) ? ' is-overdue' : ''}">
      <div>
        <p class="os-number">OS ${escapeHtml(job.os)}</p>
        <h3>${escapeHtml(job.client)}</h3>
      </div>
      <div class="card-date-block">
        <strong>${escapeHtml(job.displayDateLabel)}</strong>
        <span>${job.usesFallbackDate ? 'Data de aprovação' : 'Data de entrega'}</span>
      </div>
    </div>

    <p class="os-description">${escapeHtml(job.shortDescription)}</p>

    <div class="badge-row">
      <span class="badge">${escapeHtml(job.status)}</span>
      <span class="badge">${escapeHtml(job.serviceType)}</span>
      ${fallbackHtml}
      ${conflictHtml}
      ${overdueHtml}
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
  const job = state.calendarJobs.find((entry) => entry.id === state.selectedJobId);

  if (!job) {
    elements.detailContent.hidden = true;
    elements.detailContent.innerHTML = '';
    elements.detailDateChip.textContent = '';
    elements.detailDateChip.hidden = true;
    return;
  }

  elements.detailContent.hidden = false;
  elements.detailDateChip.textContent = formatDateLong(job.effectiveDate);
  elements.detailDateChip.hidden = false;

  const fragment = elements.detailTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.detail-card');
  const grid = fragment.querySelector('.detail-grid');
  const badges = fragment.querySelector('[data-detail="badges"]');

  fragment.querySelector('[data-detail="os"]').textContent = `OS ${job.os}`;
  fragment.querySelector('[data-detail="client"]').textContent = job.client;
  fragment.querySelector('[data-detail="description"]').textContent = job.description;

  if (job.usesFallbackDate) {
    badges.append(buildBadge('A definir', 'warning'));
  }
  if (isJobOverdue(job)) {
    badges.append(buildBadge('Em atraso', 'danger'));
  }
  if (job.hasConflict) {
    badges.append(buildBadge('Conflito de instalador', 'danger'));
    const conflictBlock = document.createElement('div');
    conflictBlock.className = 'alert-block';
    conflictBlock.innerHTML = `<strong>Atenção operacional.</strong><span>${escapeHtml(
      formatConflictSummary(job),
    )}</span>`;
    card.insertBefore(conflictBlock, grid);
  }

  const detailFields = [
    ['Status', job.status],
    ['Tipo de serviço', job.serviceType],
    ['Responsável', job.responsible],
    ['Vendedor / atendimento', job.salesperson || 'Não informado'],
    ['Logística', job.logistics],
    ['Data de entrega', job.deliveryDateLabel],
    ['Instaladores', job.installers.join(', ') || 'Não informado', 'is-full'],
    ['Observações gerenciais', job.observations || 'Sem observações', 'is-full'],
  ];

  detailFields.forEach(([label, value, modifierClass = '']) => {
    const wrapper = document.createElement('div');
    wrapper.className = `detail-item${modifierClass ? ` ${modifierClass}` : ''}`;
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
