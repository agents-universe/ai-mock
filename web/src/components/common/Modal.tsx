import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Modal({
  title,
  onClose,
  children,
  width = 'max-w-lg',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  const pressedOnBackdrop = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // move focus into the modal on open so Tab starts inside it
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      // don't nuke a half-typed form: ESC inside an input is commonly used
      // to dismiss suggestions/IME composition (esp. Chinese input) — but
      // only when focus is still INSIDE the modal; if focus escaped to the
      // background, ESC must close the modal instead of being swallowed
      const t = e.target as HTMLElement | null;
      if (t && panelRef.current?.contains(t)) {
        if (
          t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable
        ) {
          return;
        }
      }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onMouseDown={(e) => {
        if (e.button !== 0) return; // only primary button dismisses
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        // close only when BOTH press and release land on the backdrop:
        // a text-selection drag starting inside the panel and released on
        // the backdrop dispatches the click to their common ancestor and
        // used to silently discard the form
        if (e.button !== 0) return;
        if (e.target === e.currentTarget && pressedOnBackdrop.current) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`bg-white rounded-xl shadow-xl w-full ${width} max-h-[90vh] overflow-auto outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button
            className="text-slate-400 hover:text-slate-600 text-lg leading-none"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmButton({
  onConfirm,
  children,
  className = 'btn-danger',
}: {
  onConfirm: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      className={className}
      onClick={() => {
        if (window.confirm('确定要删除吗？此操作不可恢复。')) onConfirm();
      }}
    >
      {children}
    </button>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="card p-10 text-center">
      <p className="text-slate-500 text-sm">{title}</p>
      {hint && <p className="text-slate-400 text-xs mt-1">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

/** legacy fallback — navigator.clipboard is undefined on insecure origins
 * (the server is plain HTTP, so LAN-IP access hits this path) */
function legacyCopy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

export function CopyButton({ text, label = '复制' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const timerRef = useRef<number | undefined>(undefined);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  async function copy() {
    // clear any pending reset so rapid re-clicks don't race old timers
    if (timerRef.current) window.clearTimeout(timerRef.current);
    let ok = false;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) ok = legacyCopy(text);
    // the component may have unmounted while the clipboard promise was
    // pending — don't arm a fresh timer that outlives the cleanup
    if (!mountedRef.current) return;
    setState(ok ? 'ok' : 'fail');
    timerRef.current = window.setTimeout(() => setState('idle'), ok ? 1500 : 2500);
  }

  return (
    <button
      className="btn-secondary text-xs"
      onClick={() => void copy()}
      title={text}
    >
      {state === 'ok' ? '✓ 已复制' : state === 'fail' ? '复制失败' : label}
    </button>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mb-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
      {message}
    </div>
  );
}
