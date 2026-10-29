(() => {
  const tooltip = document.createElement('div');
  tooltip.id = 'chart-tooltip';
  tooltip.className = 'chart-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.append(tooltip);
  let active = null;
  const observed = new WeakSet();
  const point = (node) => node instanceof Element ? node.closest('[data-chart-label]') : null;
  const hide = () => {
    active?.removeAttribute('aria-describedby');
    active = null;
    tooltip.hidden = true;
  };
  const show = (node) => {
    if (!node || !node.checkVisibility()) return hide();
    hide();
    active = node;
    tooltip.textContent = node.dataset.chartLabel;
    tooltip.hidden = false;
    const rect = node.getBoundingClientRect();
    const width = tooltip.offsetWidth, height = tooltip.offsetHeight;
    tooltip.style.left = `${Math.max(12, Math.min(innerWidth - width - 12, rect.left + rect.width / 2 - width / 2))}px`;
    const above = rect.top - height - 12;
    tooltip.style.top = `${Math.max(12, Math.min(innerHeight - height - 12, above >= 12 ? above : rect.bottom + 12))}px`;
    node.setAttribute('aria-describedby', tooltip.id);
  };
  const observer = new MutationObserver(() => { if (active && !active.isConnected) hide(); });
  const prepare = (root) => {
    if (!root) return;
    // Reuse the rendered labels; metrics and chart geometry stay untouched.
    for (const svg of root.querySelectorAll('svg')) {
      const points = [...svg.querySelectorAll('circle, rect')].filter((node) => node.querySelector('title') || node.hasAttribute('data-chart-label'));
      if (!points.length) continue;
      svg.setAttribute('role', 'group');
      points.forEach((node, index) => {
        const title = node.querySelector('title');
        if (title) { node.dataset.chartLabel = title.textContent; title.remove(); }
        node.setAttribute('aria-label', node.dataset.chartLabel);
        node.setAttribute('role', 'img');
        node.setAttribute('tabindex', index === 0 ? '0' : '-1');
      });
    }
    if (!observed.has(root)) { observer.observe(root, { childList: true }); observed.add(root); }
  };
  document.addEventListener('pointerover', (event) => {
    if (event.pointerType === 'touch') return;
    const node = point(event.target);
    if (node) show(node);
  });
  document.addEventListener('pointerout', (event) => {
    if (point(event.target) === active && !point(event.relatedTarget) && document.activeElement !== active) hide();
  });
  document.addEventListener('focusin', (event) => { const node = point(event.target); if (node) show(node); else hide(); });
  document.addEventListener('focusout', (event) => { if (point(event.target) === active) hide(); });
  document.addEventListener('click', (event) => { const node = point(event.target); if (node) show(node); else hide(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') return hide();
    const node = point(event.target);
    if (!node || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const points = [...node.closest('svg').querySelectorAll('[data-chart-label]')];
    const index = points.indexOf(node);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : Math.max(0, Math.min(points.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
    event.preventDefault();
    points.forEach((item, position) => item.setAttribute('tabindex', position === next ? '0' : '-1'));
    points[next].focus({ preventScroll: true });
  });
  document.addEventListener('scroll', hide, { capture: true, passive: true });
  window.addEventListener('resize', hide, { passive: true });
  window.ReiseCharts = { prepare };
})();
