import React, { useState } from 'react';
import { Trash2, Search, AlertCircle, Hash, User } from 'lucide-react';
import { Attendee } from '../types';

interface AttendeeManagerProps {
  attendees: Attendee[];
  setAttendees: React.Dispatch<React.SetStateAction<Attendee[]>>;
  customConfirm: (msg: string) => Promise<boolean>;
  customAlert: (msg: string) => Promise<void>;
}

export default function AttendeeManager({ attendees, setAttendees, customConfirm, customAlert }: AttendeeManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const handleUpdateAttendee = (id: string, field: 'name' | 'email', value: string) => {
    setAttendees(prev =>
      prev.map(att => {
        if (att.id === id) {
          return { ...att, [field]: value };
        }
        return att;
      })
    );
  };

  const handleDeleteAttendee = (id: string) => {
    setAttendees(prev => prev.filter(att => att.id !== id));
  };

  const handleClearAll = async () => {
    if (await customConfirm('هل أنت متأكد من رغبتك في حذف جميع الحضور؟ لا يمكن التراجع عن هذا الإجراء.')) {
      setAttendees([]);
    }
  };

  // Filter attendees based on search query
  const filteredAttendees = attendees.filter(att =>
    att.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    att.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    att.serialNumber.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="cs-card p-6 space-y-6" id="attendee-manager-widget">
      {/* Header and Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
            <User className="w-5 h-5 text-indigo-600" />
            إدارة وتعديل قائمة المستلمين الحالية
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">بإمكانك التعديل المباشر على الأسماء، إضافة مستلمين جدد، أو البحث والحذف.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-xl border border-indigo-100">
            العدد الإجمالي: {attendees.length} مشترك
          </span>
          {attendees.length > 0 && (
            <button
              onClick={handleClearAll}
              className="text-red-500 hover:text-red-700 text-xs font-bold transition-all cursor-pointer px-2.5 py-1.5 hover:bg-red-50 rounded-lg"
            >
              حذف الكل
            </button>
          )}
        </div>
      </div>



      {/* Search and Table Container */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="البحث بالاسم، البريد أو الرمز التسلسلي..."
              className="cs-input pr-9 py-2 text-xs"
            />
          </div>
          <span className="text-[10px] text-slate-400 font-medium">💡 انقر على أي اسم أو بريد للتعديل الفوري</span>
        </div>

        {filteredAttendees.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 border border-slate-100 rounded-2xl text-slate-400 text-xs">
            <AlertCircle className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            {searchQuery ? 'لم يتم العثور على أي نتائج تطابق بحثك.' : 'قائمة الحضور فارغة حالياً.'}
          </div>
        ) : (
          <div className="border border-slate-100 rounded-2xl overflow-hidden max-h-[350px] overflow-y-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-center w-12"><Hash className="w-3 h-3 mx-auto" /></th>
                  <th className="p-3">الاسم الكامل (قابل للتعديل)</th>
                  <th className="p-3">البريد الإلكتروني (قابل للتعديل)</th>
                  <th className="p-3">الرمز التسلسلي (تلقائي)</th>
                  <th className="p-3 text-center w-12">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600 bg-white">
                {filteredAttendees.map((att, i) => (
                  <tr key={att.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-3 text-center font-mono text-slate-400">{i + 1}</td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={att.name}
                        onChange={e => handleUpdateAttendee(att.id, 'name', e.target.value)}
                        className="w-full bg-transparent border-0 hover:bg-slate-100 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded px-2 py-1 transition-all outline-none font-bold text-slate-800"
                        title="انقر لتعديل الاسم"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={att.email}
                        onChange={e => handleUpdateAttendee(att.id, 'email', e.target.value)}
                        className="w-full bg-transparent border-0 hover:bg-slate-100 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded px-2 py-1 transition-all outline-none font-mono text-left"
                        style={{ direction: 'ltr' }}
                        title="انقر لتعديل البريد"
                      />
                    </td>
                    <td className="p-3 font-mono text-slate-400 select-all">{att.serialNumber}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleDeleteAttendee(att.id)}
                        className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-all cursor-pointer"
                        title="حذف المستلم"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
