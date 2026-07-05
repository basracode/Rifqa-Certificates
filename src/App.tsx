import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { supabase } from './supabase';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import QRCode from 'qrcode';

// Helper function to convert oklch color string to rgb/rgba
function oklchToRgb(oklchStr: string): string {
  try {
    const content = oklchStr.replace(/oklch\(/i, '').replace(/\)$/, '').trim();
    const [colorPart, alphaPart] = content.split('/');
    const parts = colorPart.trim().split(/\s+/);
    if (parts.length < 3) return oklchStr;

    const [lStr, cStr, hStr] = parts;
    const L = lStr.endsWith('%') ? parseFloat(lStr) / 100 : parseFloat(lStr);
    const C = cStr.endsWith('%') ? parseFloat(cStr) / 100 : parseFloat(cStr);
    let H = hStr.endsWith('deg') ? parseFloat(hStr) : parseFloat(hStr);
    if (hStr.endsWith('rad')) {
      H = parseFloat(hStr) * (180 / Math.PI);
    } else if (hStr.endsWith('turn')) {
      H = parseFloat(hStr) * 360;
    }

    let alpha = 1;
    if (alphaPart) {
      const aStr = alphaPart.trim();
      alpha = aStr.endsWith('%') ? parseFloat(aStr) / 100 : parseFloat(aStr);
    }

    if (isNaN(L) || isNaN(C) || isNaN(H) || isNaN(alpha)) {
      return oklchStr;
    }

    // OKLCH to OKLab
    const hRad = (H * Math.PI) / 180;
    const a = C * Math.cos(hRad);
    const b = C * Math.sin(hRad);

    // OKLab to LMS
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

    // LMS to Linear sRGB
    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;

    // Linear sRGB to sRGB
    const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const bVal = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

    // Clamping and Gamma correction
    const f = (cVal: number) => {
      cVal = Math.max(0, Math.min(1, cVal)); // clamp to [0, 1]
      return cVal <= 0.0031308 ? 12.92 * cVal : 1.055 * Math.pow(cVal, 1 / 2.4) - 0.055;
    };

    const R = Math.round(f(r) * 255);
    const G = Math.round(f(g) * 255);
    const B = Math.round(f(bVal) * 255);

    if (alpha === 1) {
      return `rgb(${R}, ${G}, ${B})`;
    } else {
      return `rgba(${R}, ${G}, ${B}, ${alpha})`;
    }
  } catch (e) {
    return oklchStr;
  }
}

// Helper to replace all oklch colors inside any string property value
function replaceOklchColors(value: string): string {
  if (!value || typeof value !== 'string') return value;
  if (!value.includes('oklch')) return value;

  return value.replace(/oklch\([^)]+\)/gi, (match) => {
    return oklchToRgb(match);
  });
}

// Wrapper around html2canvas to safely intercept and patch oklch colors
async function safeHtml2Canvas(element: HTMLElement, options?: Parameters<typeof html2canvas>[1]): Promise<HTMLCanvasElement> {
  const originalGetComputedStyle = window.getComputedStyle;

  window.getComputedStyle = function (elt: Element, pseudoElt?: string | null): CSSStyleDeclaration {
    const style = originalGetComputedStyle(elt, pseudoElt);
    
    return new Proxy(style, {
      get(target, prop) {
        if (prop === 'getPropertyValue') {
          return function (propertyName: string) {
            const val = target.getPropertyValue(propertyName);
            return replaceOklchColors(val);
          };
        }
        
        const val = target[prop as any];
        if (typeof val === 'function') {
          return (val as any).bind(target);
        }
        if (typeof val === 'string') {
          return replaceOklchColors(val);
        }
        return val;
      }
    });
  };

  try {
    return await html2canvas(element, options);
  } finally {
    window.getComputedStyle = originalGetComputedStyle;
  }
}

import { 
  Attendee, 
  CertificateElement, 
  Workshop, 
  PredefinedTemplate 
} from './types';
import { parseTextToHtml } from './utils';
import { PREDEFINED_TEMPLATES } from './data';

import ExcelImporter from './components/ExcelImporter';
import CustomSelect from './components/CustomSelect';
import CanvasDesigner from './components/CanvasDesigner';
import SignaturePad from './components/SignaturePad';
import VerificationPortal from './components/VerificationPortal';
import Dashboard from './components/Dashboard';
import FileNameDialog from './components/FileNameDialog';
import { useToast } from './components/Toast';

import {
  Award,
  Users,
  ShieldCheck,
  Sparkles,
  FileDown,
  Download,
  FileImage,
  HelpCircle,
  Clock,
  CheckCircle,
  Eye,
  Settings,
  AlertCircle,
  Upload,
  LayoutDashboard,
  X,
  Sliders,
  Check,
  Info,
  RefreshCw
} from 'lucide-react';

interface DialogConfig {
  isOpen: boolean;
  type: 'alert' | 'confirm' | 'prompt';
  message: string;
  defaultValue?: string;
  resolve?: (value: any) => void;
}

type TabId = 'dashboard' | 'design' | 'attendees' | 'verify';

const NAV_TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'نظرة عامة', icon: LayoutDashboard },
  { id: 'attendees', label: 'الحضور', icon: Users },
  { id: 'design', label: 'التصميم', icon: Settings },
  { id: 'verify', label: 'التحقق', icon: ShieldCheck },
];

export default function App() {
  const toast = useToast();
  const [currentStep, setCurrentStep] = useState<number>(0); // 0: Welcome, 1: Import, 2: Design, 3: Export, 4: Verify
  const [showWizard, setShowWizard] = useState(false);
  const [eventType, setEventType] = useState<'course' | 'workshop'>('workshop');
  const [autoOpenUpload, setAutoOpenUpload] = useState(false);
  const [excelAutoOpenUpload, setExcelAutoOpenUpload] = useState(false);
  const [verifyQuery, setVerifyQuery] = useState<string>('');

  // Custom Dialog Modal State
  const [dialogConfig, setDialogConfig] = useState<DialogConfig>({
    isOpen: false,
    type: 'alert',
    message: '',
    defaultValue: '',
  });
  const [promptValue, setPromptValue] = useState('');

  // File Name Dialog State for ZIP export
  const [fileNameDialogOpen, setFileNameDialogOpen] = useState(false);
  const [fileNameDialogDefault, setFileNameDialogDefault] = useState('');
  const [fileNameDialogResolve, setFileNameDialogResolve] = useState<((fileName: string) => void) | null>(null);

  const customAlert = (message: string): Promise<void> => {
    return new Promise((resolve) => {
      setDialogConfig({
        isOpen: true,
        type: 'alert',
        message,
        resolve: () => {
          setDialogConfig(prev => ({ ...prev, isOpen: false }));
          resolve();
        }
      });
    });
  };

  const customConfirm = (message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialogConfig({
        isOpen: true,
        type: 'confirm',
        message,
        resolve: (value: boolean) => {
          setDialogConfig(prev => ({ ...prev, isOpen: false }));
          resolve(value);
        }
      });
    });
  };

  const customPrompt = (message: string, defaultValue = ''): Promise<string | null> => {
    setPromptValue(defaultValue);
    return new Promise((resolve) => {
      setDialogConfig({
        isOpen: true,
        type: 'prompt',
        message,
        defaultValue,
        resolve: (value: string | null) => {
          setDialogConfig(prev => ({ ...prev, isOpen: false }));
          resolve(value);
        }
      });
    });
  };

  // Helper function to show the custom file name dialog for ZIP export
  const showFileNameDialog = (defaultValue: string): Promise<string> => {
    setFileNameDialogDefault(defaultValue);
    return new Promise((resolve) => {
      setFileNameDialogResolve(() => resolve);
      setFileNameDialogOpen(true);
    });
  };

  // Workshop basic info state
  const [workshop, setWorkshop] = useState<Workshop>({
    id: 'ws-100',
    title: 'Data Science & Artificial Intelligence Bootcamp',
    instructor: 'Dr. Faisal Al-Hashimi',
    dateArabic: 'May 25, 2026',
    hours: 18,
    description: 'A comprehensive standard training bootcamp held by the Digital Knowledge & Excellence Academy.',
    serialPrefix: 'KNOW-AI-2026',
    organizationName: 'Digital Knowledge Academy'
  });

  // Attendees list (either imported/demo or custom added)
  const [attendees, setAttendees] = useState<Attendee[]>([]);

  // Designer Canvas settings
  const [elements, setElements] = useState<CertificateElement[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('corporate_gold');
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string>('');
  const [backgroundStyle, setBackgroundStyle] = useState<string>('');
  const [borderColor, setBorderColor] = useState<string>('');
  const [templates, setTemplates] = useState<PredefinedTemplate[]>([]);
  
  // Extra elements like Live signatures
  const [signaturePadOpen, setSignaturePadOpen] = useState(false);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);

  // Selected attendee to show in active preview
  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(null);

  // Bulk Generation progress tracking
  const [isBulkExporting, setIsBulkExporting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [exportType, setExportType] = useState<'pdf' | 'png'>('pdf');
  const [isUrlActive, setIsUrlActive] = useState(false);

  // Auto-run status for background sync (direct page-load invocation)
  const [autoStatus, setAutoStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [autoProgress, setAutoProgress] = useState({ current: 0, total: 0 });
  const hasAutoRun = useRef(false);

  // PDF quality and size settings state
  const [pdfScale, setPdfScale] = useState<number>(2.0); // Default to High (2.0x) instead of 3.0x for balanced size
  const [pdfQuality, setPdfQuality] = useState<number>(0.92); // Default JPEG quality
  const [qualityPreset, setQualityPreset] = useState<string>('high'); // 'low' | 'medium' | 'high' | 'ultra' | 'custom'
  const [estimatedPdfSize, setEstimatedPdfSize] = useState<number | null>(null);
  const [isEstimatingSize, setIsEstimatingSize] = useState<boolean>(false);

  // Hidden off-screen DOM element for html2canvas high-definition rendering
  const hiddenRenderRef = useRef<HTMLDivElement>(null);

  // Load templates and restore state from URL deep link query parameters on mount
  useEffect(() => {
    const mergeAndSetTemplates = (
      publicTemplates: PredefinedTemplate[], 
      diskTemplates: PredefinedTemplate[] = [],
      supabaseTemplates: PredefinedTemplate[] = []
    ) => {
      const saved = localStorage.getItem('validated_cert_templates');
      let customTemplates: PredefinedTemplate[] = [];
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            customTemplates = parsed.filter(t => t.id.startsWith('custom_'));
          }
        } catch (e) { /* ignore */ }
      }
      
      // Get deleted templates list from localStorage
      let deletedList: string[] = [];
      try {
        const parsed = JSON.parse(localStorage.getItem('deleted_cert_templates') || '[]');
        if (Array.isArray(parsed)) {
          deletedList = parsed;
        }
      } catch (e) { /* ignore */ }
      
      const allCustom = [...customTemplates].filter(t => !deletedList.includes(t.id));
      const filteredDiskTemplates = diskTemplates.filter(t => !deletedList.includes(t.id));
      const filteredSupabaseTemplates = supabaseTemplates.filter(t => !deletedList.includes(t.id));

      const templatesMap = new Map<string, PredefinedTemplate>();

      // 1. Add predefined templates (lowest priority)
      PREDEFINED_TEMPLATES.forEach(t => templatesMap.set(t.id, t));

      // 2. Add public templates (templates.json)
      publicTemplates.forEach(t => templatesMap.set(t.id, t));

      // 3. Add disk templates (Vite local dev mode templates)
      filteredDiskTemplates.forEach(t => templatesMap.set(t.id, t));

      // 4. Add localStorage custom templates (prioritizes local changes)
      allCustom.forEach(t => templatesMap.set(t.id, t));

      // 5. Add Supabase templates (highest priority for database synchronization)
      filteredSupabaseTemplates.forEach(t => templatesMap.set(t.id, t));

      const loadedTemplates = Array.from(templatesMap.values());
      setTemplates(loadedTemplates);
      return loadedTemplates;
    };

    const fetchSupabaseTemplates = async () => {
      try {
        const { data, error } = await supabase
          .from('certificate_templates')
          .select('*')
          .order('created_at', { ascending: true });
        
        if (error) throw error;
        if (data) {
          return data.map((t: any) => ({
            id: t.id,
            name: t.name,
            category: t.category || undefined,
            thumbnailClass: t.background_image_url ? 'bg-slate-50' : 'bg-stone-50',
            backgroundStyle: t.background_style || '',
            borderColor: t.border_color || 'transparent',
            backgroundImageUrl: t.background_image_url || undefined,
            elements: t.elements
          }));
        }
      } catch (e) {
        console.warn('Failed to load templates from Supabase, falling back to local files.', e);
      }
      return [];
    };

    // Load templates.json, list-templates and Supabase templates in parallel
    Promise.all([
      fetch('/templates.json').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/list-templates').then(r => r.ok ? r.json() : []).catch(() => []),
      fetchSupabaseTemplates()
    ])
    .then(([publicTemplates, diskTemplates, supabaseTemplates]) => {
      const valPublic = Array.isArray(publicTemplates) ? publicTemplates.filter((t: any) => t.id && t.name && Array.isArray(t.elements)) : [];
      const valDisk = Array.isArray(diskTemplates) ? diskTemplates.filter((t: any) => t.id && t.name && Array.isArray(t.elements)) : [];
      const loadedTemplates = mergeAndSetTemplates(valPublic, valDisk, supabaseTemplates);
      initFromUrl(loadedTemplates);
    });
  }, []);

  // Trigger auto-upload when attendees and template are fully loaded
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const autoParam = params.get('auto') === 'true';
    if (autoParam && attendees.length > 0 && selectedTemplateId && !hasAutoRun.current) {
      hasAutoRun.current = true;
      runAutoUpload();
    }
  }, [attendees, selectedTemplateId]);

  const runAutoUpload = async () => {
    setAutoStatus('running');
    setAutoProgress({ current: 0, total: attendees.length });

    try {
      for (let i = 0; i < attendees.length; i++) {
        const attendee = attendees[i];
        setAutoProgress({ current: i + 1, total: attendees.length });

        // Render the single certificate canvas
        const canvas = await renderSingleCertificate(attendee);
        
        // Auto-upload and link to Supabase if ID is a valid database UUID
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attendee.id);
        if (isUUID) {
          const pdfForUpload = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4',
            compress: true
          });
          const jpegData = canvas.toDataURL('image/jpeg', pdfQuality);
          pdfForUpload.addImage(jpegData, 'JPEG', 0, 0, 297, 210, undefined, 'NONE');
          const pdfBlobToUpload = pdfForUpload.output('blob');

          const cleanName = attendee.name.replace(/[^a-zA-Z0-9]/g, '_') || 'cert';
          const fileName = `${attendee.id}_${cleanName}.pdf`;
          const file = new File([pdfBlobToUpload], fileName, { type: 'application/pdf' });

          const bucketName = 'cv-files';
          const storagePath = `course-certificates/${fileName}`;

          // Upload the file
          const { error: uploadError } = await supabase.storage
            .from(bucketName)
            .upload(storagePath, file, { contentType: 'application/pdf', cacheControl: '3600', upsert: true });

          if (uploadError) throw uploadError;

          // Get public URL
          const { data: pubData } = supabase.storage.from(bucketName).getPublicUrl(storagePath);
          const publicUrl = pubData?.publicUrl;

          if (publicUrl) {
            // Update database record in course_registrations
            const { error: dbError } = await supabase
              .from('course_registrations')
              .update({
                certificate_url: publicUrl,
                status: 'approved'
              })
              .eq('id', attendee.id);

            if (dbError) throw dbError;
          }
        }

        // small delay to prevent blocking the UI
        await new Promise(r => setTimeout(r, 60));
      }

      // Success
      confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.5 }
      });
      setAutoStatus('success');
    } catch (err) {
      console.error('Auto upload failed:', err);
      setAutoStatus('error');
    }
  };

  const initFromUrl = (loadedTemplates: PredefinedTemplate[]) => {
    // Deep linking parse on mount
    const params = new URLSearchParams(window.location.search);

    // QR verification deep-link: ?verify=SERIAL → open verify tab + auto-search
    const verifyParam = params.get('verify');
    if (verifyParam) {
      const safe = verifyParam.replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 100);
      setVerifyQuery(safe);
      setCurrentStep(4); // Step 4 is verification!
      setIsUrlActive(true);
      return;
    }

    // Deep-link integration: ?import_url=URL
    const importUrl = params.get('import_url');
    if (importUrl) {
      setIsUrlActive(true);
      fetch(importUrl)
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch');
          return res.json();
        })
        .then(data => {
          if (Array.isArray(data)) {
            const compiled = data.map((item: any, index: number) => {
              const prefix = workshop.serialPrefix || 'CERT';
              const timestamp = Date.now().toString().slice(-4);
              const order = (index + 1).toString().padStart(3, '0');
              const randomHex = Math.floor(1000 + Math.random() * 9000).toString(16).toUpperCase().slice(-3);
              const serial = `${prefix}-${timestamp}-${order}${randomHex}`;
              
              const customFields: Record<string, string> = {};
              Object.keys(item).forEach(key => {
                if (key.toLowerCase() !== 'name' && key.toLowerCase() !== 'email') {
                  customFields[key] = String(item[key]);
                }
              });

              return {
                id: item.id || `url-import-${index}-${Date.now()}`,
                name: String(item.name || item.Name || '').trim(),
                email: String(item.email || item.Email || '').trim(),
                serialNumber: serial,
                certificateId: serial,
                customFields
              };
            }).filter(att => att.name.length > 0);

            if (compiled.length > 0) {
              setAttendees(compiled);
              toast.success(`تم استيراد ${compiled.length} اسم بنجاح من الرابط الخارجي!`);
              setCurrentStep(2);
            }
          }
        })
        .catch(err => {
          console.error(err);
          toast.error('فشل استيراد الأسماء من الرابط الخارجي. يرجى التحقق من قيود CORS.');
        });
    }

    // Deep-link integration: ?import_data=BASE64_JSON
    const importDataParam = params.get('import_data');
    if (importDataParam) {
      setIsUrlActive(true);
      try {
        const decoded = decodeURIComponent(escape(atob(importDataParam)));
        const parsed = JSON.parse(decoded);
        if (Array.isArray(parsed)) {
          const compiled = parsed.map((item: any, index: number) => {
            const prefix = workshop.serialPrefix || 'CERT';
            const timestamp = Date.now().toString().slice(-4);
            const order = (index + 1).toString().padStart(3, '0');
            const randomHex = Math.floor(1000 + Math.random() * 9000).toString(16).toUpperCase().slice(-3);
            const serial = `${prefix}-${timestamp}-${order}${randomHex}`;
            
            const customFields: Record<string, string> = {};
            Object.keys(item).forEach(key => {
              if (key.toLowerCase() !== 'name' && key.toLowerCase() !== 'email') {
                customFields[key] = String(item[key]);
              }
            });

            return {
              id: item.id || `data-import-${index}-${Date.now()}`,
              name: String(item.name || item.Name || '').trim(),
              email: String(item.email || item.Email || '').trim(),
              serialNumber: serial,
              certificateId: serial,
              customFields
            };
          }).filter(att => att.name.length > 0);

          if (compiled.length > 0) {
            setAttendees(compiled);
            toast.success(`تم استيراد ${compiled.length} اسم بنجاح!`);
            setCurrentStep(2);
          }
        }
      } catch (err) {
        console.error('Error parsing import_data:', err);
        toast.error('فشل فك تشفير البيانات المرسلة.');
      }
    }

    const hasParams = params.has('step') || params.has('type') || params.has('template');

    if (hasParams) {
      setIsUrlActive(true);

      const stepParam = params.get('step');
      if (stepParam) {
        const stepNum = parseInt(stepParam, 10);
        if (!isNaN(stepNum) && stepNum >= 0 && stepNum <= 4) {
          setCurrentStep(stepNum);
        }
      }

      const typeParam = params.get('type');
      if (typeParam && (typeParam === 'course' || typeParam === 'workshop')) {
        setEventType(typeParam);
      }

      const templateParam = params.get('template');
      if (templateParam) {
        const found = loadedTemplates.find(t => t.id === templateParam);
        if (found) {
          setSelectedTemplateId(found.id);
          setBorderColor(found.borderColor || 'transparent');
          setBackgroundStyle(found.backgroundStyle || '');
          setBackgroundImageUrl(found.backgroundImageUrl || '');
          setElements(found.elements.map((el, i) => ({
            ...el,
            id: `${el.type}-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
          })));
          return;
        }
      }
    }

    // Default template load if no deep linked template is found
    if (loadedTemplates.length > 0) {
      const defaultTmpl = loadedTemplates[0];
      setSelectedTemplateId(defaultTmpl.id);
      setBorderColor(defaultTmpl.borderColor || 'transparent');
      setBackgroundStyle(defaultTmpl.backgroundStyle || '');
      setBackgroundImageUrl(defaultTmpl.backgroundImageUrl || '');
      setElements(defaultTmpl.elements.map((el, i) => ({
        ...el,
        id: `${el.type}-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      })));
    } else {
      // Starting from 0 templates -> Initialize with a default blank canvas starter
      setSelectedTemplateId('');
      setBorderColor('transparent');
      setBackgroundStyle('linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)');
      setBackgroundImageUrl('');
      setElements([
        {
          id: `text-name-${Date.now()}`,
          type: 'text',
          x: 50,
          y: 45,
          width: 80,
          height: 8,
          content: '{name}',
          fontSize: 34,
          color: '#111827',
          fontFamily: 'Cairo',
          fontWeight: 'bold',
          fontStyle: 'normal',
          align: 'center',
          opacity: 100,
          letterSpacing: 0,
          isLocked: false
        }
      ]);
    }
  };

  // Sync templates changes helper
  const saveAndSetTemplates = (newTemplates: PredefinedTemplate[]) => {
    setTemplates(newTemplates);
    localStorage.setItem('validated_cert_templates', JSON.stringify(newTemplates));
  };

  // Sync state changes back to URL query parameters
  useEffect(() => {
    if (templates.length === 0 && !isUrlActive) return;

    const params = new URLSearchParams(window.location.search);
    params.set('step', String(currentStep));
    params.set('type', eventType);
    params.set('template', selectedTemplateId);

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, '', newUrl);
  }, [currentStep, eventType, selectedTemplateId, templates, isUrlActive]);

  // Update selected previews when attendees are loaded
  useEffect(() => {
    if (attendees.length > 0) {
      // Find if we already selected an attendee, preserve index if possible, otherwise default to first
      const index = selectedAttendee ? attendees.findIndex(a => a.id === selectedAttendee.id) : -1;
      if (index !== -1) {
        setSelectedAttendee(attendees[index]);
      } else {
        setSelectedAttendee(attendees[0]);
      }
    } else {
      setSelectedAttendee(null);
    }
  }, [attendees]);

  // Load a complete template configuration
  const loadTemplate = (tmpl: PredefinedTemplate) => {
    setSelectedTemplateId(tmpl.id);
    setBackgroundStyle(tmpl.backgroundStyle);
    setBorderColor(tmpl.borderColor);
    setBackgroundImageUrl(tmpl.backgroundImageUrl || '');

    // Assign truly unique ID to each element (random suffix prevents collision)
    const elementsWithIds: CertificateElement[] = tmpl.elements.map((el, index) => ({
      ...el,
      id: `${el.type}-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    }));

    setElements(elementsWithIds);
  };

  // Add current layout as custom template (both in localStorage and on local disk)
  const handleSaveAsNewTemplate = async (name: string, category = '') => {
    const elementsToSave = elements.map(({ id, ...el }) => el);
    const tempId = `custom_${Date.now()}`;
    const newTmpl: PredefinedTemplate = {
      id: tempId,
      name,
      category: category.trim() || undefined,
      thumbnailClass: backgroundImageUrl ? 'bg-slate-50' : 'bg-stone-50',
      backgroundStyle,
      borderColor,
      backgroundImageUrl: backgroundImageUrl || undefined,
      elements: elementsToSave
    };

    // Remove from deleted templates list if present
    try {
      const deletedList = JSON.parse(localStorage.getItem('deleted_cert_templates') || '[]');
      if (Array.isArray(deletedList)) {
        localStorage.setItem('deleted_cert_templates', JSON.stringify(deletedList.filter(id => id !== tempId)));
      }
    } catch (e) { /* ignore */ }

    const updated = [...templates, newTmpl];
    saveAndSetTemplates(updated);
    setSelectedTemplateId(newTmpl.id);
    toast.success(`تم حفظ القالب "${name}" في المتصفح`);

    // Save to Supabase
    try {
      const { error } = await supabase
        .from('certificate_templates')
        .upsert({
          id: tempId,
          name: name,
          category: category.trim() || null,
          background_style: backgroundStyle,
          border_color: borderColor,
          background_image_url: backgroundImageUrl || null,
          elements: elementsToSave
        });
      if (error) throw error;
      toast.success(`تم حفظ القالب "${name}" في قاعدة بيانات Supabase بنجاح`);
    } catch (err: any) {
      console.warn('Failed to save template to Supabase:', err);
    }

    // Post to local Vite server to save in the project files (fallback / development only)
    try {
      const res = await fetch('/api/save-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: tempId,
          name,
          category,
          backgroundStyle,
          borderColor,
          backgroundImageUrl,
          elements: elementsToSave
        })
      });
      if (res.ok) {
        const result = await res.json();
        toast.success(`تم حفظ القالب محلياً في مجلد المشروع: public/saved_templates/`);
        
        // Sync local state paths with newly saved files
        fetch('/api/list-templates')
          .then(r => r.ok ? r.json() : [])
          .then(diskTemplates => {
            const valDisk = Array.isArray(diskTemplates) ? diskTemplates.filter((t: any) => t.id && t.name && Array.isArray(t.elements)) : [];
            const savedOnDisk = valDisk.find(t => t.id === tempId);
            if (savedOnDisk) {
              setTemplates(prev => prev.map(t => t.id === tempId ? savedOnDisk : t));
              if (selectedTemplateId === tempId) {
                setBackgroundImageUrl(savedOnDisk.backgroundImageUrl || '');
              }
            }
          })
          .catch(() => {});
      }
    } catch (e) {
      console.warn('Vite dev server API not available or failed:', e);
    }
  };

  // Update current customized template elements and backgrounds
  const handleUpdateTemplate = async (id: string) => {
    const elementsToSave = elements.map(({ id, ...el }) => el);
    const activeTemplate = templates.find(t => t.id === id);
    const name = activeTemplate ? activeTemplate.name : 'قالب_معدل';
    const category = activeTemplate ? activeTemplate.category : undefined;

    const updated = templates.map(tmpl => {
      if (tmpl.id === id) {
        return {
          ...tmpl,
          backgroundStyle,
          borderColor,
          backgroundImageUrl: backgroundImageUrl || undefined,
          elements: elementsToSave
        };
      }
      return tmpl;
    });

    saveAndSetTemplates(updated);
    toast.success('تم تحديث القالب في المتصفح');

    // Update in Supabase
    try {
      const { error } = await supabase
        .from('certificate_templates')
        .upsert({
          id,
          name,
          category: category || null,
          background_style: backgroundStyle,
          border_color: borderColor,
          background_image_url: backgroundImageUrl || null,
          elements: elementsToSave
        });
      if (error) throw error;
      toast.success('تم تحديث القالب في قاعدة بيانات Supabase بنجاح');
    } catch (err: any) {
      console.warn('Failed to update template in Supabase:', err);
    }

    // Update on disk
    try {
      await fetch('/api/save-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name,
          category,
          backgroundStyle,
          borderColor,
          backgroundImageUrl,
          elements: elementsToSave
        })
      });
    } catch (e) {
      console.warn('Vite dev server API not available or failed:', e);
    }
  };

  // Remove template layout
  const handleDeleteTemplate = async (id: string) => {
    const updated = templates.filter(tmpl => tmpl.id !== id);
    saveAndSetTemplates(updated);

    // Save to deleted templates list in localStorage to prevent reload on refresh
    try {
      const deletedList = JSON.parse(localStorage.getItem('deleted_cert_templates') || '[]');
      if (Array.isArray(deletedList)) {
        if (!deletedList.includes(id)) {
          deletedList.push(id);
          localStorage.setItem('deleted_cert_templates', JSON.stringify(deletedList));
        }
      } else {
        localStorage.setItem('deleted_cert_templates', JSON.stringify([id]));
      }
    } catch (e) {
      localStorage.setItem('deleted_cert_templates', JSON.stringify([id]));
    }

    if (selectedTemplateId === id) {
      const defaultTmpl = updated.find(t => t.id === 'corporate_gold') || PREDEFINED_TEMPLATES[0];
      if (defaultTmpl) {
        loadTemplate(defaultTmpl);
      } else {
        setSelectedTemplateId('');
        setBackgroundImageUrl('');
        setElements([]);
      }
    }
    toast.success('تم حذف القالب بنجاح');

    // Delete from Supabase
    try {
      const { error } = await supabase
        .from('certificate_templates')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('تم حذف القالب من قاعدة بيانات Supabase بنجاح');
    } catch (err: any) {
      console.warn('Failed to delete template from Supabase:', err);
    }

    // Delete from disk
    try {
      const res = await fetch('/api/delete-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        const result = await res.json();
        if (result.deleted) {
          toast.success('تم مسح ملفات القالب من القرص الصلب');
        }
      }
    } catch (e) {
      console.warn('Vite dev server API not available or failed:', e);
    }
  };

  // Export the active template design configuration to a ZIP or JSON file with user naming
  const handleExportActiveTemplate = async () => {
    const currentTemplate = templates.find(t => t.id === selectedTemplateId);
    const exportName = currentTemplate ? currentTemplate.name : 'قالب_مخصص';
    
    // Show custom file name dialog for ZIP export
    const userFileName = await showFileNameDialog(exportName);
    const finalFileName = userFileName.trim() || exportName;
    const elementsToSave = elements.map(({ id, ...el }) => el);

    // If there is a background image, export as ZIP containing background and json
    if (backgroundImageUrl && (backgroundImageUrl.startsWith('data:') || backgroundImageUrl.startsWith('blob:') || backgroundImageUrl.startsWith('http') || backgroundImageUrl.startsWith('/'))) {
      try {
        const zip = new JSZip();
        
        let bgExt = 'png';
        let bgMime = 'image/png';
        let base64Data = '';

        if (backgroundImageUrl.startsWith('data:')) {
          const matchMime = backgroundImageUrl.match(/data:(.*?);base64,/);
          if (matchMime) {
            bgMime = matchMime[1];
            bgExt = bgMime.split('/')[1] || 'png';
          }
          base64Data = backgroundImageUrl.split(',')[1];
        } else {
          const response = await fetch(backgroundImageUrl);
          const blob = await response.blob();
          bgMime = blob.type;
          bgExt = bgMime.split('/')[1] || 'png';
          
          base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const res = reader.result as string;
              resolve(res.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }

        const bgFilename = `background.${bgExt}`;

        const templateConfig = {
          version: "1.0",
          name: finalFileName,
          backgroundStyle,
          borderColor,
          backgroundImageUrl: bgFilename, // Reference the file in zip
          elements: elementsToSave
        };

        zip.file("template.json", JSON.stringify(templateConfig, null, 2));
        zip.file(bgFilename, base64Data, { base64: true });

        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        const downloadAnchor = document.createElement('a');
        downloadAnchor.href = url;
        downloadAnchor.download = `${finalFileName.replace(/\s+/g, '_')}_template.zip`;
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        document.body.removeChild(downloadAnchor);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Failed to export template as ZIP:', err);
        exportAsJson(finalFileName, elementsToSave);
      }
    } else {
      exportAsJson(finalFileName, elementsToSave);
    }
  };

  const exportAsJson = (exportName: string, elementsToSave: any[]) => {
    const dataToExport = {
      version: "1.0",
      name: exportName,
      backgroundStyle,
      borderColor,
      backgroundImageUrl: backgroundImageUrl || undefined,
      elements: elementsToSave
    };

    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = url;
    downloadAnchor.download = `${exportName.replace(/\s+/g, '_')}_template.json`;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
    URL.revokeObjectURL(url);
  };

  // Export a specific template structure to a ZIP or JSON file with user naming
  const handleExportSpecificTemplate = async (tmpl: PredefinedTemplate) => {
    const exportName = tmpl.name;
    
    // Show custom file name dialog for ZIP export
    const userFileName = await showFileNameDialog(exportName);
    const finalFileName = userFileName.trim() || exportName;
    const elementsToSave = tmpl.elements;
    const bgUrl = tmpl.backgroundImageUrl;

    if (bgUrl && (bgUrl.startsWith('data:') || bgUrl.startsWith('blob:') || bgUrl.startsWith('http') || bgUrl.startsWith('/'))) {
      try {
        const zip = new JSZip();
        
        let bgExt = 'png';
        let bgMime = 'image/png';
        let base64Data = '';

        if (bgUrl.startsWith('data:')) {
          const matchMime = bgUrl.match(/data:(.*?);base64,/);
          if (matchMime) {
            bgMime = matchMime[1];
            bgExt = bgMime.split('/')[1] || 'png';
          }
          base64Data = bgUrl.split(',')[1];
        } else {
          const response = await fetch(bgUrl);
          const blob = await response.blob();
          bgMime = blob.type;
          bgExt = bgMime.split('/')[1] || 'png';
          
          base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const res = reader.result as string;
              resolve(res.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }

        const bgFilename = `background.${bgExt}`;

        const templateConfig = {
          version: "1.0",
          name: finalFileName,
          backgroundStyle: tmpl.backgroundStyle,
          borderColor: tmpl.borderColor,
          backgroundImageUrl: bgFilename,
          elements: elementsToSave
        };

        zip.file("template.json", JSON.stringify(templateConfig, null, 2));
        zip.file(bgFilename, base64Data, { base64: true });

        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        const downloadAnchor = document.createElement('a');
        downloadAnchor.href = url;
        downloadAnchor.download = `${finalFileName.replace(/\s+/g, '_')}_template.zip`;
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        document.body.removeChild(downloadAnchor);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Failed to export template as ZIP:', err);
        exportSpecificAsJson(tmpl, finalFileName);
      }
    } else {
      exportSpecificAsJson(tmpl, finalFileName);
    }
  };

  const exportSpecificAsJson = (tmpl: PredefinedTemplate, finalFileName: string) => {
    const dataToExport = {
      version: "1.0",
      name: finalFileName,
      backgroundStyle: tmpl.backgroundStyle,
      borderColor: tmpl.borderColor,
      backgroundImageUrl: tmpl.backgroundImageUrl || undefined,
      elements: tmpl.elements
    };

    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = url;
    downloadAnchor.download = `${finalFileName.replace(/\s+/g, '_')}_template.json`;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
    URL.revokeObjectURL(url);
  };

  const ALLOWED_ELEMENT_TYPES = ['text', 'image', 'qr', 'signature', 'badge'] as const;

  const validateTemplateData = (data: unknown): boolean => {
    if (!data || typeof data !== 'object') return false;
    const d = data as any;
    if (!Array.isArray(d.elements)) return false;
    if (d.elements.length > 60) return false;
    return d.elements.every((el: any) =>
      el && typeof el === 'object' &&
      ALLOWED_ELEMENT_TYPES.includes(el.type) &&
      typeof el.x === 'number' && el.x >= 0 && el.x <= 100 &&
      typeof el.y === 'number' && el.y >= 0 && el.y <= 100 &&
      typeof el.width === 'number' && el.width > 0 && el.width <= 100
    );
  };

  // Import a template JSON object and set it as the active template
  const handleImportTemplate = async (importedData: any) => {
    try {
      if (!validateTemplateData(importedData)) {
        toast.error('الملف ليس قالب شهادة صالح');
        return;
      }

      const name = importedData.name || `قالب مستورد ${Date.now()}`;
      const newTmpl: PredefinedTemplate = {
        id: `custom_${Date.now()}`,
        name,
        thumbnailClass: importedData.backgroundImageUrl ? 'bg-slate-50' : 'bg-stone-50',
        backgroundStyle: importedData.backgroundStyle || 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
        borderColor: importedData.borderColor || 'transparent',
        backgroundImageUrl: importedData.backgroundImageUrl || undefined,
        elements: importedData.elements
      };

      // Add to templates list
      const updated = [...templates, newTmpl];
      saveAndSetTemplates(updated);

      // Load it
      loadTemplate(newTmpl);

      await customAlert(`تم استيراد القالب "${name}" بنجاح وتطبيقه على منصة التصميم!`);
    } catch (error) {
      console.error(error);
      await customAlert('حدث خطأ أثناء معالجة ملف القالب.');
    }
  };

  // Import a template ZIP archive containing template.json and background image file
  const handleImportTemplateZip = async (file: File) => {
    try {
      const zip = await JSZip.loadAsync(file);
      
      const jsonFile = zip.file("template.json");
      if (!jsonFile) {
        toast.error('ملف ZIP غير صالح! يجب أن يحتوي على ملف template.json');
        return;
      }
      
      const jsonText = await jsonFile.async("string");
      const importedData = JSON.parse(jsonText);
      
      if (!validateTemplateData(importedData)) {
        toast.error('الملف ليس قالب شهادة صالح');
        return;
      }
      
      let resolvedBgUrl = importedData.backgroundImageUrl || '';
      if (resolvedBgUrl && !resolvedBgUrl.startsWith('data:') && !resolvedBgUrl.startsWith('http') && !resolvedBgUrl.startsWith('blob:')) {
        const imageFile = zip.file(resolvedBgUrl);
        if (imageFile) {
          let mimeType = 'image/png';
          const ext = resolvedBgUrl.split('.').pop()?.toLowerCase();
          if (ext === 'pdf') {
            mimeType = 'application/pdf';
          } else if (ext === 'jpg' || ext === 'jpeg') {
            mimeType = 'image/jpeg';
          } else if (ext === 'webp') {
            mimeType = 'image/webp';
          } else if (ext === 'svg') {
            mimeType = 'image/svg+xml';
          }
          
          const base64Data = await imageFile.async("base64");
          resolvedBgUrl = `data:${mimeType};base64,${base64Data}`;
        }
      }
      
      const name = importedData.name || `قالب مستورد ${Date.now()}`;
      const newTmpl: PredefinedTemplate = {
        id: `custom_${Date.now()}`,
        name,
        thumbnailClass: resolvedBgUrl ? 'bg-slate-50' : 'bg-stone-50',
        backgroundStyle: importedData.backgroundStyle || 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
        borderColor: importedData.borderColor || 'transparent',
        backgroundImageUrl: resolvedBgUrl || undefined,
        elements: importedData.elements
      };

      // Add to templates list
      const updated = [...templates, newTmpl];
      saveAndSetTemplates(updated);

      // Load it
      loadTemplate(newTmpl);

      await customAlert(`تم استيراد القالب "${name}" بنجاح وتطبيقه على منصة التصميم!`);
    } catch (error) {
      console.error(error);
      await customAlert('حدث خطأ أثناء فك وتطبيق ملف القالب المضغوط ZIP. تأكد من أن الملف سليم ويحتوي على template.json وصورة الخلفية.');
    }
  };

  // Automated custom empty dynamic template preset builder for uploaded templates
  const applyEmptyTemplateLayout = async () => {
    const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const emptyElements: CertificateElement[] = [
      {
        id: `text-${uid()}`,
        type: 'text',
        x: 50,
        y: 45,
        width: 80,
        height: 8,
        content: '{name}',
        fontSize: 34,
        color: '#111827',
        fontFamily: 'Playfair Display',
        fontWeight: 'bold',
        fontStyle: 'normal',
        align: 'center',
        opacity: 100,
        letterSpacing: 0,
        isLocked: false
      },
      {
        id: `text-${uid()}`,
        type: 'text',
        x: 50,
        y: 56,
        width: 80,
        height: 6,
        content: 'For successfully completing the program: "{workshop}"',
        fontSize: 14,
        color: '#4b5563',
        fontFamily: 'Inter',
        fontWeight: 'normal',
        fontStyle: 'normal',
        align: 'center',
        opacity: 100,
        letterSpacing: 0,
        isLocked: false
      },
      {
        id: `qr-${uid()}`,
        type: 'qr',
        x: 50,
        y: 78,
        width: 10,
        height: 14,
        content: '{qr}',
        fontSize: 12,
        color: '#000000',
        fontFamily: 'Inter',
        fontWeight: 'normal',
        fontStyle: 'normal',
        align: 'center',
        opacity: 100,
        letterSpacing: 0,
        isLocked: false
      },
      {
        id: `text-${uid()}`,
        type: 'text',
        x: 50,
        y: 91,
        width: 40,
        height: 4,
        content: 'Verification ID: {serial}',
        fontSize: 9,
        color: '#8c6e2e',
        fontFamily: 'JetBrains Mono',
        fontWeight: 'normal',
        fontStyle: 'normal',
        align: 'center',
        opacity: 100,
        letterSpacing: 0,
        isLocked: false
      }
    ];

    setElements(emptyElements);
    setBorderColor('transparent');
  };

  const handleAttendeesImported = (imported: Attendee[]) => {
    setAttendees(imported);
    if (imported.length > 0) {
      setSelectedAttendee(imported[0]);
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.8 }
      });
    } else {
      setSelectedAttendee(null);
    }
  };

  // Replace tags with current workshop and attendee values inside any template string
  const replacePlaceholderTags = (text: string, attendee: Attendee | null): string => {
    let output = text;
    const currentAttendee = attendee || selectedAttendee;

    const repName = currentAttendee ? currentAttendee.name : 'عبد الرحمن بن علي الهاشمي';
    const repSerial = currentAttendee ? currentAttendee.serialNumber : `${workshop.serialPrefix}-2026-X8Y`;

    output = output.replace(/{name}/g, repName);
    output = output.replace(/{workshop}/g, workshop.title || 'Dynamic Training Workshop');
    output = output.replace(/{instructor}/g, workshop.instructor || 'Lead Instructor');
    output = output.replace(/{date}/g, workshop.dateArabic || 'May 25, 2026');
    output = output.replace(/{hours}/g, String(workshop.hours || 10));
    output = output.replace(/{serial}/g, repSerial);
    output = output.replace(/{organization}/g, workshop.organizationName || 'Excellence Academy');

    // custom excel cols
    if (currentAttendee && currentAttendee.customFields) {
      Object.keys(currentAttendee.customFields).forEach(key => {
        const regex = new RegExp(`{${key}}`, 'g');
        output = output.replace(regex, currentAttendee.customFields?.[key] || '');
      });
    }

    return output;
  };

  // Core High Definition render process for one specified attendee
  const renderSingleCertificate = async (attendee: Attendee, overrideScale?: number): Promise<HTMLCanvasElement> => {
    const hiddenNode = hiddenRenderRef.current;
    if (!hiddenNode) throw new Error('Render node references not initialized');

    // Set attendee details manually on the hidden DOM node
    // First, clear everything inside hiddenNode
    hiddenNode.innerHTML = '';

    // Set background borders
    hiddenNode.style.width = '1414px';
    hiddenNode.style.height = '1000px';
    hiddenNode.style.position = 'relative';
    hiddenNode.style.overflow = 'hidden';
    hiddenNode.style.borderColor = borderColor;
    hiddenNode.style.borderWidth = borderColor !== 'transparent' ? '17px' : '0px';
    hiddenNode.style.borderStyle = 'solid';
    hiddenNode.style.backgroundImage = backgroundImageUrl ? `url(${backgroundImageUrl})` : backgroundStyle;
    hiddenNode.style.backgroundSize = 'cover';
    hiddenNode.style.backgroundPosition = 'center';

    // Populate all elements
    for (const el of elements) {
      const elDiv = document.createElement('div');
      elDiv.style.position = 'absolute';
      elDiv.style.left = `${el.x}%`;
      elDiv.style.top = `${el.y}%`;
      elDiv.style.width = `${el.width}%`;
      elDiv.style.transform = 'translate(-50%, -50%)';
      elDiv.style.opacity = String(el.opacity / 100);
      elDiv.style.zIndex = '10';

      if (el.type === 'text') {
        elDiv.dir = el.direction || 'auto';
        elDiv.style.fontFamily = el.fontFamily;
        // Scale font proportionally from designer canvas to 1414px width!
        // The designer preview width is roughly 800px. A 16px font is scaled to ~ 1.7x
        const scaledFontSize = Math.round(el.fontSize * 1.55);
        elDiv.style.fontSize = `${scaledFontSize}px`;
        elDiv.style.color = el.color;
        elDiv.style.fontWeight = el.fontWeight;
        elDiv.style.fontStyle = el.fontStyle;
        elDiv.style.textAlign = el.align;
        elDiv.style.letterSpacing = `${el.letterSpacing}px`;
        elDiv.style.lineHeight = '1.45';
        elDiv.style.whiteSpace = 'pre-wrap';
        // Apply justify text alignment if selected
        if (el.align === 'justify') {
          elDiv.style.textAlignLast = el.align;
        }
        elDiv.innerHTML = parseTextToHtml(replacePlaceholderTags(el.content, attendee));
      } 
      else if (el.type === 'qr') {
        const darkColor = el.color || '#000000';
        const lightColor = el.qrBgColor || '#ffffff';
        const margin = el.qrMargin !== undefined ? el.qrMargin : 1;

        const attendeeQrUrl = await QRCode.toDataURL(attendee.serialNumber, {
          margin: margin,
          width: 250, // High-res
          color: { dark: darkColor, light: lightColor }
        });

        const img = document.createElement('img');
        img.src = attendeeQrUrl;
        img.style.width = '100%';
        img.style.height = 'auto';
        img.style.aspectRatio = '1/1';
        img.style.background = lightColor;
        img.style.border = `1px solid ${lightColor === '#ffffff' ? '#e2e8f0' : lightColor}`;
        img.style.borderRadius = '6px';
        img.style.display = 'block';
        img.style.margin = '0 auto';
        elDiv.appendChild(img);
      } 
      else if (el.type === 'signature') {
        const img = document.createElement('img');
        img.src = el.content;
        img.style.width = '140px';
        img.style.maxHeight = '80px';
        img.style.display = 'block';
        img.style.margin = '0 auto';
        img.style.objectFit = 'contain';
        elDiv.appendChild(img);
      }
      else if (el.type === 'image') {
        const img = document.createElement('img');
        img.src = el.content;
        img.style.width = '100%';
        img.style.height = 'auto';
        img.style.display = 'block';
        img.style.margin = '0 auto';
        img.style.objectFit = 'contain';
        img.style.background = 'transparent';
        elDiv.appendChild(img);
      }
      else if (el.type === 'badge') {
        const svgNS = 'http://www.w3.org/2000/svg';
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'width:80px;height:80px;margin:0 auto';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.style.cssText = 'width:100%;height:100%';
        const defs = document.createElementNS(svgNS, 'defs');
        const grad = document.createElementNS(svgNS, 'linearGradient');
        grad.setAttribute('id', 'goldGradHidden');
        grad.setAttribute('x1', '0%'); grad.setAttribute('y1', '0%');
        grad.setAttribute('x2', '100%'); grad.setAttribute('y2', '100%');
        [['0%','#fef08a'],['50%','#eab308'],['100%','#ca8a04']].forEach(([offset, color]) => {
          const stop = document.createElementNS(svgNS, 'stop');
          stop.setAttribute('offset', offset);
          stop.setAttribute('stop-color', color);
          grad.appendChild(stop);
        });
        defs.appendChild(grad);
        svg.appendChild(defs);
        const shapes: [string, Record<string,string>][] = [
          ['polygon', { points: '50,95 62,80 78,85 80,68 95,62 88,48 95,34 80,28 78,11 62,16 50,1 38,16 22,11 20,28 5,34 12,48 5,62 20,68 22,85 38,80', fill: '#dfb750' }],
          ['polygon', { points: '50,91 60,77 75,81 77,65 91,60 84,48 91,36 77,31 75,15 60,19 50,6 40,19 25,15 23,31 9,36 16,48 9,60 23,65 25,81 40,77', fill: '#f5d061' }],
          ['circle', { cx: '50', cy: '48', r: '32', fill: '#9c721c' }],
          ['circle', { cx: '50', cy: '48', r: '28', fill: 'url(#goldGradHidden)' }],
          ['circle', { cx: '50', cy: '48', r: '24', fill: 'none', stroke: '#583f06', 'stroke-width': '1', 'stroke-dasharray': '2,2' }],
        ];
        shapes.forEach(([tag, attrs]) => {
          const el = document.createElementNS(svgNS, tag);
          Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
          svg.appendChild(el);
        });
        const txt = document.createElementNS(svgNS, 'text');
        txt.setAttribute('x', '50'); txt.setAttribute('y', '52');
        txt.setAttribute('fill', '#583f06'); txt.setAttribute('font-size', '8');
        txt.setAttribute('font-weight', 'bold'); txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('font-family', 'Cairo');
        txt.textContent = 'معتمد';
        svg.appendChild(txt);
        wrapper.appendChild(svg);
        elDiv.appendChild(wrapper);
      }

      hiddenNode.appendChild(elDiv);
    }

    // Give browsers a split millisecond for font rendering engines
    await new Promise(res => setTimeout(res, 350));

    const canvas = await safeHtml2Canvas(hiddenNode, {
      scale: overrideScale !== undefined ? overrideScale : pdfScale,
      useCORS: true,
      logging: false,
      allowTaint: false,
      backgroundColor: null
    });

    return canvas;
  };

  // Helper to get preview attendee
  const getPreviewAttendee = (): Attendee => {
    if (selectedAttendee) return selectedAttendee;
    if (attendees.length > 0) return attendees[0];
    return {
      id: 'dummy',
      name: 'عبد الرحمن بن علي الهاشمي',
      email: 'preview@example.com',
      serialNumber: `${workshop.serialPrefix}-2026-PREVIEW`,
      certificateId: 'dummy-cert-id'
    };
  };

  // Estimate the PDF size in memory
  const estimatePdfSize = async () => {
    setIsEstimatingSize(true);
    try {
      const attendee = getPreviewAttendee();
      // Render using the selected scale
      const canvas = await renderSingleCertificate(attendee, pdfScale);
      // Convert to JPEG with selected quality
      const imageUri = canvas.toDataURL('image/jpeg', pdfQuality);
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
        compress: true
      });
      pdf.addImage(imageUri, 'JPEG', 0, 0, 297, 210, undefined, 'NONE');
      const pdfBlob = pdf.output('blob');
      setEstimatedPdfSize(pdfBlob.size);
    } catch (err) {
      console.error('Error estimating PDF size:', err);
    } finally {
      setIsEstimatingSize(false);
    }
  };

  // Debounced effect to estimate size on setting or canvas changes
  useEffect(() => {
    if (currentStep !== 2 && currentStep !== 3) return;

    const timer = setTimeout(() => {
      estimatePdfSize();
    }, 600);

    return () => clearTimeout(timer);
  }, [pdfScale, pdfQuality, selectedAttendee, elements, backgroundImageUrl, backgroundStyle, borderColor, currentStep]);

  const applyPreset = (preset: string) => {
    setQualityPreset(preset);
    if (preset === 'low') {
      setPdfScale(1.0);
      setPdfQuality(0.70);
    } else if (preset === 'medium') {
      setPdfScale(1.5);
      setPdfQuality(0.85);
    } else if (preset === 'high') {
      setPdfScale(2.0);
      setPdfQuality(0.92);
    } else if (preset === 'ultra') {
      setPdfScale(3.0);
      setPdfQuality(0.98);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 بايت';
    const k = 1024;
    const dm = 1;
    const sizes = ['بايت', 'كيلوبايت', 'ميجابايت', 'جيجابايت'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Download certificate for ONE single person
  const downloadIndividual = async (attendee: Attendee, type: 'pdf' | 'png') => {
    try {
      const canvas = await renderSingleCertificate(attendee);
      const fileName = attendee.name.trim();

      if (type === 'png') {
        const imageUri = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `${fileName}.png`;
        link.href = imageUri;
        link.click();
      } else {
        const imageUri = canvas.toDataURL('image/jpeg', pdfQuality);
        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'mm',
          format: 'a4',
          compress: true
        });
        pdf.addImage(imageUri, 'JPEG', 0, 0, 297, 210, undefined, 'NONE');
        pdf.save(`${fileName}.pdf`);
      }
      toast.success('تم تنزيل الشهادة');
    } catch (err) {
      console.error(err);
      toast.error('فشل إصدار الشهادة — تأكد من إعداد القالب');
    }
  };

  // Mass Bulk Export ZIP logic runs in chunks
  const downloadAllAsZip = async (format: 'pdf' | 'png') => {
    if (attendees.length === 0) {
      toast.warning('استورد قائمة الحضور أولاً');
      return;
    }

    // Show file name dialog before starting export
    const defaultFileName = `شهادات_${workshop.title.replace(/\s+/g, '_') || 'الدورة'}`;
    const userFileName = await showFileNameDialog('');
    const finalFileName = userFileName.trim() || defaultFileName;

    setIsBulkExporting(true);
    setExportType(format);
    setBulkProgress({ current: 0, total: attendees.length });

    const zip = new JSZip();

    try {
      for (let i = 0; i < attendees.length; i++) {
        const attendee = attendees[i];
        setBulkProgress({ current: i + 1, total: attendees.length });

        const canvas = await renderSingleCertificate(attendee);
        const imgData = format === 'png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', pdfQuality);
        const fileBaseName = attendee.name.trim();

        let currentPdfBlob: Blob | null = null;

        if (format === 'png') {
          // split standard base64 raw data URL
          const base64Content = imgData.split(',')[1];
          zip.file(`${fileBaseName}.png`, base64Content, { base64: true });
        } else {
          const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4',
            compress: true
          });
          pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210, undefined, 'NONE');
          const pdfBlob = pdf.output('blob');
          currentPdfBlob = pdfBlob;
          zip.file(`${fileBaseName}.pdf`, pdfBlob);
        }

        // Auto-upload and link to Supabase if ID is a valid database UUID
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attendee.id);
        if (isUUID) {
          try {
            let pdfBlobToUpload = currentPdfBlob;
            if (!pdfBlobToUpload) {
              const pdfForUpload = new jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: 'a4',
                compress: true
              });
              const jpegData = canvas.toDataURL('image/jpeg', pdfQuality);
              pdfForUpload.addImage(jpegData, 'JPEG', 0, 0, 297, 210, undefined, 'NONE');
              pdfBlobToUpload = pdfForUpload.output('blob');
            }

            const cleanName = attendee.name.replace(/[^a-zA-Z0-9]/g, '_') || 'cert';
            const fileName = `${attendee.id}_${cleanName}.pdf`;
            const file = new File([pdfBlobToUpload], fileName, { type: 'application/pdf' });

            const bucketName = 'cv-files';
            const storagePath = `course-certificates/${fileName}`;

            // Upload the file
            const { error: uploadError } = await supabase.storage
              .from(bucketName)
              .upload(storagePath, file, { contentType: 'application/pdf', cacheControl: '3600', upsert: true });

            if (uploadError) throw uploadError;

            // Get public URL
            const { data: pubData } = supabase.storage.from(bucketName).getPublicUrl(storagePath);
            const publicUrl = pubData?.publicUrl;

            if (publicUrl) {
              // Update database record in course_registrations
              const { error: dbError } = await supabase
                .from('course_registrations')
                .update({
                  certificate_url: publicUrl,
                  status: 'approved'
                })
                .eq('id', attendee.id);

              if (dbError) throw dbError;
              console.log(`[Supabase] Auto-uploaded and linked certificate for ${attendee.name}`);
            }
          } catch (supErr) {
            console.error(`[Supabase] Auto-upload error for ${attendee.name}:`, supErr);
          }
        }

        // small delay to prevent blocking the UI
        await new Promise(r => setTimeout(r, 60));
      }

      // Compile Zip & trigger save
      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `${finalFileName.replace(/\s+/g, '_')}.zip`;
      link.click();

      // Victory celebration
      confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.5 }
      });
    } catch (err) {
      console.error(err);
      await customAlert('حدث خطأ أثناء تصدير الأرشيف المجمع.');
    } finally {
      setIsBulkExporting(false);
    }
  };

  const uploadOnlyToSupabase = async () => {
    if (attendees.length === 0) {
      toast.warning('استورد قائمة الحضور أولاً');
      return;
    }

    setIsBulkExporting(true);
    setExportType('pdf');
    setBulkProgress({ current: 0, total: attendees.length });

    let successCount = 0;

    try {
      for (let i = 0; i < attendees.length; i++) {
        const attendee = attendees[i];
        setBulkProgress({ current: i + 1, total: attendees.length });

        const canvas = await renderSingleCertificate(attendee);
        
        // Auto-upload and link to Supabase if ID is a valid database UUID
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attendee.id);
        if (isUUID) {
          try {
            const pdfForUpload = new jsPDF({
              orientation: 'landscape',
              unit: 'mm',
              format: 'a4',
              compress: true
            });
            const jpegData = canvas.toDataURL('image/jpeg', pdfQuality);
            pdfForUpload.addImage(jpegData, 'JPEG', 0, 0, 297, 210, undefined, 'NONE');
            const pdfBlobToUpload = pdfForUpload.output('blob');

            const cleanName = attendee.name.replace(/[^a-zA-Z0-9]/g, '_') || 'cert';
            const fileName = `${attendee.id}_${cleanName}.pdf`;
            const file = new File([pdfBlobToUpload], fileName, { type: 'application/pdf' });

            const bucketName = 'cv-files';
            const storagePath = `course-certificates/${fileName}`;

            // Upload the file
            const { error: uploadError } = await supabase.storage
              .from(bucketName)
              .upload(storagePath, file, { contentType: 'application/pdf', cacheControl: '3600', upsert: true });

            if (uploadError) throw uploadError;

            // Get public URL
            const { data: pubData } = supabase.storage.from(bucketName).getPublicUrl(storagePath);
            const publicUrl = pubData?.publicUrl;

            if (publicUrl) {
              // Update database record in course_registrations
              const { error: dbError } = await supabase
                .from('course_registrations')
                .update({
                  certificate_url: publicUrl,
                  status: 'approved'
                })
                .eq('id', attendee.id);

              if (dbError) throw dbError;
              successCount++;
            }
          } catch (supErr) {
            console.error(`[Supabase] Auto-upload error for ${attendee.name}:`, supErr);
          }
        }

        // small delay to prevent blocking the UI
        await new Promise(r => setTimeout(r, 60));
      }

      // Victory celebration
      confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.5 }
      });

      await customAlert(`تم إصدار ورفع ${successCount} شهادة بنجاح إلى حسابات الطلاب!`);
    } catch (err) {
      console.error(err);
      await customAlert('حدث خطأ أثناء الرفع التلقائي للشهادات.');
    } finally {
      setIsBulkExporting(false);
    }
  };

  if (autoStatus !== 'idle') {
    return (
      <div className="fixed inset-0 bg-slate-900 text-white flex items-center justify-center p-6 z-50 font-sans select-none" dir="rtl">
        <div className="bg-slate-800 rounded-[2rem] border border-slate-700/60 p-8 max-w-md w-full text-center space-y-6 shadow-2xl">
          {autoStatus === 'running' && (
            <>
              <div className="w-20 h-20 bg-indigo-500/10 text-indigo-400 rounded-3xl flex items-center justify-center mx-auto animate-pulse">
                <RefreshCw className="w-10 h-10 animate-spin" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold">جاري إصدار ورفع الشهادات للطلاب…</h3>
                <p className="text-sm text-slate-400">يرجى عدم إغلاق الصفحة حتى اكتمال العملية تلقائياً.</p>
              </div>
              <div className="text-5xl font-black text-indigo-400 font-mono">
                {Math.round((autoProgress.current / Math.max(1, autoProgress.total)) * 100)}%
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs text-slate-400">
                  <span>تم التجهيز</span>
                  <span>{autoProgress.current} من أصل {autoProgress.total}</span>
                </div>
                <div className="w-full bg-slate-700 h-3 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${(autoProgress.current / Math.max(1, autoProgress.total)) * 100}%` }}
                  />
                </div>
              </div>
            </>
          )}

          {autoStatus === 'success' && (
            <>
              <div className="w-20 h-20 bg-emerald-500/10 text-emerald-400 rounded-3xl flex items-center justify-center mx-auto scale-105 transition-all">
                <CheckCircle className="w-10 h-10 animate-bounce" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-emerald-400">تم إصدار ورفع الشهادات بنجاح!</h3>
                <p className="text-sm text-slate-400">تلقى جميع الطلاب شهاداتهم في حساباتهم الآن.</p>
              </div>
              <div className="pt-2">
                <p className="text-xs text-slate-500 bg-slate-800/50 p-3 rounded-xl border border-slate-700/30">
                  يمكنك إغلاق هذه الصفحة أو التبويب بأمان الآن.
                </p>
              </div>
            </>
          )}

          {autoStatus === 'error' && (
            <>
              <div className="w-20 h-20 bg-rose-500/10 text-rose-400 rounded-3xl flex items-center justify-center mx-auto">
                <AlertCircle className="w-10 h-10" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-rose-400">فشل رفع الشهادات تلقائياً</h3>
                <p className="text-sm text-slate-400">حدث خطأ أثناء الرفع.</p>
              </div>
              <button
                onClick={() => {
                  hasAutoRun.current = false;
                  runAutoUpload();
                }}
                className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-2xl transition-all active:scale-95 cursor-pointer"
              >
                إعادة المحاولة
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--cs-surface,#f5f8ff)] text-slate-800 font-sans" dir="rtl">
      
      {/* Dynamic Offscreen Renderer Container */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
          zIndex: -9999,
        }}
      >
        <div 
          ref={hiddenRenderRef} 
          style={{ 
            position: 'absolute', 
            left: 0, 
            top: 0,
            width: '1414px',
            height: '1000px',
            overflow: 'hidden',
            backgroundColor: '#ffffff'
          }}
          id="hidden-canvas-hd-node"
        />
      </div>

      {/* Navbar — Soft UI glass */}
      <header className="bg-white/80 backdrop-blur-xl sticky top-0 z-40 border-b border-slate-100 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-3">

          {/* Logo Brand */}
          <button
            onClick={() => setCurrentStep(0)}
            className="flex items-center gap-2.5 flex-shrink-0 cursor-pointer group"
          >
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-2 rounded-2xl shadow-[0_8px_20px_rgba(37,99,235,0.25)] flex items-center justify-center transition-transform group-hover:scale-105">
              <img src="/rifqa-logo.svg" alt="Rifqa" className="h-8 w-auto object-contain" />
            </div>
            <div className="hidden sm:block text-right">
              <h1 className="text-sm font-black text-slate-800 tracking-tight leading-tight">Certify Studio</h1>
              <p className="text-[10px] text-slate-400 leading-tight">صانع الشهادات الاحترافي</p>
            </div>
          </button>

          {/* Step navigation — Segmented wizard progress */}
          {currentStep > 0 && currentStep < 4 && (
            <div className="flex items-center gap-1.5 md:gap-3 text-xs font-bold bg-slate-100/80 p-1 rounded-2xl select-none">
              {[
                { step: 1, label: 'استيراد الحضور' },
                { step: 2, label: 'تصميم الشهادة' },
                { step: 3, label: 'تصدير الشهادات' },
              ].map((s, index, arr) => {
                const active = currentStep === s.step;
                const completed = currentStep > s.step;
                return (
                  <React.Fragment key={s.step}>
                    <button
                      onClick={() => {
                        // Allow clicking back/forward between steps if data exists
                        if (s.step === 1 || (s.step === 2 && attendees.length > 0) || (s.step === 3 && attendees.length > 0)) {
                          setCurrentStep(s.step);
                        }
                      }}
                      disabled={!completed && !active}
                      className={`flex items-center gap-1 py-1.5 px-2.5 rounded-xl transition-all outline-none ${
                        active
                          ? 'bg-white text-indigo-600 shadow-[0_2px_8px_rgba(15,23,42,0.08)]'
                          : completed
                          ? 'text-slate-600 hover:text-indigo-600 cursor-pointer'
                          : 'text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-black ${
                        active ? 'bg-indigo-600 text-white shadow-sm' : completed ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {s.step}
                      </span>
                      <span className="hidden md:inline">{s.label}</span>
                    </button>
                    {index < arr.length - 1 && (
                      <div className={`w-3 md:w-5 h-0.5 rounded-full ${completed ? 'bg-indigo-200' : 'bg-slate-200'}`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {/* Help / Home */}
          <button
            onClick={() => setCurrentStep(0)}
            title="الرجوع للوحة التحكم الرئيسية"
            aria-label="الرجوع للوحة التحكم الرئيسية"
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer flex-shrink-0"
          >
            <LayoutDashboard className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Bulk exporting loading modal overlay */}
      {isBulkExporting && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-dialog-backdrop">
          <div className="bg-white rounded-[1.75rem] p-8 max-w-md w-full shadow-[0_24px_60px_rgba(15,23,42,0.25)] space-y-5 text-center animate-dialog-content" dir="rtl">
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
              <Download className="w-7 h-7 animate-bounce" />
            </div>

            <div className="space-y-1.5">
              <h3 className="cs-section-title text-lg">جاري إصدار ورفع الشهادات…</h3>
              <p className="text-xs text-slate-500 font-bold text-indigo-600/80 animate-pulse">يتم توليد الشهادات ورفعها تلقائياً إلى حسابات المتدربين على Supabase.</p>
            </div>

            {/* Big percentage */}
            <div className="text-4xl font-black text-indigo-600 font-mono">
              {Math.round((bulkProgress.current / Math.max(1, bulkProgress.total)) * 100)}%
            </div>

            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs text-slate-500">
                <span className="font-bold text-indigo-600">{exportType === 'pdf' ? 'PDF' : 'PNG'}</span>
                <span>{bulkProgress.current} / {bulkProgress.total}</span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-l from-indigo-500 to-indigo-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${(bulkProgress.current / Math.max(1, bulkProgress.total)) * 100}%` }}
                />
              </div>
            </div>

            <div className="text-[10px] text-slate-400 bg-slate-50 p-2.5 rounded-xl">
              لا تُغلق هذه الصفحة حتى يكتمل تجهيز ملف الـ ZIP.
            </div>
          </div>
        </div>
      )}

      {/* Signature drawing Modal Pad */}
      {signaturePadOpen && (
        <SignaturePad
          onSaveSignature={(data) => {
            setSavedSignature(data);
          }}
          onClose={() => setSignaturePadOpen(false)}
          customAlert={customAlert}
        />
      )}

      {/* Main Core Body */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8" id="applet-main-body">

        {/* Step 0: Welcome Dashboard */}
        {currentStep === 0 && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="cs-card overflow-hidden relative p-8 md:p-12 text-center space-y-8 animate-dialog-content">
              <div className="absolute top-0 left-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
              
              <div className="space-y-3 relative">
                <div className="cs-chip bg-indigo-50 text-indigo-600 px-3.5 py-1.5 mx-auto">
                  <Sparkles className="w-4 h-4" />
                  لوحة التحكم
                </div>
                <h2 className="text-3xl font-black text-slate-800 tracking-tight">
                  ابدأ بإنشاء شهاداتك
                </h2>
                <p className="text-sm text-slate-500 max-w-xl mx-auto leading-relaxed">
                  استورد قائمة المشتركين، اختر أو صمّم قالب الشهادة، ثم صدّر الشهادات بصيغة PDF أو PNG.
                </p>
              </div>

              {/* Progress Steps Strip */}
              <div className="bg-slate-50/80 border border-slate-100 rounded-3xl p-6 max-w-2xl mx-auto">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6 md:gap-4">
                  {[
                    { n: 1, label: 'استيراد الحضور', desc: 'ارفع ملف Excel/CSV أو الصق الأسماء' },
                    { n: 2, label: 'تصميم الشهادة', desc: 'صمّم قالبك الخاص وأضف المتغيرات' },
                    { n: 3, label: 'تصدير الشهادات', desc: 'حمّل الشهادات مجمعة كـ ZIP أو PDF' },
                  ].map((s, i) => (
                    <React.Fragment key={s.n}>
                      <div className="flex items-center gap-3 text-right md:flex-col md:text-center md:flex-1">
                        <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black bg-white border border-slate-200 text-slate-500 shadow-sm flex-shrink-0">
                          {s.n}
                        </span>
                        <div>
                          <h4 className="font-bold text-slate-800 text-xs">{s.label}</h4>
                          <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{s.desc}</p>
                        </div>
                      </div>
                      {i < 2 && (
                        <div className="hidden md:block flex-1 h-0.5 bg-slate-200" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setCurrentStep(1)}
                className="cs-btn cs-btn-primary text-sm px-8 py-3.5 text-base rounded-2xl mx-auto flex items-center gap-2 shadow-lg"
              >
                <Upload className="w-4 h-4" />
                ابدأ الآن
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Attendees Import */}
        <div 
          className="max-w-4xl mx-auto space-y-6"
          style={{ display: currentStep === 1 ? 'block' : 'none' }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="cs-section-title text-lg">الخطوة 1: استيراد الحضور والمستلمين</h3>
              <p className="text-xs text-slate-400 mt-0.5">ارفع ملف البيانات وحدد عمود الاسم لكي نعتمد البيانات تلقائياً.</p>
            </div>
            <button
              onClick={() => setCurrentStep(0)}
              className="px-4 py-2 bg-slate-50 border border-slate-100 hover:bg-slate-100 text-slate-500 text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              رجوع للرئيسية
            </button>
          </div>

          {/* Compact Serial Prefix row */}
          <div className="cs-card px-5 py-3.5 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-slate-600 flex-shrink-0">
              <Award className="w-4 h-4 text-indigo-500" />
              <span className="text-sm font-bold">بادئة الرقم التسلسلي</span>
              <span className="cs-chip bg-slate-100 text-slate-400">اختياري</span>
            </div>
            <input
              type="text"
              value={workshop.serialPrefix}
              onChange={(e) => setWorkshop(prev => ({ ...prev, serialPrefix: e.target.value.slice(0, 50) }))}
              placeholder="CERT-2026 أو اتركه فارغاً"
              className="cs-input flex-1 min-w-[200px] py-1.5 font-mono"
              style={{ direction: 'ltr' }}
              title="اختياري — إذا تُرك فارغاً تُستخدم CERT كبادئة افتراضية"
            />
            <span className="text-[11px] text-slate-400">يُدمج مع QR تلقائياً</span>
          </div>

          {/* Importer */}
          <ExcelImporter
            serialPrefix={workshop.serialPrefix}
            onAttendeesImported={handleAttendeesImported}
            customAlert={customAlert}
            autoOpenUpload={excelAutoOpenUpload}
            onUploadTriggered={() => setExcelAutoOpenUpload(false)}
          />

          {attendees.length > 0 && (
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setCurrentStep(2)}
                className="cs-btn cs-btn-primary px-6 py-3 rounded-xl shadow-md"
              >
                انتقال لتصميم القالب (الخطوة التالية)
              </button>
            </div>
          )}
        </div>

        {/* Step 2: Templates & Design */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
              <div>
                <h3 className="cs-section-title text-base">الخطوة 2: تصميم قالب الشهادة</h3>
                <p className="text-xs text-slate-400 mt-0.5">اختر أو أنشئ قالباً للشهادة، وعدّل النصوص والمواضع كما ترغب.</p>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="px-4 py-2 bg-slate-50 border border-slate-100 hover:bg-slate-100 text-slate-500 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  السابق: تعديل الأسماء
                </button>
                <button
                  onClick={() => setCurrentStep(3)}
                  className="cs-btn cs-btn-primary px-5 py-2.5 rounded-xl text-xs font-bold shadow-sm"
                >
                  إنشاء وتصدير الشهادات
                </button>
              </div>
            </div>

            {/* Live preview attendee switcher */}
            {attendees.length > 0 && (
              <div className="cs-card p-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-emerald-100 bg-emerald-50/40">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-white rounded-lg shadow-sm flex-shrink-0">
                    <Eye className="w-4 h-4 text-emerald-600" />
                  </div>
                  <p className="text-xs text-slate-600 font-medium">معاينة حية للشهادة باسم المشترك المختار:</p>
                </div>
                <CustomSelect
                  value={selectedAttendee ? selectedAttendee.id : ''}
                  onChange={(val) => {
                    const matched = attendees.find(a => a.id === val);
                    if (matched) setSelectedAttendee(matched);
                  }}
                  options={attendees.map(a => ({ value: a.id, label: a.name }))}
                  placeholder="اختر مشتركاً للمعاينة..."
                  className="w-auto min-w-[200px]"
                  id="select-preview-attendee"
                />
              </div>
            )}

            {/* Canvas Designer */}
            <div className="space-y-3">
              <CanvasDesigner
                elements={elements}
                setElements={setElements}
                workshop={workshop}
                selectedAttendee={selectedAttendee}
                backgroundImageUrl={backgroundImageUrl}
                setBackgroundImageUrl={setBackgroundImageUrl}
                backgroundStyle={backgroundStyle}
                setBackgroundStyle={setBackgroundStyle}
                borderColor={borderColor}
                setBorderColor={setBorderColor}
                openSignaturePad={() => setSignaturePadOpen(true)}
                savedSignature={savedSignature}
                onSignatureAdded={() => setSavedSignature(null)}
                onApplyEmptyTemplateLayout={applyEmptyTemplateLayout}
                templates={templates}

                selectedTemplateId={selectedTemplateId}
                onSelectTemplate={(tmpl) => loadTemplate(tmpl)}
                onSaveAsNewTemplate={handleSaveAsNewTemplate}
                onUpdateTemplate={handleUpdateTemplate}
                onDeleteTemplate={handleDeleteTemplate}
                onExportActiveTemplate={handleExportActiveTemplate}
                onExportSpecificTemplate={handleExportSpecificTemplate}
                onImportTemplate={handleImportTemplate}
                onImportTemplateZip={handleImportTemplateZip}
                autoOpenUpload={autoOpenUpload}
                onUploadTriggered={() => setAutoOpenUpload(false)}
                customAlert={customAlert}
                customConfirm={customConfirm}
                customPrompt={customPrompt}
              />
            </div>

            {/* Fast single download trigger while designing */}
            {attendees.length > 0 && (
              <div className="cs-card p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <h4 className="cs-section-title text-sm">تحميل سريع للمعاينة</h4>
                    {estimatedPdfSize !== null && (
                      <button 
                        onClick={() => setCurrentStep(3)} 
                        className="text-[10px] font-extrabold bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full transition-all cursor-pointer flex items-center gap-1"
                        title="تعديل دقة وجودة الـ PDF"
                      >
                        <Sliders className="w-2.5 h-2.5" />
                        {isEstimatingSize ? 'جاري الحساب...' : `~ ${formatBytes(estimatedPdfSize)}`}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    جرّب تنزيل شهادة <span className="font-semibold text-slate-600">{selectedAttendee?.name}</span> للتأكد من المحاذاة والخطوط بـ {qualityPreset === 'custom' ? 'دقة مخصصة' : `دقة ${qualityPreset === 'high' ? 'عالية' : qualityPreset === 'ultra' ? 'فائقة' : qualityPreset === 'medium' ? 'متوسطة' : 'منخفضة'}`}.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => selectedAttendee && downloadIndividual(selectedAttendee, 'png')} className="cs-btn cs-btn-ghost px-4 py-2.5">
                    <FileImage className="w-3.5 h-3.5 text-emerald-500" />
                    PNG
                  </button>
                  <button onClick={() => selectedAttendee && downloadIndividual(selectedAttendee, 'pdf')} className="cs-btn cs-btn-primary px-4 py-2.5">
                    <FileDown className="w-3.5 h-3.5" />
                    PDF
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Export Certificates */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="cs-section-title text-lg">الخطوة 3: تصدير وإصدار الشهادات</h3>
                <p className="text-xs text-slate-400 mt-0.5">يمكنك تحميل جميع الشهادات دفعة واحدة كملف ZIP للصور أو ملفات PDF.</p>
              </div>
              <button
                onClick={() => setCurrentStep(2)}
                className="px-4 py-2 bg-slate-50 border border-slate-100 hover:bg-slate-100 text-slate-500 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                الرجوع للتعديل والتصميم
              </button>
            </div>

            {attendees.length === 0 ? (
              <div className="cs-card p-12 text-center space-y-4 animate-dialog-content">
                <p className="text-sm text-slate-500">لا يوجد متدربون مستوردون بعد. يرجى الرجوع للخطوة الأولى.</p>
                <button onClick={() => setCurrentStep(1)} className="cs-btn cs-btn-primary">استيراد الحضور</button>
              </div>
            ) : (
              <div className="space-y-6">

                {/* PDF Resolution & Quality Settings Card */}
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6 animate-dialog-content">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                        <Sliders className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-slate-800 text-sm">إعدادات جودة ودقة ملفات الـ PDF</h4>
                        <p className="text-xs text-slate-400 mt-0.5 font-medium">تحكّم في أبعاد وجودة ملفات الشهادات للتحكم في حجم الملف النهائي.</p>
                      </div>
                    </div>
                    
                    {/* Mode presets */}
                    <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/80 p-1 rounded-2xl select-none text-[11px] font-bold">
                      {[
                        { id: 'low', label: 'منخفضة (حجم صغير)' },
                        { id: 'medium', label: 'متوسطة' },
                        { id: 'high', label: 'عالية (موصى بها)' },
                        { id: 'ultra', label: 'فائقة (HD)' },
                        { id: 'custom', label: 'مخصص' }
                      ].map((preset) => {
                        const active = qualityPreset === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => applyPreset(preset.id)}
                            className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                              active
                                ? 'bg-white text-indigo-600 shadow-sm'
                                : 'text-slate-600 hover:text-indigo-600'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                    
                    {/* Left/Main Side: Options and Sliders */}
                    <div className="lg:col-span-8 space-y-5">
                      
                      {qualityPreset === 'custom' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 animate-dialog-content">
                          {/* Scale / Resolution Slider */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-bold text-slate-700 flex items-center gap-1">
                                دقة وضوح الرسم (Render Scale)
                              </span>
                              <span className="font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md font-bold">
                                {pdfScale.toFixed(2)}x
                              </span>
                            </div>
                            <input
                              type="range"
                              min="1.0"
                              max="3.0"
                              step="0.25"
                              value={pdfScale}
                              onChange={(e) => {
                                setPdfScale(parseFloat(e.target.value));
                                setQualityPreset('custom');
                              }}
                              className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                            <div className="flex justify-between text-[9px] text-slate-400">
                              <span>1.0x (منخفضة)</span>
                              <span>2.0x (عالية)</span>
                              <span>3.0x (فائقة)</span>
                            </div>
                          </div>

                          {/* Image compression / Quality Slider */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-bold text-slate-700 flex items-center gap-1">
                                جودة ضغط الصورة (JPEG Quality)
                              </span>
                              <span className="font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md font-bold">
                                {Math.round(pdfQuality * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0.50"
                              max="1.00"
                              step="0.05"
                              value={pdfQuality}
                              onChange={(e) => {
                                setPdfQuality(parseFloat(e.target.value));
                                setQualityPreset('custom');
                              }}
                              className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                            <div className="flex justify-between text-[9px] text-slate-400">
                              <span>50% (ضغط عالٍ)</span>
                              <span>80% (متوازن)</span>
                              <span>100% (أعلى جودة)</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-start gap-3">
                          <Info className="w-4.5 h-4.5 text-indigo-500 mt-0.5 flex-shrink-0" />
                          <div className="space-y-1">
                            <h5 className="text-xs font-extrabold text-slate-700">
                              {qualityPreset === 'low' && 'الدقة المنخفضة جداً نشطة حالياً'}
                              {qualityPreset === 'medium' && 'الدقة المتوسطة نشطة حالياً'}
                              {qualityPreset === 'high' && 'الدقة العالية نشطة حالياً (موصى بها)'}
                              {qualityPreset === 'ultra' && 'الدقة الفائقة نشطة حالياً'}
                            </h5>
                            <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
                              {qualityPreset === 'low' && 'تعتمد دقة رسم 1.0x وجودة ضغط 70%، مما يمنحك أصغر حجم ممكن للملفات ومناسب للإرسال السريع جداً.'}
                              {qualityPreset === 'medium' && 'تعتمد دقة رسم 1.5x وجودة ضغط 85%، وهي جودة ممتازة وسريعة في العرض مع حجم ملف متوازن.'}
                              {qualityPreset === 'high' && 'تعتمد دقة رسم 2.0x وجودة ضغط 92%، وهي الدقة المثالية التي ننصح بها لجميع الاستخدامات (شاشات وطباعة) لتوفير أداء متكامل وحجم معتدل.'}
                              {qualityPreset === 'ultra' && 'تعتمد دقة رسم 3.0x وجودة ضغط 98%، مناسبة للطباعة الضخمة والفاخرة فقط نظراً لأن حجم الملف سيكون كبيراً.'}
                            </p>
                          </div>
                        </div>
                      )}
                      
                    </div>

                    {/* Right Side: Estimated File Size Display */}
                    <div className="lg:col-span-4 bg-gradient-to-br from-indigo-50/50 to-slate-50/50 border border-indigo-100/50 rounded-2xl p-4 flex flex-col items-center justify-center text-center space-y-3 relative overflow-hidden min-h-[120px]">
                      
                      <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
                      
                      <span className="text-[10px] text-slate-400 font-extrabold block uppercase tracking-wider">
                        الحجم التقريبي للملف الواحد
                      </span>
                      
                      {isEstimatingSize ? (
                        <div className="flex flex-col items-center space-y-2 py-2">
                          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                          <span className="text-[11px] text-slate-500 font-bold">جاري تقدير الحجم...</span>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="text-2xl font-black text-indigo-600 font-sans tracking-tight">
                            ~ {estimatedPdfSize ? formatBytes(estimatedPdfSize) : '—'}
                          </div>
                          
                          {/* Suitability text and badge */}
                          {estimatedPdfSize && (
                            <div className="space-y-1">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                                estimatedPdfSize < 1024 * 1024
                                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                  : estimatedPdfSize < 4 * 1024 * 1024
                                  ? 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                                  : 'bg-amber-50 text-amber-600 border border-amber-100'
                              }`}>
                                {estimatedPdfSize < 1024 * 1024 ? 'حجم خفيف جداً' :
                                 estimatedPdfSize < 4 * 1024 * 1024 ? 'حجم متوازن ممتاز' :
                                 'حجم كبير'}
                              </span>
                              <p className="text-[9px] text-slate-400 leading-tight max-w-[180px] mx-auto font-medium">
                                {estimatedPdfSize < 1024 * 1024
                                  ? 'ممتاز للإرسال بالواتساب والبريد دون استهلاك باقة البيانات.'
                                  : estimatedPdfSize < 4 * 1024 * 1024
                                  ? 'دقة عالية مع حجم ملف معتدل ملائم للمشاركة الرقمية والطباعة.'
                                  : 'يفضل استخدامه للطباعة فقط. قد يواجه الحضور بطئاً في تحميله.'}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className="text-[9px] text-slate-400 font-mono font-medium">
                        الأبعاد: {Math.round(1414 * pdfScale)} × {Math.round(1000 * pdfScale)} بكسل
                      </div>
                    </div>

                  </div>
                </div>

                {/* Global Stats and Master Download Section */}
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                  
                  {/* Stats column */}
                  <div className="space-y-1 md:border-l border-slate-100">
                    <span className="text-xs text-slate-400 block font-sans">إجمالي مسارات التصدير:</span>
                    <h3 className="text-2xl font-black text-slate-800 font-sans">{attendees.length} منتسب مسجَّل</h3>
                    <p className="text-xs text-indigo-600 font-medium flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {eventType === 'course' ? 'الدورة الحالية' : 'الورشة الحالية'}: {workshop.title}
                    </p>
                  </div>

                  {/* Instructions column */}
                  <div className="space-y-1.5 md:border-l border-slate-100 bg-blue-50/50 dark:bg-blue-950/20 p-4 rounded-2xl border border-blue-100/50 dark:border-blue-900/30">
                    <h4 className="text-xs font-black text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                      الربط التلقائي بقاعدة البيانات (Supabase) نشط!
                    </h4>
                    <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed font-bold">
                      بمجرد الضغط على أزرار التصدير أدناه، سيقوم النظام تلقائياً بتوليد الشهادات، ورفعها لـ Supabase، وربطها مباشرة بحسابات الطلاب بموقع رفقة دون أي تدخل يدوي.
                    </p>
                  </div>

                  {/* Bulk download actions column */}
                  <div className="flex flex-col gap-2.5">
                    <button
                      onClick={() => uploadOnlyToSupabase()}
                      className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white text-xs font-black rounded-2xl flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg active:scale-95 cursor-pointer"
                      id="btn-supabase-direct-upload"
                    >
                      <Sparkles className="w-4 h-4 text-yellow-300 animate-pulse" />
                      إصدار ورفع الشهادات تلقائياً للطلاب (PDF)
                    </button>
                    <button
                      onClick={() => downloadAllAsZip('png')}
                      className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95 cursor-pointer"
                      id="btn-bulk-zip-png"
                    >
                      <FileImage className="w-4 h-4 text-emerald-400" />
                      تصدير وتحميل الكل كـ ZIP (صور PNG)
                    </button>
                    <button
                      onClick={() => downloadAllAsZip('pdf')}
                      className="w-full py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white text-xs font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
                      id="btn-bulk-zip-pdf"
                    >
                      <FileDown className="w-4 h-4 text-yellow-400" />
                      تصدير وتحميل الكل كـ ZIP (ملفات PDF)
                    </button>
                  </div>

                </div>

                {/* Highly Scaled Interactive Attendees List Table */}
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden animate-dialog-content">
                  <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-sm">تفاصيل وحالة إصدار مستندات المنتسبين</h4>
                      <p className="text-xs text-slate-400 mt-0.5">بإمكانك تصفحهم، معاينة شهادتهم أو تصديرها فردياً للمراجعة السريعة</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-right border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100/50 border-b border-slate-200 text-slate-500 font-bold uppercase">
                          <th className="p-4 text-center">التسلسل</th>
                          <th className="p-4">الاسم (الملف)</th>
                          <th className="p-4">البريد الإلكتروني</th>
                          <th className="p-4">الرمز المرجعي المشفر</th>
                          <th className="p-4 text-center">رابط تفتيش QR</th>
                          <th className="p-4 text-center">إجراءات إصدار فورية</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-600">
                        {attendees.map((att, i) => (
                          <tr key={att.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 text-center font-mono font-medium text-slate-400">{i + 1}</td>
                            
                            <td className="p-4 font-bold text-slate-800">
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                {att.name}
                              </div>
                            </td>

                            <td className="p-4 font-mono text-slate-500">{att.email || '— لا يوجد —'}</td>

                            <td className="p-4 font-mono text-xs text-indigo-600 font-semibold">{att.serialNumber}</td>
                            
                            <td className="p-4 text-center">
                              <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded-md font-sans">نشط وآمن</span>
                            </td>

                            <td className="p-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => setSelectedAttendee(att)}
                                  className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 rounded-lg transition-all"
                                  title="معاينة شهادته على الرسم"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => downloadIndividual(att, 'png')}
                                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all"
                                >
                                  <FileImage className="w-3 h-3 text-emerald-500" />
                                  تحميل PNG
                                </button>
                                <button
                                  onClick={() => downloadIndividual(att, 'pdf')}
                                  className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all"
                                >
                                  <FileDown className="w-3 h-3 text-indigo-600" />
                                  تحميل PDF
                                </button>
                              </div>
                            </td>
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

        {/* Step 4: Verification Portal */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="cs-section-title text-lg">بوابة التحقق من الشهادات</h3>
              <button
                onClick={() => setCurrentStep(0)}
                className="px-4 py-2 bg-slate-50 border border-slate-100 hover:bg-slate-100 text-slate-500 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                الذهاب للوحة التحكم الرئيسية
              </button>
            </div>
            <VerificationPortal
              attendeesList={attendees}
              workshop={workshop}
              initialQuery={verifyQuery}
            />
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="bg-white text-slate-400 mt-12 py-8 border-t border-slate-100 text-center" id="global-humble-footer">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <div className="flex justify-center items-center gap-2">
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-1.5 rounded-xl">
              <img src="/rifqa-logo.svg" alt="Rifqa Logo" className="h-5 w-auto object-contain" />
            </div>
            <span className="font-black text-slate-600 text-sm">Certify Studio</span>
          </div>
          <p className="text-xs text-slate-400">
            منصة احترافية لتصميم وإصدار الشهادات مع التحقق الفوري عبر رمز QR
          </p>
          <div className="flex justify-center items-center gap-2 text-[11px] text-slate-300">
            <span>حقوق الطبع محفوظة © {new Date().getFullYear()}</span>
            <span>•</span>
            <span>Certify Studio</span>
          </div>
        </div>
      </footer>

      {/* Custom Dialog Modal */}
      {dialogConfig.isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-dialog-backdrop" dir="rtl">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden flex flex-col p-6 space-y-4 animate-dialog-content">
            {/* Icon & Title */}
            <div className="flex items-center gap-3">
              {dialogConfig.type === 'alert' && (
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                  <AlertCircle className="w-6 h-6" />
                </div>
              )}
              {dialogConfig.type === 'confirm' && (
                <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                  <HelpCircle className="w-6 h-6" />
                </div>
              )}
              {dialogConfig.type === 'prompt' && (
                <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
                  <Sparkles className="w-6 h-6" />
                </div>
              )}
              <h4 className="font-bold text-slate-800 text-base font-sans">
                {dialogConfig.type === 'alert' && 'تنبيه'}
                {dialogConfig.type === 'confirm' && 'تأكيد الإجراء'}
                {dialogConfig.type === 'prompt' && 'إدخال قيمة مخصصة'}
              </h4>
            </div>

            {/* Message */}
            <p className="text-slate-600 text-sm leading-relaxed font-sans font-medium">
              {dialogConfig.message}
            </p>

            {/* Prompt Input */}
            {dialogConfig.type === 'prompt' && (
              <input
                type="text"
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white text-slate-800"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    dialogConfig.resolve?.(promptValue);
                  }
                }}
              />
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              {dialogConfig.type !== 'alert' && (
                <button
                  onClick={() => dialogConfig.resolve?.(null)}
                  className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-700 text-xs font-semibold rounded-xl transition-all"
                >
                  إلغاء
                </button>
              )}
              <button
                onClick={() => {
                  if (dialogConfig.type === 'prompt') {
                    dialogConfig.resolve?.(promptValue);
                  } else if (dialogConfig.type === 'confirm') {
                    dialogConfig.resolve?.(true);
                  } else {
                    dialogConfig.resolve?.(undefined);
                  }
                }}
                className={`px-5 py-2.5 text-white text-xs font-bold rounded-xl shadow-sm transition-all active:scale-95 ${
                  dialogConfig.type === 'alert' ? 'bg-indigo-600 hover:bg-indigo-700' :
                  dialogConfig.type === 'confirm' ? 'bg-amber-600 hover:bg-amber-700' :
                  'bg-purple-600 hover:bg-purple-700'
                }`}
              >
                {dialogConfig.type === 'alert' ? 'موافق' : 'تأكيد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Name Dialog for ZIP Export */}
      <FileNameDialog
        isOpen={fileNameDialogOpen}
        defaultValue={fileNameDialogDefault}
        title="تصدير القالب"
        message="يرجى إدخال اسم ملف التصدير:"
        placeholder="اسم الملف"
        onConfirm={(fileName) => {
          setFileNameDialogOpen(false);
          fileNameDialogResolve?.(fileName);
        }}
        onCancel={() => {
          setFileNameDialogOpen(false);
          fileNameDialogResolve?.(fileNameDialogDefault);
        }}
      />

    </div>
  );
}
