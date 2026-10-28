type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'class') {
      el.className = String(v);
    } else if (k in el && typeof v !== 'string') {
      (el as unknown as Record<string, unknown>)[k] = v;
    } else {
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c);
  }
  return el;
}

export interface NumOpts {
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  hint?: string;
}

export function numberField(label: string, value: number, onChange: (v: number) => void, o: NumOpts = {}): HTMLElement {
  const input = h('input', {
    type: 'number',
    value: String(Math.round(value * 10) / 10),
    min: o.min,
    max: o.max,
    step: o.step ?? 1,
    inputmode: 'decimal',
  });
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    if (!Number.isFinite(v)) return;
    if (o.min !== undefined && v < o.min) return;
    if (o.max !== undefined && v > o.max) return;
    onChange(v);
  });
  return h('label', { class: 'field' }, h('span', {}, label), h('span', { class: 'input' }, input, o.unit ? h('em', {}, o.unit) : null), o.hint ? h('small', {}, o.hint) : null);
}

/** `onChange` fires while typing, `onToggle` when switching between auto and a fixed value. */
export function autoField(
  label: string,
  value: number | null,
  computed: number | undefined,
  onChange: (v: number) => void,
  onToggle: (v: number | null) => void,
  o: NumOpts = {},
): HTMLElement {
  const isAuto = value === null;
  const input = h('input', {
    type: 'number',
    value: isAuto ? '' : String(value),
    placeholder: computed !== undefined ? `auto (${Math.round(computed)})` : 'auto',
    disabled: isAuto,
    min: o.min,
    step: o.step ?? 1,
    inputmode: 'decimal',
  });
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    if (Number.isFinite(v) && v >= (o.min ?? 0)) onChange(v);
  });
  const box = h('input', { type: 'checkbox', checked: isAuto, title: 'automatisch aufteilen' });
  box.addEventListener('change', () => onToggle(box.checked ? null : Math.round(computed ?? 300)));
  return h(
    'label',
    { class: 'field' },
    h('span', {}, label),
    h('span', { class: 'input' }, input, h('em', {}, o.unit ?? 'mm'), h('span', { class: 'auto' }, box, 'auto')),
  );
}

export function selectField<T extends string>(label: string, value: T, options: [T, string][], onChange: (v: T) => void): HTMLElement {
  const sel = h('select', {}, ...options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
  sel.addEventListener('change', () => onChange(sel.value as T));
  return h('label', { class: 'field' }, h('span', {}, label), sel);
}

export function checkField(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const box = h('input', { type: 'checkbox', checked: value });
  box.addEventListener('change', () => onChange(box.checked));
  return h('label', { class: 'check' }, box, h('span', {}, label));
}

export function button(text: string, onClick: () => void, cls = '', title = ''): HTMLButtonElement {
  return h('button', { type: 'button', class: cls, title: title || undefined, onclick: onClick }, text);
}
