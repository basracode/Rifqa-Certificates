import React from 'react';
import { Attendee, Workshop, PredefinedTemplate } from '../types';
import {
  Users, LayoutTemplate, Award, Clock, Upload, Palette,
  ShieldCheck, ArrowLeft, Sparkles, CheckCircle2
} from 'lucide-react';

interface DashboardProps {
  attendees: Attendee[];
  workshop: Workshop;
  templates: PredefinedTemplate[];
  activeTemplate?: PredefinedTemplate;
  onGo: (tab: 'attendees' | 'design' | 'verify') => void;
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="cs-card cs-card-hover p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${accent}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-black text-slate-800 leading-none truncate">{value}</p>
        <p className="text-xs text-slate-400 font-medium mt-1.5">{label}</p>
      </div>
    </div>
  );
}

function ActionCard({ icon, title, desc, cta, onClick, accent }: {
  icon: React.ReactNode; title: string; desc: string; cta: string; onClick: () => void; accent: string;
}) {
  return (
    <button
      onClick={onClick}
      className="cs-card cs-card-hover p-6 text-right flex flex-col gap-4 group cursor-pointer"
    >
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${accent} transition-transform group-hover:scale-110`}>
        {icon}
      </div>
      <div className="flex-1">
        <h3 className="font-bold text-slate-800 text-base">{title}</h3>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">{desc}</p>
      </div>
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 group-hover:gap-2.5 transition-all">
        {cta}
        <ArrowLeft className="w-3.5 h-3.5" />
      </span>
    </button>
  );
}

export default function Dashboard({ attendees, workshop, templates, activeTemplate, onGo }: DashboardProps) {
  const customCount = templates.filter(t => t.id.startsWith('custom_')).length;
  const hasAttendees = attendees.length > 0;

  // flow steps
  const steps = [
    { n: 1, label: 'استيراد الحضور', done: hasAttendees },
    { n: 2, label: 'تصميم الشهادة', done: hasAttendees },
    { n: 3, label: 'تصدير الشهادات', done: false },
  ];

  return (
    <div className="space-y-6">

      {/* Hero / Welcome */}
      <div className="cs-card overflow-hidden relative">
        <div className="absolute top-0 left-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="cs-chip bg-indigo-50 text-indigo-600">
              <Sparkles className="w-3.5 h-3.5" />
              لوحة التحكم
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">
              {hasAttendees ? 'كل شيء جاهز للإصدار' : 'ابدأ بإنشاء شهاداتك'}
            </h2>
            <p className="text-sm text-slate-500 max-w-md leading-relaxed">
              {hasAttendees
                ? `لديك ${attendees.length} مشترك محمّل. صمّم الشهادة وصدّرها للجميع دفعة واحدة.`
                : 'استورد قائمة المشتركين، اختر أو صمّم قالب الشهادة، ثم صدّر الشهادات بصيغة PDF أو PNG.'}
            </p>
          </div>
          <button
            onClick={() => onGo(hasAttendees ? 'design' : 'attendees')}
            className="cs-btn cs-btn-primary text-sm px-6 py-3 self-start md:self-auto"
          >
            {hasAttendees ? <Palette className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
            {hasAttendees ? 'انتقل للتصميم' : 'ابدأ الآن'}
          </button>
        </div>

        {/* Flow steps strip */}
        <div className="relative border-t border-slate-100 bg-slate-50/50 px-6 md:px-8 py-4">
          <div className="flex items-center justify-between gap-2 max-w-2xl">
            {steps.map((s, i) => (
              <React.Fragment key={s.n}>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    s.done ? 'bg-emerald-500 text-white' : 'bg-white border-2 border-slate-200 text-slate-400'
                  }`}>
                    {s.done ? <CheckCircle2 className="w-4 h-4" /> : s.n}
                  </span>
                  <span className={`text-xs font-semibold whitespace-nowrap ${s.done ? 'text-slate-700' : 'text-slate-400'}`}>
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 rounded-full ${s.done ? 'bg-emerald-200' : 'bg-slate-200'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="w-6 h-6 text-indigo-600" />}
          label="مشترك محمّل"
          value={String(attendees.length)}
          accent="bg-indigo-50"
        />
        <StatCard
          icon={<LayoutTemplate className="w-6 h-6 text-violet-600" />}
          label="إجمالي القوالب"
          value={String(templates.length)}
          accent="bg-violet-50"
        />
        <StatCard
          icon={<Sparkles className="w-6 h-6 text-amber-600" />}
          label="قوالبي الخاصة"
          value={String(customCount)}
          accent="bg-amber-50"
        />
        <StatCard
          icon={<Clock className="w-6 h-6 text-emerald-600" />}
          label="ساعات معتمدة"
          value={String(workshop.hours || 0)}
          accent="bg-emerald-50"
        />
      </div>

      {/* Active template + Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ActionCard
          icon={<Upload className="w-6 h-6 text-indigo-600" />}
          title="استيراد الحضور"
          desc="ارفع ملف Excel/CSV أو الصق قائمة الأسماء مباشرة"
          cta="استيراد الآن"
          onClick={() => onGo('attendees')}
          accent="bg-indigo-50"
        />
        <ActionCard
          icon={<Palette className="w-6 h-6 text-violet-600" />}
          title="تصميم الشهادة"
          desc="اختر قالباً جاهزاً أو صمّم قالبك الخاص بالكامل"
          cta="فتح المصمّم"
          onClick={() => onGo('design')}
          accent="bg-violet-50"
        />
        <ActionCard
          icon={<ShieldCheck className="w-6 h-6 text-emerald-600" />}
          title="التحقق من شهادة"
          desc="ابحث بالرقم المرجعي أو الاسم للتأكد من صحة الشهادة"
          cta="فتح البوابة"
          onClick={() => onGo('verify')}
          accent="bg-emerald-50"
        />
      </div>

      {/* Active template preview */}
      {activeTemplate && (
        <div className="cs-card p-5 flex items-center gap-4">
          <div
            className="w-24 h-16 rounded-xl flex-shrink-0 border border-slate-200 bg-cover bg-center shadow-sm"
            style={{
              backgroundImage: activeTemplate.backgroundImageUrl
                ? `url(${activeTemplate.backgroundImageUrl})`
                : activeTemplate.backgroundStyle,
            }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 font-medium">القالب النشط حالياً</p>
            <div className="flex items-center gap-2 mt-0.5">
              <Award className="w-4 h-4 text-indigo-500 flex-shrink-0" />
              <h4 className="font-bold text-slate-800 truncate">{activeTemplate.name}</h4>
              {activeTemplate.category && (
                <span className="cs-chip bg-indigo-50 text-indigo-600 flex-shrink-0">{activeTemplate.category}</span>
              )}
            </div>
          </div>
          <button onClick={() => onGo('design')} className="cs-btn cs-btn-soft flex-shrink-0">
            تعديل
          </button>
        </div>
      )}
    </div>
  );
}
