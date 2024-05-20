import { useLayoutEffect, useRef } from "react";
import Button from "./Button";

export default function Dialog({
  children,
  title,
  onAction,
  onCancel,
  actionLabel,
  cancelLabel,
}: {
  children?: React.ReactNode;
  title?: React.ReactNode;
  onAction?: () => void;
  onCancel?: () => void;
  actionLabel?: string;
  cancelLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.showModal();
    return () => el.close();
  });
  return (
    <dialog
      ref={ref}
      className="grid grid-rows-[min-content_minmax(0,1fr)_min-content] grid-cols-1 p-6 w-full max-w-lg h-full max-h-96 backdrop:bg-black backdrop:bg-opacity-30 backdrop-blur-md bg-white rounded-md shadow-lg"
      onCancel={onCancel}
    >
      <h1 className="text-lg font-semibold mb-6">{title}</h1>
      <div className="mb-4">{children}</div>
      <div className="flex justify-end gap-4">
        <Button onClick={() => onCancel?.()}>{cancelLabel || "Cancel"}</Button>
        <Button onClick={() => onAction?.()} primary>
          {actionLabel || "Done"}
        </Button>
      </div>
    </dialog>
  );
}
