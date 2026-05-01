import React, { createContext, useContext, useState, ReactNode } from 'react';
import Dialog from '../components/ui/Dialog';

interface DialogOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: 'info' | 'confirm' | 'error' | 'success';
}

interface DialogContextType {
  confirm: (options: DialogOptions) => Promise<boolean>;
  alert: (options: DialogOptions) => Promise<void>;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<DialogOptions & { onConfirm?: () => void; onClose: () => void }>({
    title: '',
    description: '',
    onClose: () => setIsOpen(false),
  });

  const confirm = (opts: DialogOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setOptions({
        ...opts,
        type: opts.type || 'confirm',
        onConfirm: () => {
          setIsOpen(false);
          resolve(true);
        },
        onClose: () => {
          setIsOpen(false);
          resolve(false);
        },
      });
      setIsOpen(true);
    });
  };

  const alert = (opts: DialogOptions): Promise<void> => {
    return new Promise((resolve) => {
      setOptions({
        ...opts,
        type: opts.type || 'info',
        onConfirm: undefined, // No confirm button for alert
        onClose: () => {
          setIsOpen(false);
          resolve();
        },
      });
      setIsOpen(true);
    });
  };

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}
      <Dialog
        isOpen={isOpen}
        onClose={options.onClose}
        onConfirm={options.onConfirm}
        title={options.title}
        description={options.description}
        confirmLabel={options.confirmLabel}
        cancelLabel={options.cancelLabel}
        type={options.type}
      />
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const context = useContext(DialogContext);
  if (context === undefined) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
}
