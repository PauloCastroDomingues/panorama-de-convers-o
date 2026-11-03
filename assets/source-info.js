/* One floating disclosure shared by source indicators, outside scrollable tables. */
(() => {
  let active = null, pinned = false, timer = null, restoring = false;
  const panel = document.createElement('div');
  panel.id = 'source-info-popover';
  panel.className = 'source-info-popover';
  panel.setAttribute('popover', 'manual');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Procedencia dos dados');
  panel.innerHTML = '<header><strong>Procedencia dos dados</strong><button type="button" aria-label="Fechar procedencia">&times;</button></header><div class="source-info-copy"></div>';
  panel.hidden = true;
  document.body.append(panel);
  const closeButton = panel.querySelector('button');

  function close(restore = false) {
    clearTimeout(timer);
    const previous = active;
    if (active) {
      active.setAttribute('aria-expanded', 'false');
      active.removeAttribute('aria-controls');
    }
    active = null; pinned = false;
    if (panel.matches(':popover-open')) panel.hidePopover();
    panel.hidden = true;
    if (restore && previous?.isConnected) {
      restoring = true; previous.focus({ preventScroll: true }); restoring = false;
    }
  }
  function show(button, pin = false) {
    clearTimeout(timer);
    if (active !== button) close();
    active = button; pinned = pin;
    panel.querySelector('.source-info-copy').textContent = button.dataset.sourceNote;
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-controls', panel.id);
    panel.hidden = false;
    panel.style.left = '12px';
    panel.style.top = '12px';
    if (!panel.matches(':popover-open')) panel.showPopover();
    position();
  }
  function position() {
    if (!active?.isConnected) { close(); return; }
    const rect = active.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    panel.style.left = `${Math.max(12, Math.min(rect.left, width - panel.offsetWidth - 12))}px`;
    const top = rect.bottom + 8 + panel.offsetHeight <= height - 12 ? rect.bottom + 8 : rect.top - panel.offsetHeight - 8;
    panel.style.top = `${Math.max(12, Math.min(top, height - panel.offsetHeight - 12))}px`;
  }
  function leave() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!pinned && active && !active.matches(':hover, :focus') && !panel.matches(':hover') && !panel.contains(document.activeElement)) close();
    }, 150);
  }
  document.addEventListener('pointerover', event => {
    const button = event.target.closest('.source-info');
    if (button && !pinned && event.pointerType !== 'touch') show(button);
    if (panel.contains(event.target)) clearTimeout(timer);
  });
  document.addEventListener('pointerout', leave);
  document.addEventListener('focusin', event => {
    const button = event.target.closest('.source-info');
    if (button && !restoring && !pinned) show(button);
  });
  document.addEventListener('focusout', leave);
  document.addEventListener('click', event => {
    const button = event.target.closest('.source-info');
    if (button) {
      if (active === button && pinned) close();
      else { show(button, true); closeButton.focus({ preventScroll: true }); }
    } else if (!panel.contains(event.target)) close();
  });
  closeButton.addEventListener('click', () => close(true));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && active) { event.preventDefault(); close(pinned); }
  });
  window.addEventListener('resize', () => close());
  document.addEventListener('scroll', event => {
    if (panel.contains(event.target) || !active) return;
    if (pinned || active === document.activeElement) position();
    else close();
  }, true);
})();
