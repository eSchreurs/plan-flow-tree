import { useEffect, useState } from "react";

let pushToast: ((message: string) => void) | null = null;
let counter = 0;

export function toast(message: string) {
  pushToast?.(message);
}

export function ToastHost() {
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);

  useEffect(() => {
    pushToast = (message) => {
      const id = ++counter;
      setToasts((list) => [...list, { id, message }]);
      setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3500);
    };
    return () => {
      pushToast = null;
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto max-w-md rounded-lg bg-slate-900 px-4 py-2.5 text-[13px] text-white shadow-lg"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
