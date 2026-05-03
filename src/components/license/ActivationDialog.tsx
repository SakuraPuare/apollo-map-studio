import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { FaXmark, FaCopy, FaCheck, FaCircleExclamation } from 'react-icons/fa6';
import { licenseBridge, type LicenseState } from '@/lib/license-bridge';
import { useLicenseStore } from '@/store/licenseStore';

type LicenseInfo = NonNullable<LicenseState['license']>;

interface ActivationActionsConfig {
  code: string;
  machineCode: string;
  setBusy: (busy: boolean) => void;
  setCode: (code: string) => void;
  setCopied: (copied: boolean) => void;
  setError: (error: string | null) => void;
  setLicenseState: (state: LicenseState) => void;
  setOpen: (open: boolean) => void;
}

function usePromptRegistration(
  registerPromptActivation: (fn: () => void) => void,
  setOpen: (open: boolean) => void,
  setError: (error: string | null) => void,
) {
  useEffect(() => {
    registerPromptActivation(() => {
      setOpen(true);
      setError(null);
    });
  }, [registerPromptActivation, setError, setOpen]);
}

function useEscapeClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);
}

function useTextareaFocus(open: boolean, textareaRef: RefObject<HTMLTextAreaElement | null>) {
  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(() => textareaRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [open, textareaRef]);
}

function useActivationActions(config: ActivationActionsConfig) {
  const { code, machineCode, setBusy, setCode, setCopied, setError, setLicenseState, setOpen } =
    config;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(machineCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore - user can still select+copy
    }
  }, [machineCode, setCopied]);

  const handleActivate = useCallback(async () => {
    const trimmed = code.trim().replace(/\s+/g, '');
    if (!trimmed) {
      setError('Please paste an activation code.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await licenseBridge.activate(trimmed);
      setLicenseState(result.state);
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
  }, [code, setBusy, setCode, setError, setLicenseState, setOpen]);

  return { handleActivate, handleCopy };
}

/**
 * Activation dialog. Shows the machine code and accepts an activation token.
 * Submission round-trips to the main process for verification.
 */
export function ActivationDialog() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const state = useLicenseStore((s) => s.state);
  const setLicenseState = useLicenseStore((s) => s.setState);
  const registerPromptActivation = useLicenseStore((s) => s.registerPromptActivation);

  const handleClose = useCallback(() => {
    if (busy) return;
    setOpen(false);
    setError(null);
    setCode('');
  }, [busy]);

  usePromptRegistration(registerPromptActivation, setOpen, setError);
  useEscapeClose(open, handleClose);
  useTextareaFocus(open, textareaRef);

  const { handleActivate, handleCopy } = useActivationActions({
    code,
    machineCode: state.machineCode,
    setBusy,
    setCode,
    setCopied,
    setError,
    setLicenseState,
    setOpen,
  });

  if (!open) return null;

  return (
    <DialogFrame onClose={handleClose}>
      <ActivationHeader state={state} busy={busy} onClose={handleClose} />
      <div className="px-5 py-4 space-y-5">
        <MachineCodeSection machineCode={state.machineCode} copied={copied} onCopy={handleCopy} />
        {state.status === 'activated' && state.license && (
          <ActivatedLicenseSection license={state.license} />
        )}
        <ActivationCodeSection
          textareaRef={textareaRef}
          code={code}
          busy={busy}
          error={error}
          onCodeChange={setCode}
        />
        <TamperNotice status={state.status} />
      </div>
      <ActivationFooter
        busy={busy}
        canActivate={code.trim().length > 0}
        onClose={handleClose}
        onActivate={handleActivate}
      />
    </DialogFrame>
  );
}

function DialogFrame({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function ActivationHeader({
  state,
  busy,
  onClose,
}: {
  state: LicenseState;
  busy: boolean;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
      <h2 className="text-sm font-medium text-zinc-200">
        Apollo Map Studio License
        <span className="ml-2 text-zinc-500 text-[11px] font-normal">
          status: {state.status} · {state.reason}
        </span>
      </h2>
      <button
        type="button"
        onClick={onClose}
        className="p-1 hover:bg-white/10 rounded text-zinc-500 hover:text-zinc-300"
        disabled={busy}
      >
        <FaXmark className="w-4 h-4" />
      </button>
    </div>
  );
}

function MachineCodeSection({
  machineCode,
  copied,
  onCopy,
}: {
  machineCode: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <section className="space-y-2">
      <label className="block text-xs uppercase tracking-wider text-zinc-500">
        This machine&apos;s code
      </label>
      <div className="flex items-center gap-2">
        <code className="flex-1 px-3 py-2 bg-zinc-950 border border-white/10 rounded font-mono text-sm text-cyan-300 select-all">
          {machineCode || '...'}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="px-3 py-2 text-xs rounded border border-white/10 text-zinc-300 hover:bg-white/10 inline-flex items-center gap-1"
        >
          {copied ? <FaCheck className="w-3 h-3" /> : <FaCopy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-[11px] text-zinc-500">
        Send this code to your license vendor. They will reply with an activation code that is valid
        only on this machine.
      </p>
    </section>
  );
}

function ActivatedLicenseSection({ license }: { license: LicenseInfo }) {
  return (
    <section className="space-y-1 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded">
      <p className="text-xs text-emerald-300">Activated · {license.name || 'unnamed license'}</p>
      <p className="text-[11px] text-emerald-300/70 font-mono">
        id: {license.id} · expires:{' '}
        {license.expires === 0 ? 'never' : new Date(license.expires).toLocaleString()}
      </p>
    </section>
  );
}

function ActivationCodeSection({
  textareaRef,
  code,
  busy,
  error,
  onCodeChange,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  code: string;
  busy: boolean;
  error: string | null;
  onCodeChange: (code: string) => void;
}) {
  return (
    <section className="space-y-2">
      <label className="block text-xs uppercase tracking-wider text-zinc-500">
        Paste activation code
      </label>
      <textarea
        ref={textareaRef}
        value={code}
        onChange={(e) => onCodeChange(e.target.value)}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        rows={5}
        className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-cyan-500/50 focus:outline-none resize-none"
        placeholder="APMS1.eyJ2IjoxLCJsaWMiOiIuLi4ifQ...."
        disabled={busy}
      />
      {error && <ActivationError error={error} />}
    </section>
  );
}

function ActivationError({ error }: { error: string }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-300">
      <FaCircleExclamation className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <span>{error}</span>
    </div>
  );
}

function TamperNotice({ status }: { status: LicenseState['status'] }) {
  if (status !== 'tampered') return null;
  return (
    <p className="text-[11px] text-amber-300/80 leading-relaxed">
      The licensing layer detected tampering with the system clock or stored license files.
      Re-activation is required after correcting your system clock and removing any modified license
      files.
    </p>
  );
}

function ActivationFooter({
  busy,
  canActivate,
  onClose,
  onActivate,
}: {
  busy: boolean;
  canActivate: boolean;
  onClose: () => void;
  onActivate: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2 px-5 py-3 bg-zinc-950/50 border-t border-white/10">
      <button
        type="button"
        onClick={onClose}
        className="px-3 py-1.5 text-xs rounded border border-white/10 text-zinc-300 hover:bg-white/10"
        disabled={busy}
      >
        Close
      </button>
      <button
        type="button"
        onClick={onActivate}
        disabled={busy || !canActivate}
        className="px-4 py-1.5 text-xs rounded bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 hover:bg-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? 'Verifying...' : 'Activate'}
      </button>
    </div>
  );
}
