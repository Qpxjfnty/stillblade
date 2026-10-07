import './tooltips.css';

/** Immediate hints for pointer hover and keyboard focus, including disabled controls. */
export function setupTooltips(root: HTMLElement) {
  const tooltip = document.createElement('div');
  tooltip.id = 'hover-tooltip';
  tooltip.className = 'hover-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.append(tooltip);
  let anchor: HTMLElement | null = null;
  let pointer: { x: number; y: number } | null = null;

  function dismiss() {
    if (anchor) {
      const ids = (anchor.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(id => id && id !== tooltip.id);
      if (ids.length) anchor.setAttribute('aria-describedby', ids.join(' '));
      else anchor.removeAttribute('aria-describedby');
    }
    anchor = null;
    tooltip.hidden = true;
  }

  function show(element: HTMLElement) {
    const hint = element.dataset.tooltip;
    if (!hint || !element.isConnected) return;
    dismiss();
    anchor = element;
    tooltip.textContent = hint;
    tooltip.style.left = '8px';
    tooltip.style.top = '8px';
    tooltip.hidden = false;
    const ids = (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    element.setAttribute('aria-describedby', [...new Set([...ids, tooltip.id])].join(' '));
    const bounds = element.getBoundingClientRect();
    const size = tooltip.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(margin, Math.min(innerWidth - size.width - margin, bounds.left + (bounds.width - size.width) / 2));
    const above = bounds.top - size.height - margin;
    const top = Math.max(margin, Math.min(innerHeight - size.height - margin, above >= margin ? above : bounds.bottom + margin));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  const target = (event: Event) => event.target instanceof Element ? event.target.closest<HTMLElement>('[data-tooltip]') : null;
  root.addEventListener('pointerover', event => {
    if (event.pointerType === 'touch') return;
    pointer = { x: event.clientX, y: event.clientY };
    const element = target(event);
    if (element && element !== anchor) show(element);
  });
  root.addEventListener('pointermove', event => {
    if (event.pointerType !== 'touch') pointer = { x: event.clientX, y: event.clientY };
  });
  root.addEventListener('pointerout', event => {
    if (!anchor || (event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget))) return;
    if (anchor === document.activeElement && anchor.matches(':focus-visible')) return;
    dismiss();
  });
  root.addEventListener('focusin', event => {
    const element = target(event);
    if (element?.matches(':focus-visible')) show(element);
  });
  root.addEventListener('focusout', dismiss);
  root.addEventListener('pointerdown', dismiss);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') dismiss(); });
  window.addEventListener('resize', dismiss);
  document.addEventListener('scroll', () => {
    if (anchor) {
      const bounds = anchor.getBoundingClientRect();
      const focused = anchor === document.activeElement && anchor.matches(':focus-visible');
      const hovered = pointer && pointer.x >= bounds.left && pointer.x <= bounds.right && pointer.y >= bounds.top && pointer.y <= bounds.bottom;
      if ((focused || hovered) && bounds.bottom > 0 && bounds.top < innerHeight && bounds.right > 0 && bounds.left < innerWidth) show(anchor);
      else dismiss();
    }
  }, true);

  return {
    refresh() {
      dismiss();
      root.querySelectorAll<HTMLElement>('[title]').forEach(element => {
        element.dataset.tooltip = element.title;
        element.removeAttribute('title');
      });
    },
  };
}
