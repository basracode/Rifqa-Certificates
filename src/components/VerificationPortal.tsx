import React, { useState, useEffect } from 'react';
import { Search, ShieldAlert, ShieldCheck, Calendar, Award, User, Loader2, Layers } from 'lucide-react';
import { Attendee, Workshop } from '../types';

interface VerificationPortalProps {
  attendeesList: Attendee[];
  workshop: Workshop;
  initialQuery?: string;
}

export default function VerificationPortal({ attendeesList, workshop, initialQuery }: VerificationPortalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [scannedResult, setScannedResult] = useState<{ attendee: Attendee; isMatch: boolean } | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const sanitizeQuery = (q: string) => q.trim().slice(0, 200).replace(/<[^>]*>/g, '');

  // Auto-search when arriving via QR deep-link (?verify=SERIAL)
  useEffect(() => {
    if (!initialQuery) return;
    setSearchQuery(initialQuery);
    const lower = initialQuery.toLowerCase();
    const found = attendeesList.find(
      a =>
        a.serialNumber.toLowerCase() === lower ||
        a.name.toLowerCase().includes(lower) ||
        (a.email && a.email.toLowerCase() === lower)
    );
    setHasSearched(true);
    setScannedResult(found ? { attendee: found, isMatch: true } : null);
  }, [initialQuery, attendeesList]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = sanitizeQuery(searchQuery);
    if (!q) return;

    setHasSearched(true);
    setIsSearching(true);

    await new Promise(r => setTimeout(r, 300));

    const lower = q.toLowerCase();
    const found = attendeesList.find(
      a =>
        a.serialNumber.toLowerCase() === lower ||
        a.name.toLowerCase().includes(lower) ||
        (a.email && a.email.toLowerCase() === lower)
    );

    setScannedResult(found ? { attendee: found, isMatch: true } : null);
    setIsSearching(false);
  };

  const handleDemoVerify = (attendee: Attendee) => {
    setSearchQuery(attendee.serialNumber);
    setScannedResult({ attendee, isMatch: true });
    setHasSearched(true);
  };

  return (
    <div className="space-y-6" dir="rtl" id="verifier-root">

      {/* Header Card */}
      <div className="cs-card cs-card-pad">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl text-white shadow-[0_8px_20px_rgba(37,99,235,0.25)]">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-lg">بوابة التحقق من الشهادات</h3>
              <p className="text-xs text-slate-400 mt-0.5">ابحث بالرقم المرجعي أو اسم المشترك أو البريد الإلكتروني</p>
            </div>
          </div>

          {/* Quick Demo Selector */}
          {attendeesList.length > 0 && (
            <div className="bg-indigo-50 border border-indigo-100 p-2.5 rounded-xl space-y-1.5">
              <span className="text-[10px] text-indigo-600 block font-semibold">تحقق سريع من نماذج محمّلة:</span>
              <div className="flex gap-1.5 flex-wrap">
                {attendeesList.slice(0, 3).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => handleDemoVerify(a)}
                    className="bg-white hover:bg-indigo-600 hover:text-white border border-indigo-200 px-2.5 py-1 rounded-lg text-[11px] text-indigo-700 font-medium transition-all cursor-pointer whitespace-nowrap"
                  >
                    {a.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Search + Results Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

        {/* Search Panel */}
        <div className="lg:col-span-5 cs-card cs-card-pad space-y-4">
          <label htmlFor="verification-search-input" className="cs-section-title text-sm block">البحث والتحقق الفوري</label>

          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="الرقم المرجعي أو الاسم…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value.slice(0, 200))}
                className="cs-input pr-10"
                id="verification-search-input"
                aria-label="البحث عن شهادة بالرقم المرجعي أو الاسم"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <button
              type="submit"
              disabled={!searchQuery.trim() || isSearching}
              className="cs-btn cs-btn-primary px-4 py-2.5"
            >
              {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              تحقق
            </button>
          </form>

          <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-xs text-slate-600 space-y-2 leading-relaxed">
            <p className="font-bold text-slate-700">كيف يعمل نظام التحقق؟</p>
            <p>كل شهادة تحمل رمز QR فريد يحتوي على الرقم المرجعي المشفر للمشترك.</p>
            <p>بمسح الرمز أو إدخال الرقم هنا يتم التحقق الفوري من صحة الشهادة.</p>
          </div>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-7">
          {!hasSearched ? (
            <div className="bg-white border border-blue-50 h-52 rounded-2xl flex flex-col items-center justify-center text-slate-400 text-center gap-3">
              <div className="p-4 bg-blue-50 rounded-full">
                <ShieldCheck className="w-8 h-8 text-indigo-200" />
              </div>
              <p className="text-sm text-slate-400 max-w-xs leading-relaxed">
                أدخل الرقم المرجعي أو اسم المشترك في حقل البحث للتحقق من صحة الشهادة
              </p>
            </div>
          ) : isSearching ? (
            <div className="bg-white border border-blue-50 h-52 rounded-2xl flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
            </div>
          ) : scannedResult ? (
            <div className="bg-white border-2 border-emerald-200 rounded-2xl shadow-sm overflow-hidden" id="verifier-result-success">
              {/* Success Banner */}
              <div className="bg-emerald-500 text-white px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5" />
                  <span className="font-bold text-sm">شهادة موثقة وصالحة</span>
                </div>
                <span className="text-emerald-100 text-xs">{new Date().toLocaleDateString('ar-SA')}</span>
              </div>

              <div className="p-5 space-y-4">
                {/* Attendee Name */}
                <div className="flex items-center gap-3 pb-4 border-b border-emerald-50">
                  <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
                    <Award className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-base">{scannedResult.attendee.name}</h4>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{scannedResult.attendee.serialNumber}</p>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="bg-blue-50/50 rounded-xl p-3 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wide block font-semibold">البرنامج التدريبي</span>
                    <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                      {workshop.title || 'غير محدد'}
                    </span>
                  </div>

                  <div className="bg-blue-50/50 rounded-xl p-3 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wide block font-semibold">المدرب والمشرف</span>
                    <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                      {workshop.instructor || 'غير محدد'}
                    </span>
                  </div>

                  <div className="bg-blue-50/50 rounded-xl p-3 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wide block font-semibold">مدة البرنامج</span>
                    <span className="font-semibold text-slate-700">{workshop.hours} ساعة تدريبية</span>
                  </div>

                  <div className="bg-blue-50/50 rounded-xl p-3 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wide block font-semibold">تاريخ الانعقاد</span>
                    <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                      {workshop.dateArabic || 'غير محدد'}
                    </span>
                  </div>
                </div>

                {/* Custom Fields */}
                {scannedResult.attendee.customFields &&
                  Object.keys(scannedResult.attendee.customFields).filter(k => !k.match(/الاسم|اسم|name|email|بريد/i)).length > 0 && (
                  <div className="border-t border-slate-100 pt-3 space-y-2">
                    <span className="text-xs font-semibold text-slate-500 block">بيانات إضافية:</span>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.keys(scannedResult.attendee.customFields).map((key) => {
                        if (key.match(/الاسم|اسم|name|email|بريد/i)) return null;
                        return (
                          <div key={key} className="bg-slate-50 rounded-lg p-2 text-xs">
                            <span className="text-slate-400 block">{key}</span>
                            <span className="font-semibold text-slate-700">{scannedResult.attendee.customFields?.[key]}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="text-[10px] text-slate-400 text-center font-mono pt-1">
                  رقم مرجعي مشفر · سجل رقمي آمن · {workshop.organizationName || 'Certify Studio'}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border-2 border-red-200 rounded-2xl overflow-hidden" id="verifier-result-fail">
              <div className="bg-red-50 border-b border-red-100 px-5 py-3 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-500" />
                <span className="font-bold text-red-700 text-sm">الشهادة غير موجودة</span>
              </div>
              <div className="p-8 text-center space-y-3">
                <div className="p-4 bg-red-50 rounded-full inline-block">
                  <ShieldAlert className="w-8 h-8 text-red-400" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-700 text-sm">لم يُعثر على تطابق</h4>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                    لا توجد شهادة مطابقة للبحث في سجلات {workshop.title || 'البرنامج الحالي'}. تأكد من صحة الرقم المرجعي أو الاسم.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
