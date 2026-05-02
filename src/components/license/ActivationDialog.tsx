import { useCallback, useEffect, useRef, useState } from 'react';
import { FaXmark, FaCopy, FaCheck, FaCircleExclamation } from 'react-icons/fa6';
import { licenseBridge } from '@/lib/license-bridge';
import { useLicenseStore } from '@/store/licenseStore';

/**
 * Activation dialog. Shows the machine code (with copy-to-clipboard) and
 * accepts an activation token. Submission round-trips to the main process
 * which performs Ed25519 verification + replay/binding checks.
 *
 * Self-controlled: components call `useLicenseStore.getState().promptActivation()`
 * to open it (the dialog registers itself on mount). This keeps the trigger
 * accessible from non-React contexts (zustand mutators, action dispatchers).
 */
export function ActivationDialog() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const state = useLicenseStore((s) => s.state);
  const setState = useLicenseStore((s) => s.setState);
  const registerPromptActivation = useLicenseStore((s) => s.registerPromptActivation);

  const handleClose = useCallback(() => {
    if (busy) return;
    setOpen(false);
    setError(null);
    setCode('');
  }, [busy]);

  // Wire global trigger
  useEffect(() => {
    registerPromptActivation(() => {
      setOpen(true);
      setError(null);
    });
  }, [registerPromptActivation]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, handleClose]);

  // Focus the input on open
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => textareaRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(state.machineCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — user can still select+copy
    }
  };

  const handleActivate = async () => {
    const trimmed = code.trim().replace(/\s+/g, '');
    if (!trimmed) {
      setError('Please paste an activation code.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await licenseBridge.activate(trimmed);
      setState(result.state);
      if (result.ok) {
        setCode('');
        setOpen(false);
      } else {
        setError(result.errorMessage ?? 'Activation failed.');
      }
    } catch (e) {
      setError(`Unexpected error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const license = state.license;
  const isActivated = state.status === 'activated';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-xl bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <h2 className="text-sm font-medium text-zinc-200">
            Apollo Map Studio License
            <span className="ml-2 text-zinc-500 text-[11px] font-normal">
              status: {state.status} · {state.reason}
            </span>
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 hover:bg-white/10 rounded text-zinc-500 hover:text-zinc-300"
            disabled={busy}
          >
            <FaXmark className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          <section className="space-y-2">
            <label className="block text-xs uppercase tracking-wider text-zinc-500">
              This machine&apos;s code
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-zinc-950 border border-white/10 rounded font-mono text-sm text-cyan-300 select-all">
                {state.machineCode || '…'}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-2 text-xs rounded border border-white/10 text-zinc-300 hover:bg-white/10 inline-flex items-center gap-1"
              >
                {copied ? <FaCheck className="w-3 h-3" /> : <FaCopy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-[11px] text-zinc-500">
              Send this code to your license vendor. They will reply with an activation code that is
              valid only on this machine.
            </p>
          </section>

          {isActivated && license && (
            <section className="space-y-1 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded">
              <p className="text-xs text-emerald-300">
                Activated · {license.name || 'unnamed license'}
              </p>
              <p className="text-[11px] text-emerald-300/70 font-mono">
                id: {license.id} · expires:{' '}
                {license.expires === 0 ? 'never' : new Date(license.expires).toLocaleString()}
              </p>
            </section>
          )}

          <section className="space-y-2">
            <label className="block text-xs uppercase tracking-wider text-zinc-500">
              Paste activation code
            </label>
            <textarea
              ref={textareaRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              rows={5}
              className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-cyan-500/50 focus:outline-none resize-none"
              placeholder="APMS1.eyJ2IjoxLCJsaWMiOiIuLi4ifQ.…"
              disabled={busy}
            />
            {error && (
              <div className="flex items-start gap-2 px-3 py-2 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-300">
                <FaCircleExclamation className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </section>

          {state.status === 'tampered' && (
            <p className="text-[11px] text-amber-300/80 leading-relaxed">
              The licensing layer detected tampering with the system clock or stored license files.
              Re-activation is required after correcting your system clock and removing any modified
              license files.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 bg-zinc-950/50 border-t border-white/10">
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 text-xs rounded border border-white/10 text-zinc-300 hover:bg-white/10"
            disabled={busy}
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleActivate}
            disabled={busy || code.trim().length === 0}
            className="px-4 py-1.5 text-xs rounded bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 hover:bg-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Verifying…' : 'Activate'}
          </button>
        </div>
      </div>
    </div>
  );
}
