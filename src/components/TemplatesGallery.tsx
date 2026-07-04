import React, { useState, useRef } from 'react';
import { PredefinedTemplate } from '../types';
import { LayoutTemplate, Check, Plus, Trash2, Save, Sparkles, Download, Upload, FileJson } from 'lucide-react';

interface TemplatesGalleryProps {
  templates: PredefinedTemplate[];
  selectedTemplateId: string;
  onSelectTemplate: (template: PredefinedTemplate) => void;
  onSaveAsNewTemplate: (name: string, category: string) => void;
  onUpdateTemplate: (id: string) => void;
  onDeleteTemplate: (id: string) => void;
  onExportActiveTemplate: () => void;
  onExportSpecificTemplate: (template: PredefinedTemplate) => void;
  onImportTemplate: (templateData: any) => void;
  onImportTemplateZip?: (file: File) => Promise<void>;
  isCompact?: boolean;
  customAlert: (msg: string) => Promise<void>;
  customConfirm: (msg: string) => Promise<boolean>;
}

const CATEGORY_OPTIONS = ['دورة', 'ورشة', 'تكريم', 'مشاركة', 'حضور', 'أخرى'];

export default function TemplatesGallery({
  templates,
  selectedTemplateId,
  onSelectTemplate,
  onSaveAsNewTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onExportActiveTemplate,
  onExportSpecificTemplate,
  onImportTemplate,
  onImportTemplateZip,
  isCompact = false,
  customAlert,
  customConfirm,
}: TemplatesGalleryProps) {
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateCategory, setNewTemplateCategory] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredTemplates = templates;

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isZip = file.name.toLowerCase().endsWith('.zip');
    const maxSize = isZip ? 15 * 1024 * 1024 : 3 * 1024 * 1024; // 15MB for ZIP, 3MB for JSON

    if (file.size > maxSize) {
      await customAlert(`ملف القالب كبير جداً! الحد الأقصى هو ${isZip ? '15' : '3'} ميجابايت.`);
      e.target.value = '';
      return;
    }

    if (isZip) {
      if (onImportTemplateZip) {
        await onImportTemplateZip(file);
      }
    } else {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const text = event.target?.result as string;
          const data = JSON.parse(text);
          onImportTemplate(data);
        } catch {
          await customAlert('حدث خطأ أثناء قراءة ملف القالب. تأكد من أنه ملف JSON صالح.');
        }
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  const activeTemplate = templates.find(t => t.id === selectedTemplateId);
  const isCustomActive = activeTemplate?.id.startsWith('custom_');

  const handleSave = async () => {
    if (!newTemplateName.trim()) {
      await customAlert('الرجاء كتابة اسم القالب أولاً!');
      return;
    }
    onSaveAsNewTemplate(newTemplateName.trim(), newTemplateCategory.trim());
    setNewTemplateName('');
    setNewTemplateCategory('');
    setIsAdding(false);
  };

  const handleExportAllCustom = () => {
    const customTemplates = templates.filter(t => t.id.startsWith('custom_'));
    if (customTemplates.length === 0) {
      customAlert('لا توجد قوالب مخصصة محفوظة بعد!');
      return;
    }
    const blob = new Blob([JSON.stringify(customTemplates, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'templates.json';
    a.click();
    URL.revokeObjectURL(url);
    customAlert('تم تنزيل templates.json\n\nلإضافة هذه القوالب بشكل دائم:\nضع الملف في مجلد public/ في مشروعك ثم أعد تشغيل الموقع.');
  };

  return (
    <div className={isCompact ? 'space-y-4' : 'bg-white p-6 rounded-2xl border border-blue-100 shadow-sm space-y-5'} dir="rtl" id="templates-gallery-root">

      {/* Header */}
      <div className={`flex flex-col gap-3 pb-3 border-b border-blue-50 ${isCompact ? '' : 'sm:flex-row sm:items-center justify-between'}`}>
        {!isCompact && (
          <div className="flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 text-indigo-500" />
            <div>
              <h3 className="font-semibold text-slate-800 text-base">قوالب الشهادات</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">اختر قالباً أو صمّم وأحفظ قالبك الخاص</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {/* Import */}
          <input ref={fileInputRef} type="file" onChange={handleFileImport} accept=".json,.zip" className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-100 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            title="استيراد قالب JSON أو ZIP"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-600" />
            استيراد
          </button>

          {/* Export active */}
          <button
            onClick={onExportActiveTemplate}
            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            title="تصدير التصميم الحالي"
          >
            <Download className="w-3.5 h-3.5 text-amber-600" />
            تصدير
          </button>

          {/* Export ALL custom templates → templates.json */}
          <button
            onClick={handleExportAllCustom}
            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            title="تنزيل جميع قوالبي كملف templates.json"
          >
            <FileJson className="w-3.5 h-3.5" />
            حفظ في الموقع
          </button>

          {/* Update active custom template */}
          {isCustomActive && (
            <button
              onClick={async () => {
                if (await customConfirm(`حفظ التعديلات على "${activeTemplate?.name}"؟`)) {
                  onUpdateTemplate(selectedTemplateId);
                }
              }}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              تحديث القالب
            </button>
          )}

          {/* Save as new */}
          {!isAdding ? (
            <button
              onClick={() => setIsAdding(true)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              حفظ كقالب جديد
            </button>
          ) : (
            <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl space-y-2 w-full sm:w-auto min-w-[280px]">
              <input
                type="text"
                placeholder="اسم القالب (مثال: شهادة الدورات)"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                className="w-full bg-white border border-blue-100 px-2.5 py-1.5 text-xs rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                autoFocus
                id="custom-tmpl-name-input"
              />
              <div className="flex gap-1.5 flex-wrap">
                {CATEGORY_OPTIONS.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setNewTemplateCategory(cat === newTemplateCategory ? '' : cat)}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-full border transition-all cursor-pointer ${
                      newTemplateCategory === cat
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
                <input
                  type="text"
                  placeholder="تصنيف آخر..."
                  value={CATEGORY_OPTIONS.includes(newTemplateCategory) ? '' : newTemplateCategory}
                  onChange={(e) => setNewTemplateCategory(e.target.value)}
                  className="flex-1 min-w-[80px] bg-white border border-slate-200 px-2 py-0.5 text-[10px] rounded-full text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSave}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer"
                >
                  حفظ القالب
                </button>
                <button
                  onClick={() => { setIsAdding(false); setNewTemplateName(''); setNewTemplateCategory(''); }}
                  className="text-slate-400 hover:text-slate-600 text-xs px-2 cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}
        </div>
      </div>



      {/* Templates grid */}
      <div className={filteredTemplates.length === 0 ? 'w-full' : (isCompact ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-2 lg:grid-cols-4 gap-4')}>
        {filteredTemplates.length === 0 ? (
          <div className="p-8 text-center space-y-3 bg-slate-50 rounded-2xl border border-dashed border-slate-200 w-full col-span-full">
            <LayoutTemplate className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-xs font-bold text-slate-600">لا توجد قوالب محفوظة بعد</p>
            <p className="text-[10px] text-slate-400 max-w-xs mx-auto leading-relaxed">
              ابدأ برفع صورة/ملف خلفية مخصصة للشهادة من قسم "الإطار والخلفية" أو أضف نصوصاً للتصميم، ثم احفظها كقالب جديد لتثبيتها في الموقع.
            </p>
          </div>
        ) : (
          filteredTemplates.map((tmpl) => {
            const isSelected = selectedTemplateId === tmpl.id;
            const isCustom = tmpl.id.startsWith('custom_');

          return (
            <div
              key={tmpl.id}
              className={`relative group flex flex-col text-right rounded-xl overflow-hidden border transition-all duration-200 ${
                isSelected
                  ? 'border-indigo-500 ring-2 ring-indigo-100 bg-indigo-50/20 shadow-md'
                  : 'border-blue-100 hover:border-indigo-300 bg-white hover:shadow-sm'
              }`}
            >
              <button
                onClick={() => onSelectTemplate(tmpl)}
                className="w-full text-right outline-none flex flex-col h-full cursor-pointer"
                id={`tmpl-btn-${tmpl.id}`}
              >
                {/* Thumbnail */}
                <div
                  className="w-full aspect-video flex-shrink-0 flex items-center justify-center relative p-3"
                  style={{
                    backgroundImage: tmpl.backgroundImageUrl ? `url(${tmpl.backgroundImageUrl})` : tmpl.backgroundStyle,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                >
                  <div className="absolute inset-1 border" style={{ borderColor: tmpl.borderColor || '#c5a85c', opacity: 0.6 }} />
                  {!tmpl.backgroundImageUrl && (
                    <div className="flex flex-col items-center justify-center space-y-1.5 z-10 text-center scale-95">
                      <span className="text-[7px] font-bold block max-w-[80px] truncate" style={{ color: tmpl.elements[0]?.color || '#84621a' }}>
                        {tmpl.elements[0]?.content || 'CERTIFICATE'}
                      </span>
                      <div className="w-12 h-1 bg-slate-300 rounded opacity-60" />
                    </div>
                  )}

                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 bg-indigo-600 text-white p-0.5 rounded-full z-20">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3 text-xs flex-1 flex flex-col justify-between space-y-2">
                  <div className="space-y-1.5">
                    <div className="flex items-start gap-1">
                      {isCustom && <Sparkles className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />}
                      <p className="font-bold text-slate-800 text-xs break-words whitespace-normal leading-tight flex-1">
                        {tmpl.name}
                      </p>
                    </div>
                    
                    {/* Category label/badge */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full border ${
                        tmpl.category === 'ورشة' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                        tmpl.category === 'دورة' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                        tmpl.category === 'تكريم' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                        tmpl.category === 'مشاركة' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                        'bg-slate-50 text-slate-600 border-slate-100'
                      }`}>
                        {tmpl.category || 'أخرى'}
                      </span>
                      <span className="text-[9px] text-slate-400">
                        {isCustom ? 'قالب مخصص' : 'قالب جاهز'}
                      </span>
                    </div>
                  </div>
                </div>
              </button>

              {/* Custom template actions */}
              {isCustom && (
                <div className="absolute bottom-9 left-1.5 flex items-center gap-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (await customConfirm(`حذف القالب "${tmpl.name}"؟`)) {
                        onDeleteTemplate(tmpl.id);
                      }
                    }}
                    className="bg-red-50 hover:bg-red-100 text-red-500 p-1.5 rounded-lg transition-all cursor-pointer"
                    title="حذف القالب"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })
        )}
      </div>
    </div>
  );
}
