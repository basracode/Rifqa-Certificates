import React, { useRef, useState, useEffect } from 'react';
import { Eraser, Check, Paintbrush, X } from 'lucide-react';

interface SignaturePadProps {
  onSaveSignature: (base64Data: string) => void;
  onClose: () => void;
  customAlert: (msg: string) => Promise<void>;
}

export default function SignaturePad({ onSaveSignature, onClose, customAlert }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokeColor, setStrokeColor] = useState('#1e3a8a'); // dynamic ink (deep blue default)
  const [lineWidth, setLineWidth] = useState(3);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas dimensions with high definition scaling
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(2, 2);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }, []);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const coords = getCoordinates(e.nativeEvent);
    if (!coords) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();

    const coords = getCoordinates(e.nativeEvent);
    if (!coords) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleSave = async () => {
    if (!hasDrawn) {
      await customAlert('الرجاء رسم التوقيع أولاً قبل الحفظ!');
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Convert to web image data url
    const dataUrl = canvas.toDataURL('image/png');
    onSaveSignature(dataUrl);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl" id="sig-pad-overlay">
      <div className="bg-white rounded-[1.75rem] w-full max-w-lg shadow-[0_24px_60px_rgba(15,23,42,0.25)] overflow-hidden flex flex-col animate-dialog-content">
        {/* Header */}
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h4 className="font-bold text-slate-800 text-base">لوحة التوقيع الرقمي الحيّ</h4>
            <p className="text-xs text-slate-400 mt-0.5">ارسم توقيعك بالماوس أو شاشات اللمس لإضافته فورياً للشهادة</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-lg transition-all"
            id="btn-close-sig"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Canvas Body */}
        <div className="p-6 space-y-5">
          <div className="border border-slate-200 rounded-2xl bg-slate-50 relative overflow-hidden h-48">
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="w-full h-full cursor-crosshair touch-none block"
            />
            {!hasDrawn && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-xs">
                ارسم هنا...
              </div>
            )}
          </div>

          {/* Options & Settings */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                <Paintbrush className="w-3.5 h-3.5" /> لون الحبر:
              </span>
              <div className="flex items-center gap-2">
                {[
                  { value: '#000000', label: 'أسود' },
                  { value: '#1e3a8a', label: 'كحلي' },
                  { value: '#047857', label: 'زيتوني' },
                  { value: '#78350f', label: 'بني' },
                ].map((color) => (
                  <button
                    key={color.value}
                    onClick={() => setStrokeColor(color.value)}
                    aria-label={color.label}
                    className={`w-8 h-8 rounded-full border-2 transition-all cursor-pointer ${
                      strokeColor === color.value ? 'scale-110 ring-2 ring-indigo-500 ring-offset-1 border-white shadow-md' : 'border-white hover:scale-105'
                    }`}
                    style={{ backgroundColor: color.value }}
                    title={color.label}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">حجم الخط:</span>
              <input
                type="range"
                min="1.5"
                max="6"
                step="0.5"
                value={lineWidth}
                onChange={(e) => setLineWidth(parseFloat(e.target.value))}
                className="w-24 accent-indigo-600"
              />
              <span className="text-xs font-mono text-slate-400">{lineWidth}px</span>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={clearCanvas}
            className="px-4 py-2 bg-slate-100 rounded-xl hover:bg-slate-200 text-slate-600 text-xs font-medium flex items-center gap-1.5 transition-all"
            id="btn-clear-canvas"
          >
            <Eraser className="w-3.5 h-3.5" /> مسح لوحة الرسم
          </button>
          
          <button
            onClick={handleSave}
            disabled={!hasDrawn}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all shadow-md active:scale-95"
            id="btn-apply-sig"
          >
            <Check className="w-3.5 h-3.5" /> إدراج التوقيع في التصميم
          </button>
        </div>
      </div>
    </div>
  );
}
