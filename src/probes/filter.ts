import type { FilterControl, FilterInfo } from '../types';
import { absUrl, clean } from '../utils/dom';

const SEARCH_NAMES = new Set(['s', 'q', 'query', 'search', 'keyword', 'keywords', 'k']);
const PSEUDO_FORMS = '.quickfilter, .filters, .advancedsearch, .search-advanced-form, .filter-form, [class*="filter"] form';

function labelFor(input: Element, scope: ParentNode): string {
  const id = input.getAttribute('id');
  if (id) {
    const label = Array.from(scope.querySelectorAll('label')).find((el) => el.getAttribute('for') === id);
    if (label) return clean(label.textContent);
  }
  const parentLabel = input.closest('label');
  if (parentLabel) return clean(parentLabel.textContent);
  const sibling = input.nextElementSibling;
  if (sibling && sibling.tagName.toLowerCase() === 'label') return clean(sibling.textContent);
  return clean(input.getAttribute('value'));
}

export function collectControls(scope: ParentNode): FilterControl[] {
  const map = new Map<string, FilterControl>();
  const ensure = (name: string, type: FilterControl['type'], multiple: boolean): FilterControl => {
    const existing = map.get(name);
    if (existing) return existing;
    const created: FilterControl = { name, type, multiple, options: [] };
    map.set(name, created);
    return created;
  };
  for (const input of Array.from(scope.querySelectorAll('input[name]'))) {
    const name = input.getAttribute('name') ?? '';
    const type = (input.getAttribute('type') ?? 'text').toLowerCase();
    if (!name || SEARCH_NAMES.has(name) || ['hidden', 'submit', 'button', 'reset', 'image', 'password', 'file'].includes(type)) continue;
    if (type === 'checkbox' || type === 'radio') {
      const control = ensure(name, type, type === 'checkbox' && (name.endsWith('[]') || scope.querySelectorAll(`input[name="${name}"]`).length > 1));
      const value = input.getAttribute('value') ?? '';
      if (!control.options.some((option) => option.value === value)) control.options.push({ value, label: labelFor(input, scope) });
    } else {
      ensure(name, 'text', false);
    }
  }
  for (const select of Array.from(scope.querySelectorAll('select[name]'))) {
    const name = select.getAttribute('name') ?? '';
    if (!name || SEARCH_NAMES.has(name)) continue;
    const control = ensure(name, 'select', select.hasAttribute('multiple') || name.endsWith('[]'));
    for (const option of Array.from(select.querySelectorAll('option'))) {
      const value = option.getAttribute('value') ?? clean(option.textContent);
      if (!control.options.some((existing) => existing.value === value)) control.options.push({ value, label: clean(option.textContent) });
    }
  }
  return [...map.values()];
}

export function extractFilters(doc: Document, base: string): FilterInfo {
  const empty: FilterInfo = { detected: false, action: null, method: 'GET', controls: [], sampleUrl: null };
  let best: { scope: Element; controls: FilterControl[]; action: string; method: 'GET' | 'POST' } | null = null;
  const candidates = [...Array.from(doc.querySelectorAll('form')), ...Array.from(doc.querySelectorAll(PSEUDO_FORMS))];
  for (const scope of candidates) {
    const controls = collectControls(scope);
    const choiceControls = controls.filter((control) => control.type !== 'text');
    if (choiceControls.length < 2) continue;
    const score = controls.reduce((sum, control) => sum + Math.max(1, control.options.length), 0);
    const currentScore = best ? best.controls.reduce((sum, control) => sum + Math.max(1, control.options.length), 0) : -1;
    if (score > currentScore) {
      const form = scope.tagName.toLowerCase() === 'form' ? scope : scope.closest('form') ?? scope.querySelector('form');
      const action = absUrl(form?.getAttribute('action'), base) ?? base.split('?')[0] ?? base;
      const method = (form?.getAttribute('method') ?? 'get').toUpperCase() === 'POST' ? 'POST' : 'GET';
      best = { scope, controls, action, method };
    }
  }
  if (!best) return empty;
  let sampleUrl: string | null = null;
  if (best.method === 'GET') {
    const sample = new URL(best.action);
    for (const control of best.controls) {
      const option = control.options.find((item) => item.value !== '');
      if (option) {
        sample.searchParams.append(control.name, option.value);
        break;
      }
    }
    sampleUrl = sample.toString();
  }
  return { detected: true, action: best.action, method: best.method, controls: best.controls, sampleUrl };
}
