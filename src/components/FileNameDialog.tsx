import React, { useState, useEffect, useRef } from 'react';
import { FileDown, X, Check, Download } from 'lucide-react';

interface FileNameDialogProps {
  isOpen: boolean;
  defaultValue: string;
  title?: string;
  message?: string;
  placeholder?: string;
  onConfirm: (fileName: string) => void;
  onCancel: () => void;
}

export default function FileNameDialog({
  isOpen,
  defaultValue,
  title = 'تصدير الملف',
  message = 'يرجى إدخال اسم ملف التصدير:',
  placeholder = 'اسم الملف',
  onConfirm,
  onCancel
}: FileNameDialogProps) {
  const [fileName, setFileName] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFileName(defaultValue);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, defaultValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = fileName.trim();
    if (trimmedName) {
      onConfirm(trimmedName);
    }
  };

  const handleKeyDown = (e: React.KeyboardEventInputElement) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-dialog-backdrop"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)' }}
      onClick={onCancel}
    >
      <div 
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl animate-dialog-content border border-blue-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-blue-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
              <FileDown className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">{title}</h3>
              <p className="text-xs text-slate-500 mt-0.5">تحديد اسم ملف التصدير</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-sm text-slate-600 mb-4 leading-relaxed">{message}</p>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="cs-label">
                اسم الملف
              </label>
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  className="cs-input pr-12"
                  dir="auto"
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <span className="text-xs text-slate-400 font-medium">.zip</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                سيتم إضافة الامتداد تلقائياً عند التصدير
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 cs-btn cs-btn-ghost"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={!fileName.trim()}
                className="flex-1 cs-btn cs-btn-primary gap-2"
              >
                <Download className="w-4 h-4" />
                تصدير
              </button>
            </div>
          </form>
        </div>

        {/* Footer decoration */}
        <div className="h-1 bg-gradient-to-r from-blue-500 via-blue-400 to-blue-500 rounded-b-2xl" />
      </div>
    </div>
  );
}
