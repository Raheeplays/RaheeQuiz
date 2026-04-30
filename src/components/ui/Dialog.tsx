import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, Check, X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: 'info' | 'confirm' | 'error' | 'success';
}

export default function Dialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  type = 'confirm'
}: DialogProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[300]"
          />
          
          {/* Dialog Container */}
          <div className="fixed inset-0 flex items-center justify-center z-[301] p-6 pointer-events-none">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white dark:bg-[#0a0a0a] border border-black/5 dark:border-white/5 w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl pointer-events-auto overflow-hidden relative"
            >
              {/* Icon */}
              <div className="flex justify-center mb-6">
                <div className={cn(
                  "w-16 h-16 rounded-3xl flex items-center justify-center",
                  type === 'confirm' && "bg-primary/10 text-primary",
                  type === 'info' && "bg-blue-500/10 text-blue-500",
                  type === 'error' && "bg-red-500/10 text-red-500",
                  type === 'success' && "bg-green-500/10 text-green-500"
                )}>
                  {type === 'confirm' && <AlertCircle size={32} />}
                  {type === 'info' && <AlertCircle size={32} />}
                  {type === 'error' && <X size={32} />}
                  {type === 'success' && <Check size={32} />}
                </div>
              </div>

              {/* Text */}
              <div className="text-center mb-8">
                <h3 className="text-xl font-black text-black dark:text-white mb-2 tracking-tight uppercase">
                  {title}
                </h3>
                <p className="text-sm font-bold text-black/40 dark:text-white/40 leading-relaxed">
                  {description}
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3">
                {onConfirm && (
                  <button
                    onClick={() => {
                      onConfirm();
                      onClose();
                    }}
                    className="w-full bg-primary text-black font-black px-8 py-4 rounded-[1.5rem] uppercase tracking-widest text-[10px] hover:scale-105 active:scale-95 transition-all shadow-[0_4px_15px_rgba(var(--primary-color),0.3)]"
                  >
                    {confirmLabel}
                  </button>
                )}
                <button
                  onClick={onClose}
                  className={cn(
                    "w-full font-black px-8 py-4 rounded-[1.5rem] uppercase tracking-widest text-[10px] transition-all",
                    onConfirm 
                      ? "bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40 hover:bg-black/10 dark:hover:bg-white/10" 
                      : "bg-primary text-black"
                  )}
                >
                  {onConfirm ? cancelLabel : 'Okay'}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
