export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (typeof HTMLInputElement !== 'undefined' && target instanceof HTMLInputElement) return true;
  if (typeof HTMLTextAreaElement !== 'undefined' && target instanceof HTMLTextAreaElement)
    return true;
  if (typeof HTMLSelectElement !== 'undefined' && target instanceof HTMLSelectElement) return true;
  if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) {
    return target.isContentEditable;
  }
  return false;
}
