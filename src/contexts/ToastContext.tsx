import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

export interface ToastOptions {
  tone?: 'success' | 'error' | 'info';
  /** Label and handler for an inline action, e.g. Undo. */
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  message: string;
}

interface ToastContextType {
  toast: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = ++counter.current;
      setItems((current) => [...current.slice(-2), { id, message, ...options }]);
      window.setTimeout(() => dismiss(id), options.durationMs ?? (options.action ? 6000 : 3000));
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none" aria-live="polite">
        {items.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg text-sm text-white max-w-md w-full ${
              item.tone === 'error' ? 'bg-red-600' : item.tone === 'info' ? 'bg-gray-800' : 'bg-green-600'
            }`}
          >
            <span className="flex-1">{item.message}</span>
            {item.action && (
              <button
                onClick={() => {
                  item.action?.onClick();
                  dismiss(item.id);
                }}
                className="font-semibold underline underline-offset-2"
              >
                {item.action.label}
              </button>
            )}
            <button onClick={() => dismiss(item.id)} aria-label="close" className="text-white/70 hover:text-white">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
