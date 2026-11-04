/* Flatpickr 4.6.13 is vendored locally; see vendor/flatpickr/LICENSE.md. */
const GrowthDatePicker = (() => {
  let picker;
  let selecting = false;
  let lastRange = '';
  const compact = window.matchMedia('(max-width: 720px)');
  const calendarDate = date => flatpickr.formatDate(date, 'Y-m-d');
  const shortcuts = [
    ['today', 'Hoje'], ['yesterday', 'Ontem'], ['last-7', '\u00daltimos 7 dias'],
    ['last-30', '\u00daltimos 30 dias'], ['mtd', 'M\u00eas at\u00e9 ontem (MTD)'],
    ['last-month', 'M\u00eas passado'], ['current-day', '\u00daltimo dia da base'], ['custom', 'Personalizado']
  ];
  function choosePreset(value) {
    const select = document.querySelector('#period-preset');
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    if (value === 'custom') document.querySelector('#date-start').focus();
  }
  function mount() {
    const list = document.querySelector('#period-shortcuts');
    if (!list.childElementCount) {
      for (const [value, label] of shortcuts) {
        const button = document.createElement('button');
        button.type = 'button'; button.dataset.period = value; button.textContent = label;
        button.onclick = () => choosePreset(value);
        list.append(button);
      }
    }
    if (picker || typeof flatpickr !== 'function') return;
    picker = flatpickr('#growth-calendar-value', {
      inline: true, mode: 'range', locale: { ...flatpickr.l10ns.pt, firstDayOfWeek: 0 },
      dateFormat: 'Y-m-d', ariaDateFormat: 'j F Y', showMonths: compact.matches ? 1 : 2,
      monthSelectorType: 'static', disableMobile: true, maxDate: growthToday(),
      appendTo: document.querySelector('#growth-range-calendar'),
      prevArrow: CrmIcons('ChevronLeft'), nextArrow: CrmIcons('ChevronRight'),
      onReady: (_, __, instance) => {
        for (const [node, label, amount] of [[instance.prevMonthNav, 'Mes anterior', -1], [instance.nextMonthNav, 'Proximo mes', 1]]) {
          node.setAttribute('role', 'button'); node.tabIndex = 0;
          node.setAttribute('aria-label', label); node.title = label;
          node.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); instance.changeMonth(amount); }
          });
        }
      },
      onDayCreate: (_, __, instance, day) => {
        const date = calendarDate(day.dateObj);
        day.dataset.date = date;
        day.setAttribute('role', 'button');
        day.setAttribute('aria-disabled', String(date > growthToday()));
        day.classList.toggle('today', date === growthToday());
        const selected = instance.selectedDates.map(calendarDate);
        day.setAttribute('aria-pressed', String(Boolean(selected.length && date >= selected[0] && date <= selected.at(-1))));
        if (!day.classList.contains('prevMonthDay') && !day.classList.contains('nextMonthDay') && date <= growthToday()
            && (date === selected[0] || (!selected.length && day.dateObj.getDate() === 1))) day.tabIndex = 0;
      },
      onChange: dates => {
        if (!dates.length) return;
        selecting = true;
        try { setGrowthCalendarRange(calendarDate(dates[0]), calendarDate(dates.at(-1))); }
        finally { selecting = false; }
      }
    });
  }
  function render(draft) {
    mount();
    const { start, end, compareEnabled, selectedModel, selectedColor, selectedSize } = draft.values;
    const today = growthToday();
    const noMtd = !calendarPeriod('mtd', today);
    document.querySelector('#period-preset option[value="mtd"]').disabled = noMtd;
    for (const button of document.querySelectorAll('[data-period]')) {
      button.setAttribute('aria-pressed', String(button.dataset.period === draft.preset));
      button.disabled = button.dataset.period === 'mtd' && noMtd;
      button.title = button.disabled ? 'Ainda nao ha dias completos neste mes' : '';
    }
    for (const id of ['date-start', 'date-end', 'compare-start', 'compare-end']) document.getElementById(id).max = today;
    document.querySelector('.period-comparison').classList.toggle('comparison-off', !compareEnabled);
    if (selectedModel || selectedColor || selectedSize) document.querySelector('.product-attributes').open = true;
    const valid = Boolean(start && end && start <= end);
    document.querySelector('#calendar-selection').textContent = valid
      ? `${dateSpan(start, end)} ${dateSpan(start, end) === 1 ? 'dia selecionado' : 'dias selecionados'}` : 'Intervalo incompleto';
    document.querySelector('#calendar-source-date').textContent = state.availableEnd ? `Base ate ${dayLabel(state.availableEnd)}` : 'Data da base indisponivel';
    const note = document.querySelector('#calendar-coverage-note');
    note.hidden = !valid || !state.availableEnd || end <= state.availableEnd;
    note.textContent = state.availableEnd ? `O periodo inclui datas posteriores a ${dayLabel(state.availableEnd)}. Os dados dessas datas ainda nao estao carregados.` : '';
    const range = `${start}|${end}`;
    if (!picker || selecting) { lastRange = range; return; }
    const months = compact.matches ? 1 : 2;
    const resized = picker.config.showMonths !== months;
    if (resized) picker.set('showMonths', months);
    if (calendarDate(picker.config.maxDate) !== today) picker.set('maxDate', today);
    if (range !== lastRange || resized || !picker.selectedDates.length) {
      picker.setDate(valid ? [start, end] : [], false);
      if (valid) {
        const anchor = toDate(start);
        if (months === 2 && start.slice(0, 7) === end.slice(0, 7)) anchor.setMonth(anchor.getMonth() - 1, 1);
        picker.jumpToDate(anchor);
      }
    }
    lastRange = range;
  }
  compact.addEventListener('change', () => {
    if (typeof filterDraft !== 'undefined' && filterDraft) render(filterDraft);
  });
  return { render };
})();
