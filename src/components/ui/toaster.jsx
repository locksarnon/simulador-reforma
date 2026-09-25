import { useEffect, useState } from "react";
import { useToast, TOAST_AUTO_DISMISS } from "@/components/ui/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

/** Um aviso: some sozinho (erros ficam mais tempo), pausa com o mouse em cima e fecha no X. */
function AvisoItem({ id, title, description, action, duration, dismiss, props }) {
  const [parado, setParado] = useState(false);
  const ms = duration ?? (props.variant === "destructive" ? 8000 : TOAST_AUTO_DISMISS);

  useEffect(() => {
    if (parado || ms === Infinity) return undefined;
    const t = setTimeout(() => dismiss(id), ms);
    return () => clearTimeout(t);
  }, [parado, ms, id, dismiss]);

  return (
    <Toast
      {...props}
      role={props.variant === "destructive" ? "alert" : "status"}
      onMouseEnter={() => setParado(true)}
      onMouseLeave={() => setParado(false)}
      onFocus={() => setParado(true)}
      onBlur={() => setParado(false)}
    >
      <div className="grid gap-1 min-w-0 flex-1">
        {title && <ToastTitle>{title}</ToastTitle>}
        {description && <ToastDescription>{description}</ToastDescription>}
      </div>
      {action}
      <ToastClose onClick={() => dismiss(id)} aria-label="Fechar aviso" />
    </Toast>
  );
}

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <ToastProvider>
      {toasts.filter((t) => t.open !== false).map(function ({ id, title, description, action, open, onOpenChange, duration, ...props }) {
        return <AvisoItem key={id} id={id} title={title} description={description} action={action} duration={duration} dismiss={dismiss} props={props} />;
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
