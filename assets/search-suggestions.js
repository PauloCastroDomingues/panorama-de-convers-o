(function () {
  const controls = new WeakMap();
  let active = null;

  function attach(input, { options, select }) {
    if (!input || controls.has(input)) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'search-combobox';
    input.before(wrapper);
    wrapper.append(input);
    const panel = document.createElement('div');
    panel.className = 'search-suggestions';
    panel.hidden = true;
    const list = document.createElement('div');
    list.id = `${input.id}-suggestions`;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Resultados da busca');
    const status = document.createElement('div');
    status.className = 'search-suggestion-status';
    status.setAttribute('role', 'status');
    panel.append(list, status);
    wrapper.append(panel);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', list.id);
    input.setAttribute('aria-expanded', 'false');
    input.autocomplete = 'off';
    let items = [], index = -1, timer = null, dismissed = null;

    function close() {
      clearTimeout(timer);
      panel.hidden = true;
      dismissed = input.value;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      if (active === control) active = null;
    }
    function refresh() {
      if (!input.isConnected || document.activeElement !== input || !input.value.trim()) { close(); return; }
      if (dismissed === input.value) return;
      if (active && active !== control) active.close();
      active = control;
      const matches = options(input.value);
      items = matches.slice(0, 20);
      index = -1;
      input.removeAttribute('aria-activedescendant');
      list.replaceChildren();
      items.forEach((item, position) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.tabIndex = -1;
        button.id = `${list.id}-${position}`;
        button.className = 'search-suggestion';
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', 'false');
        button.textContent = item.label;
        button.addEventListener('mousedown', event => event.preventDefault());
        button.addEventListener('click', () => choose(position));
        list.append(button);
      });
      status.textContent = matches.length ? `${items.length} de ${matches.length} resultados` : 'Nenhum resultado no recorte';
      panel.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }
    function choose(position) {
      const item = items[position];
      if (!item) return;
      clearTimeout(timer);
      input.value = item.inputValue ?? item.label;
      select(item);
      input.focus({ preventScroll: true });
      close();
    }
    function move(next) {
      index = Math.max(0, Math.min(items.length - 1, next));
      Array.from(list.children).forEach((node, position) => node.setAttribute('aria-selected', String(position === index)));
      const node = list.children[index];
      if (node) {
        input.setAttribute('aria-activedescendant', node.id);
        node.scrollIntoView({ block: 'nearest' });
      }
    }
    const control = { close, refresh, changed() {
      close();
      dismissed = null;
      // The filter drawer updates its draft/catalog before suggestions are read.
      timer = setTimeout(refresh, 220);
    } };
    controls.set(input, control);
    input.addEventListener('focus', () => { dismissed = null; refresh(); });
    input.addEventListener('blur', event => { if (!wrapper.contains(event.relatedTarget)) close(); });
    input.addEventListener('keydown', event => {
      if (event.isComposing) return;
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        if (panel.hidden) { dismissed = null; refresh(); }
        if (!panel.hidden && items.length) move(index < 0 ? event.key === 'ArrowDown' ? 0 : items.length - 1 : index + (event.key === 'ArrowDown' ? 1 : -1));
      } else if (event.key === 'Enter' && !panel.hidden) {
        event.preventDefault();
        if (index >= 0) choose(index);
        else if (items.length) move(0);
      } else if (event.key === 'Escape' && !panel.hidden) {
        event.preventDefault(); event.stopPropagation(); close();
      } else if (event.key === 'Tab') close();
    });
  }
  document.addEventListener('input', event => controls.get(event.target)?.changed(), true);
  document.addEventListener('pointerdown', event => {
    if (active && !event.target.closest('.search-combobox')) active.close();
  });
  window.ReiseSearch = {
    attach,
    refresh: () => controls.get(document.activeElement)?.refresh(),
    close: () => active?.close(),
  };
})();
