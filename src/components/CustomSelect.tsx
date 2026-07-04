import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  id?: string;
  variant?: 'default' | 'toolbar';
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'اختر خياراً...',
  className = '',
  id,
  variant = 'default'
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const selectedOption = options.find(opt => opt.value === value);

  // CSS classes based on variant
  const isToolbar = variant === 'toolbar';

  const buttonClasses = isToolbar
    ? 'flex items-center justify-between gap-1 px-1.5 py-0.5 bg-transparent hover:bg-white/10 rounded text-[10px] text-white transition-all outline-none cursor-pointer'
    : 'w-full flex items-center justify-between px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-indigo-300 rounded-xl text-xs font-semibold text-slate-700 transition-all shadow-sm outline-none cursor-pointer focus:ring-1 focus:ring-indigo-400';

  const dropdownClasses = isToolbar
    ? 'absolute z-[150] bottom-full mb-1.5 left-1/2 -translate-x-1/2 min-w-[70px] bg-slate-900 border border-slate-850 rounded-lg shadow-xl py-1 max-h-40 overflow-y-auto animate-in fade-in slide-in-from-bottom-2 duration-150'
    : 'absolute z-50 mt-1.5 w-full bg-white border border-slate-150 rounded-xl shadow-xl py-1.5 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-150';

  const optionClasses = (isSelected: boolean) => {
    if (isToolbar) {
      return `w-full text-center px-3 py-1 text-[10px] transition-colors flex items-center justify-center cursor-pointer ${
        isSelected
          ? 'bg-indigo-600/40 text-indigo-200 font-bold'
          : 'text-slate-300 hover:bg-white/10 hover:text-white'
      }`;
    }
    return `w-full text-right px-3.5 py-2 text-xs transition-colors flex items-center justify-between cursor-pointer ${
      isSelected
        ? 'bg-indigo-50 text-indigo-700 font-bold'
        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
    }`;
  };

  const chevronClasses = isToolbar
    ? `w-3 h-3 text-white/60 transition-transform duration-200 ${isOpen ? 'rotate-180 text-white' : ''}`
    : `w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-indigo-500' : ''}`;

  return (
    <div 
      ref={containerRef} 
      className={`relative inline-block text-right select-none ${isToolbar ? '' : 'w-full font-sans'} ${className}`}
      id={id}
    >
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={buttonClasses}
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown className={chevronClasses} />
      </button>

      {/* Floating Options Dropdown Menu */}
      {isOpen && (
        <div 
          className={dropdownClasses}
          style={isToolbar ? {} : { minWidth: '100%' }}
        >
          {options.length === 0 ? (
            <div className={`px-3 py-2 text-[10px] text-center ${isToolbar ? 'text-slate-500' : 'text-slate-400'}`}>
              لا توجد خيارات
            </div>
          ) : (
            options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={optionClasses(isSelected)}
                >
                  <span className="truncate">{opt.label}</span>
                  {!isToolbar && isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
