import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { FileUp, Table, Check, HelpCircle, Loader2, Hash, Trash2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Attendee } from '../types';
import CustomSelect from './CustomSelect';

interface ExcelImporterProps {
  onAttendeesImported: (attendees: Attendee[], columnMapping: { nameKey: string; emailKey?: string }) => void;
  serialPrefix: string;
  customAlert: (msg: string) => Promise<void>;
  autoOpenUpload?: boolean;
  onUploadTriggered?: () => void;
}

const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// Keys blocked to prevent prototype pollution from malicious xlsx files
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype', '__defineGetter__', '__defineSetter__']);

function sanitizeText(val: unknown, maxLen = 300): string {
  if (val === null || val === undefined) return '';
  return String(val).trim().replace(/<[^>]*>/g, '').slice(0, maxLen);
}

function isSafeKey(key: string): boolean {
  return !DANGEROUS_KEYS.has(key) && !key.startsWith('__');
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function ExcelImporter({ onAttendeesImported, serialPrefix, customAlert, autoOpenUpload, onUploadTriggered }: ExcelImporterProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<any[]>([]);
  const [selectedNameKey, setSelectedNameKey] = useState<string>('');
  const [selectedEmailKey, setSelectedEmailKey] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [textInput, setTextInput] = useState<string>('');
  const [showTextInput, setShowTextInput] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadIdRef = useRef<number>(Date.now());

  // Auto-open file picker when triggered from wizard
  useEffect(() => {
    if (autoOpenUpload && fileInputRef.current) {
      setCollapsed(false);
      const timer = setTimeout(() => {
        fileInputRef.current?.click();
        onUploadTriggered?.();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [autoOpenUpload]);

  const validateFile = async (file: File): Promise<boolean> => {
    if (file.size > MAX_FILE_SIZE) {
      await customAlert('حجم الملف كبير جداً! الحد الأقصى المسموح به هو 10 ميجابايت.');
      return false;
    }
    const extOk = /\.(xlsx|xls|csv)$/i.test(file.name);
    const mimeOk = ALLOWED_MIME_TYPES.includes(file.type);
    if (!extOk && !mimeOk) {
      await customAlert('نوع الملف غير مدعوم! يرجى رفع ملف بصيغة Excel (.xlsx, .xls) أو CSV فقط.');
      return false;
    }
    return true;
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const processFile = async (file: File) => {
    if (!(await validateFile(file))) return;

    uploadIdRef.current = Date.now();
    setFileName(file.name);
    setLoading(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error('لا يمكن قراءة ملف البيانات');

        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);

        if (jsonData.length === 0) {
          await customAlert('الملف فارغ أو لا يحتوي على صفوف بيانات!');
          setLoading(false);
          return;
        }

        if (jsonData.length > 5000) {
          await customAlert('يحتوي الملف على أكثر من 5000 صف. يرجى تقسيم البيانات لضمان الأداء.');
          setLoading(false);
          return;
        }

        const firstRowKeys = Object.keys(jsonData[0]);
        setHeaders(firstRowKeys);
        setRawData(jsonData);

        const nameGuess = firstRowKeys.find(k => /الاسم|اسم|name|full.*name|student|recipient/i.test(k)) || firstRowKeys[0];
        const emailGuess = firstRowKeys.find(k => /البريد|ايميل|email|mail|e-mail/i.test(k)) || '';

        setSelectedNameKey(nameGuess);
        setSelectedEmailKey(emailGuess);
        setLoading(false);
      } catch (err) {
        console.error(err);
        await customAlert('حدث خطأ أثناء قراءة الملف. تأكد من أنه ملف Excel أو CSV صالح.');
        setLoading(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files?.[0]) processFile(e.target.files[0]);
  };

  const generateSerial = (index: number) => {
    const prefix = serialPrefix.trim() || 'CERT';
    const timestamp = Date.now().toString().slice(-4);
    const order = (index + 1).toString().padStart(3, '0');
    const randomHex = Math.floor(1000 + Math.random() * 9000).toString(16).toUpperCase().slice(-3);
    return `${prefix}-${timestamp}-${order}${randomHex}`;
  };

  const onImportedRef = useRef(onAttendeesImported);
  useEffect(() => {
    onImportedRef.current = onAttendeesImported;
  }, [onAttendeesImported]);

  useEffect(() => {
    if (rawData.length > 0 && selectedNameKey) {
      const compiledAttendees: Attendee[] = rawData.map((row, index) => {
        const serial = generateSerial(index);
        const name = sanitizeText(row[selectedNameKey], 200);
        const rawEmail = sanitizeText(row[selectedEmailKey] || '', 254);
        const email = rawEmail && isValidEmail(rawEmail) ? rawEmail : (rawEmail || '');

        const customFields: Record<string, string> = Object.create(null);
        Object.keys(row).forEach(key => {
          if (!isSafeKey(key)) return;
          const safeKey = sanitizeText(key, 100);
          if (safeKey) customFields[safeKey] = sanitizeText(row[key], 500);
        });

        return {
          id: `att-${index}-${uploadIdRef.current}`,
          name,
          email,
          serialNumber: serial,
          certificateId: serial,
          customFields,
        };
      }).filter(att => att.name.length > 0);

      onImportedRef.current(compiledAttendees, {
        nameKey: selectedNameKey,
        emailKey: selectedEmailKey || undefined,
      });
    }
  }, [rawData, selectedNameKey, selectedEmailKey, serialPrefix]);

  const handleTextSubmit = async () => {
    if (!textInput.trim()) {
      await customAlert('الرجاء كتابة أو لصق الأسماء أولاً!');
      return;
    }

    uploadIdRef.current = Date.now();

    const lines = textInput.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length > 2000) {
      await customAlert('القائمة كبيرة جداً! الحد الأقصى 2000 اسم في الإدخال النصي.');
      return;
    }

    const parsedData = lines.map(line => {
      if (line.includes(',') || line.includes('\t')) {
        const parts = line.split(/[,\t]/).map(p => p.trim());
        return { 'الاسم': sanitizeText(parts[0]), 'البريد الإلكتروني': sanitizeText(parts[1] || '') };
      }
      return { 'الاسم': sanitizeText(line), 'البريد الإلكتروني': '' };
    });

    setHeaders(['الاسم', 'البريد الإلكتروني']);
    setRawData(parsedData);
    setSelectedNameKey('الاسم');
    setSelectedEmailKey('البريد الإلكتروني');
  };

  const loadDemoData = () => {
    uploadIdRef.current = Date.now();
    const demo = [
      { 'الاسم': 'أحمد بن عبد الله السيف', 'البريد الإلكتروني': 'ahmed@example.com', 'الدرجة': 'ممتاز', 'المدينة': 'الرياض' },
      { 'الاسم': 'سارة بنت فيصل الشمري', 'البريد الإلكتروني': 'sara@example.com', 'الدرجة': 'امتياز مع مرتبة الشرف', 'المدينة': 'الدمام' },
      { 'الاسم': 'خالد محمد العتيبي', 'البريد الإلكتروني': 'khaled@example.com', 'الدرجة': 'جيد جداً مرتفع', 'المدينة': 'جدة' },
      { 'الاسم': 'فاطمة عمر باعشن', 'البريد الإلكتروني': 'fatima@example.com', 'الدرجة': 'ممتاز', 'المدينة': 'مكة المكرمة' },
      { 'الاسم': 'عمر عبد العزيز الهاشمي', 'البريد الإلكتروني': 'omar@example.com', 'الدرجة': 'امتياز', 'المدينة': 'المدينة المنورة' },
    ];
    setHeaders(['الاسم', 'البريد الإلكتروني', 'الدرجة', 'المدينة']);
    setRawData(demo);
    setSelectedNameKey('الاسم');
    setSelectedEmailKey('البريد الإلكتروني');
    setFileName('نموذج متدربين افتراضي.xlsx');
  };

  return (
    <div className="cs-card overflow-hidden" dir="rtl" id="excel-importer-container">
      {/* Collapsible Header */}
      <button
        type="button"
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50/70 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-indigo-100 rounded-lg flex-shrink-0">
            <Table className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-right">
            <h3 className="font-bold text-slate-800 text-base">قائمة المشتركين والمستلمين</h3>
            {collapsed && rawData.length > 0 && (
              <p className="text-[11px] text-emerald-600 font-semibold">{rawData.length} مشترك محمّل</p>
            )}
            {collapsed && rawData.length === 0 && (
              <p className="text-[11px] text-slate-400">لم يتم الاستيراد بعد</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </div>
      </button>

      {/* Collapsible Body */}
      {!collapsed && (
      <div className="px-6 pb-6 space-y-6 border-t border-blue-50">

      {rawData.length === 0 ? (
        <div className="space-y-4">
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              dragActive
                ? 'border-indigo-400 bg-indigo-50/50'
                : 'border-blue-100 hover:border-indigo-300 hover:bg-blue-50/30'
            }`}
            id="drag-drop-zone"
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleChange}
              accept=".xlsx,.xls,.csv"
              className="hidden"
            />
            {loading ? (
              <div className="space-y-3">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mx-auto" />
                <p className="text-slate-600 font-medium text-sm">جاري معالجة وتحليل الملف...</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-4 bg-indigo-50 rounded-2xl inline-block text-indigo-500 mx-auto">
                  <FileUp className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">اسحب ملف Excel هنا أو اضغط للرفع</p>
                  <p className="text-xs text-slate-400 mt-1">xlsx, xls, csv — الحجم الأقصى 10 MB</p>
                </div>
              </div>
            )}
          </div>

          {/* Security note */}
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 p-3 rounded-xl text-xs text-blue-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-500" />
            <span>جميع البيانات تُعالج محلياً داخل المتصفح فقط ولا تُرسل لأي خادم خارجي.</span>
          </div>

          <div className="flex items-center justify-center gap-3">
            <span className="h-px bg-slate-100 flex-1" />
            <span className="text-xs text-slate-400">أو</span>
            <span className="h-px bg-slate-100 flex-1" />
          </div>

          {!showTextInput ? (
            <button
              onClick={() => setShowTextInput(true)}
              className="w-full py-2.5 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-indigo-600 rounded-xl text-xs font-medium border border-slate-100 hover:border-indigo-100 transition-all cursor-pointer"
              id="toggle-text-input"
            >
              لصق أو كتابة قائمة أسماء مباشرة بالنص
            </button>
          ) : (
            <div className="space-y-3 p-4 bg-blue-50/50 rounded-xl border border-blue-100">
              <label className="text-xs font-semibold text-slate-600 block">
                اكتب أو الصق الأسماء (اسم بكل سطر) — يمكن إضافة الإيميل بفاصلة:
              </label>
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={`عبد الله محمد، abdullah@email.com\nريم عبد العزيز، reem@email.com\nفيصل السيف`}
                rows={4}
                className="w-full p-2.5 bg-white border border-blue-100 rounded-lg text-sm focus:outline-none focus:border-indigo-400 font-mono text-right text-slate-700"
                id="textarea-manual-names"
              />
              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={handleTextSubmit}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-4 py-2 rounded-lg transition-all cursor-pointer font-semibold"
                  id="btn-submit-text-names"
                >
                  تحويل وحفظ الأسماء
                </button>
                <button
                  type="button"
                  onClick={() => setShowTextInput(false)}
                  className="text-slate-400 hover:text-red-500 text-xs transition-all cursor-pointer"
                  id="btn-cancel-text-names"
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Column Mapping */}
          <div className="bg-indigo-50/60 rounded-2xl p-5 border border-indigo-100 space-y-4">
            <div className="flex gap-2.5">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
              <div>
                <h4 className="font-bold text-slate-800 text-sm">تأكيد مطابقة الأعمدة</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  الملف: <span className="font-semibold text-indigo-700">{fileName}</span>
                  <span className="mr-2 text-slate-400">({rawData.length} صف)</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span>عمود الاسم *</span>
                  <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded border border-red-100">إلزامي</span>
                </label>
                <CustomSelect
                  value={selectedNameKey}
                  onChange={setSelectedNameKey}
                  options={headers.map(h => ({ value: h, label: h }))}
                  placeholder="-- اختر عمود الأسماء --"
                  id="select-name-column"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span>عمود البريد الإلكتروني</span>
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">اختياري</span>
                </label>
                <CustomSelect
                  value={selectedEmailKey}
                  onChange={setSelectedEmailKey}
                  options={[
                    { value: '', label: '-- بدون بريد إلكتروني --' },
                    ...headers.map(h => ({ value: h, label: h }))
                  ]}
                  placeholder="-- اختر عمود البريد الإلكتروني --"
                  id="select-email-column"
                />
              </div>
            </div>

            <div className="flex justify-between items-center border-t border-indigo-100/70 pt-3 mt-1">
              <p className="text-xs text-indigo-600 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5" />
                سيتم توليد رمز تسلسلي لكل مشترك تلقائياً.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setRawData([]);
                    setHeaders([]);
                    setFileName('');
                    setSelectedNameKey('');
                    onImportedRef.current([], { nameKey: '' });
                  }}
                  className="px-3 py-2 text-slate-400 hover:text-red-500 hover:bg-red-50 text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1"
                  id="btn-discard-uploaded"
                >
                  <Trash2 className="w-3.5 h-3.5" /> مسح الملف
                </button>
              </div>
            </div>
          </div>

          {/* Preview Table */}
          <div className="space-y-2">
            <h5 className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Hash className="w-3 h-3" />
              معاينة أول 4 صفوف:
            </h5>
            <div className="border border-blue-50 rounded-xl overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-blue-50 text-slate-500 font-semibold">
                    <th className="p-2.5 text-center">#</th>
                    {headers.map((h, i) => <th key={i} className="p-2.5">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-slate-600">
                  {rawData.slice(0, 4).map((row, i) => (
                    <tr key={i} className="hover:bg-blue-50/30">
                      <td className="p-2.5 text-center font-mono text-slate-400">{i + 1}</td>
                      {headers.map((h, j) => (
                        <td key={j} className="p-2.5 truncate max-w-[150px]">{row[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      </div>
      )}
    </div>
  );
}
