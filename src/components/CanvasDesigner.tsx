import React, { useRef, useState, useEffect } from 'react';
import QRCode from 'qrcode';

// Counter-based unique ID generator — prevents collision when called in rapid succession
let _elemIdSeq = 0;
const genElemId = (type: string) => `${type}-${Date.now()}-${++_elemIdSeq}-${Math.random().toString(36).slice(2, 5)}`;
import { 
  CertificateElement, 
  FontOption, 
  Workshop, 
  Attendee,
  PredefinedTemplate
} from '../types';
import { GOOGLE_FONTS } from '../data';
import { parseTextToHtml, parseTextToEditableHtml, htmlToMarkup } from '../utils';
import TemplatesGallery from './TemplatesGallery';
import CustomSelect from './CustomSelect';
import {
  Type,
  Trash2,
  Copy,
  Undo2,
  Redo2,
  QrCode,
  Sparkles,
  Signature,
  Upload,
  Lock,
  Unlock,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Bold,
  Italic,
  Palette,
  Sliders,
  Move,
  LayoutGrid,
  ImagePlus,
  ArrowLeftRight,
  Languages
} from 'lucide-react';

interface CanvasDesignerProps {
  elements: CertificateElement[];
  setElements: React.Dispatch<React.SetStateAction<CertificateElement[]>>;
  workshop: Workshop;
  selectedAttendee: Attendee | null;
  backgroundImageUrl: string;
  setBackgroundImageUrl: (url: string) => void;
  backgroundStyle: string;
  setBackgroundStyle: (style: string) => void;
  borderColor: string;
  setBorderColor: (color: string) => void;
  openSignaturePad: () => void;
  savedSignature: string | null;
  onSignatureAdded?: () => void;
  onApplyEmptyTemplateLayout: () => void;
  // Templates state & handlers passed from App
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
  autoOpenUpload?: boolean;
  onUploadTriggered?: () => void;
  customAlert: (msg: string) => Promise<void>;
  customConfirm: (msg: string) => Promise<boolean>;
  customPrompt: (msg: string, defaultValue?: string) => Promise<string | null>;
}

export default function CanvasDesigner({
  elements,
  setElements,
  workshop,
  selectedAttendee,
  backgroundImageUrl,
  setBackgroundImageUrl,
  backgroundStyle,
  setBackgroundStyle,
  borderColor,
  setBorderColor,
  openSignaturePad,
  savedSignature,
  onSignatureAdded,
  onApplyEmptyTemplateLayout,
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
  autoOpenUpload,
  onUploadTriggered,
  customAlert,
  customConfirm,
  customPrompt
}: CanvasDesignerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Track last mousedown to detect double-click and skip drag setup on second click
  const lastMouseDownRef = useRef<{ id: string; time: number } | null>(null);
  // Store click coordinates so we can position cursor there when editing starts
  const pendingCursorPos = useRef<{ x: number; y: number } | null>(null);

  const insertTextAtCursor = (textToInsert: string) => {
    // Only handles the sidebar textarea; inline editing uses the contenteditable directly
    const textarea = textareaRef.current;
    if (!textarea || !selectedElement) return;

    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const currentValue = selectedElement.content;

    const newValue =
      currentValue.substring(0, startPos) +
      textToInsert +
      currentValue.substring(endPos, currentValue.length);

    updateElement(selectedElement.id, { content: newValue });

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = startPos + textToInsert.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);

    commitChange();
  };

  const insertFormattingTag = (tagStart: string, tagEnd: string, savedSel?: { start: number; end: number }) => {
    // Only handles the sidebar textarea; inline editing uses execCommand on the contenteditable
    const textarea = textareaRef.current;
    if (!textarea || !selectedElement) return;

    const startPos = savedSel ? savedSel.start : textarea.selectionStart;
    const endPos = savedSel ? savedSel.end : textarea.selectionEnd;
    const currentValue = selectedElement.content;

    const selectedText = currentValue.substring(startPos, endPos);
    const placeholder = selectedText || 'نص';
    const textToInsert = tagStart + placeholder + tagEnd;

    const newValue =
      currentValue.substring(0, startPos) +
      textToInsert +
      currentValue.substring(endPos, currentValue.length);

    updateElement(selectedElement.id, { content: newValue });

    setTimeout(() => {
      textarea.focus();
      const newStart = startPos + tagStart.length;
      const newEnd = newStart + placeholder.length;
      textarea.setSelectionRange(newStart, newEnd);
    }, 50);

    commitChange();
  };
  
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'templates' | 'frame' | 'element'>('templates');
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [qrBase64, setQrBase64] = useState<string>('');

  const isActiveCustom = selectedTemplateId === 'blank_custom' || selectedTemplateId.startsWith('custom_');

  // Design Guides & Snapping States
  const [guides, setGuides] = useState<{ id: string; type: 'vertical' | 'horizontal'; position: number }[]>([]);
  const [showGrid, setShowGrid] = useState(false);
  const [showCenterGuides, setShowCenterGuides] = useState(false);
  const [activeDraggingGuideId, setActiveDraggingGuideId] = useState<string | null>(null);
  const [draggingGuidePos, setDraggingGuidePos] = useState<number | null>(null);

  // Auto focus element styles tab when an element is clicked
  useEffect(() => {
    if (selectedId) {
      setSidebarTab('element');
    }
  }, [selectedId]);

  // Redirect active sidebar tabs when template mode changes removed to allow free navigation

  // Trigger file input click programmatically when autoOpenUpload is true
  useEffect(() => {
    if (autoOpenUpload && fileInputRef.current) {
      const timer = setTimeout(() => {
        fileInputRef.current?.click();
        if (onUploadTriggered) {
          onUploadTriggered();
        }
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [autoOpenUpload, onUploadTriggered]);

  // WYSIWYG contenteditable ref for inline text editing on the canvas
  const contentEditableRef = useRef<HTMLDivElement>(null);
  // Saved selection range — preserved before toolbar interactions that may blur the editor
  const savedColorSelRange = useRef<Range | null>(null);

  // Initialize the contenteditable with rendered HTML when editing begins
  useEffect(() => {
    if (editingId && contentEditableRef.current) {
      const editingEl = elements.find(e => e.id === editingId);
      if (!editingEl) return;
      const div = contentEditableRef.current;
      div.innerHTML = parseTextToEditableHtml(editingEl.content);
      div.focus();

      // Try to position cursor at the exact point the user double-clicked
      const clickPos = pendingCursorPos.current;
      pendingCursorPos.current = null;

      if (clickPos) {
        let placed = false;
        try {
          // Chrome / Safari
          if (typeof (document as any).caretRangeFromPoint === 'function') {
            const r = (document as any).caretRangeFromPoint(clickPos.x, clickPos.y) as Range | null;
            if (r && div.contains(r.startContainer)) {
              const sel = window.getSelection();
              sel?.removeAllRanges();
              sel?.addRange(r);
              placed = true;
            }
          // Firefox
          } else if (typeof (document as any).caretPositionFromPoint === 'function') {
            const cp = (document as any).caretPositionFromPoint(clickPos.x, clickPos.y);
            if (cp) {
              const r = document.createRange();
              r.setStart(cp.offsetNode, cp.offset);
              r.collapse(true);
              if (div.contains(r.startContainer)) {
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(r);
                placed = true;
              }
            }
          }
        } catch { /* ignore positioning errors */ }

        if (placed) return;
      }

      // Fallback: place cursor at end
      const range = document.createRange();
      range.selectNodeContents(div);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editingId]);

  // Read the contenteditable HTML and serialize it back to our markup format
  const serializeAndUpdate = (id: string) => {
    const div = contentEditableRef.current;
    if (!div) return;
    const markup = htmlToMarkup(div.innerHTML);
    updateElement(id, { content: markup });
  };

  // Handle click outside to exit inline editing mode; serialize content before exiting
  useEffect(() => {
    if (!editingId) return;

    const handleDocumentMouseDown = (e: MouseEvent) => {
      const editDiv = contentEditableRef.current;
      const toolbar = document.querySelector('.inline-formatting-toolbar');
      const target = e.target as HTMLElement;

      if (editDiv && (editDiv.contains(target) || editDiv === target)) {
        return;
      }
      if (toolbar && (toolbar.contains(target) || toolbar === target)) {
        return;
      }

      // Commit the contenteditable content back to markup before exiting
      serializeAndUpdate(editingId);
      setEditingId(null);
      commitChange();
    };

    document.addEventListener('mousedown', handleDocumentMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
    };
  }, [editingId, elements]);

  // History state for Undo/Redo
  const [history, setHistory] = useState<CertificateElement[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Load custom fonts by appending Google Font links dynamically to document head
  useEffect(() => {
    const fontNames = GOOGLE_FONTS.map(f => f.family).filter(f => f && f !== 'Inter');
    const uniqueFonts = Array.from(new Set(fontNames));
    
    uniqueFonts.forEach(font => {
      const linkId = `gfont-${font.replace(/\s+/g, '-').toLowerCase()}`;
      if (!document.getElementById(linkId)) {
        const link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${font.replace(/\s+/g, '+')}:wght@400;700&display=swap`;
        document.head.appendChild(link);
      }
    });
  }, []);

  // Save state to history whenever elements change, except during undo/redo operations
  const HISTORY_LIMIT = 50;
  const pushToHistory = (newElements: CertificateElement[]) => {
    let nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(JSON.parse(JSON.stringify(newElements)));
    // Cap history depth to avoid unbounded memory growth
    if (nextHistory.length > HISTORY_LIMIT) {
      nextHistory = nextHistory.slice(nextHistory.length - HISTORY_LIMIT);
    }
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
  };

  // Initialize history with initial elements
  useEffect(() => {
    if (history.length === 0 && elements.length > 0) {
      setHistory([JSON.parse(JSON.stringify(elements))]);
      setHistoryIndex(0);
    }
  }, [elements]);

  // Generate verified QR code string
  useEffect(() => {
    const demoSerial = selectedAttendee ? selectedAttendee.serialNumber : 'CERT-2026-DEMO';
    
    // Find the QR element to get its custom styling
    const qrElement = elements.find(el => el.type === 'qr');
    const darkColor = qrElement?.color || '#000000';
    const lightColor = qrElement?.qrBgColor || '#ffffff';
    const margin = qrElement?.qrMargin !== undefined ? qrElement.qrMargin : 1;

    QRCode.toDataURL(demoSerial, {
      margin: margin,
      width: 150,
      color: {
        dark: darkColor,
        light: lightColor
      }
    })
    .then(url => {
      setQrBase64(url);
    })
    .catch(err => console.error('QR code generation failed', err));
  }, [selectedAttendee, elements]);

  // Add freshly drawn signature to custom files
  useEffect(() => {
    if (savedSignature) {
      const newElem: CertificateElement = {
        id: genElemId('sig'),
        type: 'signature',
        x: 45,
        y: 80,
        width: 14,
        height: 10,
        content: savedSignature,
        fontSize: 14,
        color: '#000000',
        fontFamily: 'Cairo',
        fontWeight: 'normal',
        fontStyle: 'normal',
        align: 'center',
        opacity: 100,
        letterSpacing: 0,
        isLocked: false
      };
      const updated = [...elements, newElem];
      setElements(updated);
      pushToHistory(updated);
      setSelectedId(newElem.id);
      if (onSignatureAdded) {
        onSignatureAdded();
      }
    }
  }, [savedSignature, onSignatureAdded]);

  // Listen to arrow keys and delete key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedId) return;

      const activeElement = document.activeElement;
      // If of type input/textarea, do not intercept
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'SELECT')) {
        return;
      }

      const target = elements.find(el => el.id === selectedId);
      if (!target || target.isLocked) return;

      let step = e.shiftKey ? 2 : 0.5; // percentage step size
      let update: Partial<CertificateElement> | null = null;

      if (e.key === 'ArrowUp') {
        update = { y: Math.max(0, target.y - step) };
      } else if (e.key === 'ArrowDown') {
        update = { y: Math.min(100, target.y + step) };
      } else if (e.key === 'ArrowLeft') {
        update = { x: Math.max(0, target.x - step) };
      } else if (e.key === 'ArrowRight') {
        update = { x: Math.min(100, target.x + step) };
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        deleteElement(selectedId);
        return;
      }

      if (update) {
        e.preventDefault();
        updateElement(selectedId, update);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, elements]);

  // Handle Undo/Redo actions
  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setElements(JSON.parse(JSON.stringify(history[newIndex])));
      setSelectedId(null);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setElements(JSON.parse(JSON.stringify(history[newIndex])));
      setSelectedId(null);
    }
  };

  // Mutator operations
  const updateElement = (id: string, updates: Partial<CertificateElement>) => {
    const updated = elements.map(el => {
      if (el.id === id) {
        return { ...el, ...updates };
      }
      return el;
    });
    setElements(updated);
  };

  // Confirms state update to back stack on mouse up / blur
  const commitChange = () => {
    pushToHistory(elements);
  };

  const deleteElement = (id: string) => {
    const filtered = elements.filter(el => el.id !== id);
    setElements(filtered);
    pushToHistory(filtered);
    setSelectedId(null);
  };

  const duplicateElement = (id: string) => {
    const original = elements.find(el => el.id === id);
    if (!original) return;

    const copy: CertificateElement = {
      ...JSON.parse(JSON.stringify(original)),
      id: genElemId(original.type),
      x: Math.min(95, original.x + 4), // offset slightly
      y: Math.min(95, original.y + 4),
      isLocked: false
    };

    const updated = [...elements, copy];
    setElements(updated);
    pushToHistory(updated);
    setSelectedId(copy.id);
  };

  const addTextElement = (presetText: string = 'نص جديد مزدوج القيمة') => {
    const newEl: CertificateElement = {
      id: genElemId('text'),
      type: 'text',
      x: 50,
      y: 50,
      width: 50,
      height: 6,
      content: presetText,
      fontSize: 16,
      color: '#333333',
      fontFamily: 'Cairo',
      fontWeight: 'normal',
      fontStyle: 'normal',
      align: 'center',
      opacity: 100,
      letterSpacing: 0,
      isLocked: false
    };

    const updated = [...elements, newEl];
    setElements(updated);
    pushToHistory(updated);
    setSelectedId(newEl.id);
  };

  const addQrElement = async () => {
    // Check if there is already a QR element to avoid clustering
    if (elements.some(el => el.type === 'qr')) {
      await customAlert('يحتوي التصميم على رمز QR مسبقاً! يمكنك نقله أو تعديله.');
      return;
    }

    const newEl: CertificateElement = {
      id: genElemId('qr'),
      type: 'qr',
      x: 50,
      y: 75,
      width: 10,
      height: 14,
      content: '{qr}',
      fontSize: 12,
      color: '#000000',
      fontFamily: 'Cairo',
      fontWeight: 'normal',
      fontStyle: 'normal',
      align: 'center',
      opacity: 100,
      letterSpacing: 0,
      isLocked: false
    };

    const updated = [...elements, newEl];
    setElements(updated);
    pushToHistory(updated);
    setSelectedId(newEl.id);
  };

  const addBadgeElement = () => {
    const newEl: CertificateElement = {
      id: genElemId('badge'),
      type: 'badge',
      x: 50,
      y: 80,
      width: 12,
      height: 16,
      content: 'golden_seal',
      fontSize: 12,
      color: '#000000',
      fontFamily: 'Cairo',
      fontWeight: 'normal',
      fontStyle: 'normal',
      align: 'center',
      opacity: 100,
      letterSpacing: 0,
      isLocked: false
    };

    const updated = [...elements, newEl];
    setElements(updated);
    pushToHistory(updated);
    setSelectedId(newEl.id);
  };

  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ALLOWED = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!ALLOWED.includes(file.type)) {
      await customAlert('يرجى رفع صورة بصيغة PNG أو SVG أو JPG أو WEBP فقط.');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      await customAlert('حجم الصورة كبير! الحد الأقصى 5 ميجابايت.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const newEl: CertificateElement = {
        id: genElemId('image'),
        type: 'image',
        x: 50,
        y: 50,
        width: 20,
        height: 20,
        content: dataUrl,
        fontSize: 14,
        color: '#000000',
        fontFamily: 'Cairo',
        fontWeight: 'normal',
        fontStyle: 'normal',
        align: 'center',
        opacity: 100,
        letterSpacing: 0,
        isLocked: false
      };
      const updated = [...elements, newEl];
      setElements(updated);
      pushToHistory(updated);
      setSelectedId(newEl.id);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Helper replacements on preview canvas
  const resolveTemplateVariables = (text: string): string => {
    let output = text;
    
    // Core parameters mapping
    const repName = selectedAttendee ? selectedAttendee.name : 'عبد الرحمن بن علي الهاشمي';
    const repEmail = selectedAttendee ? selectedAttendee.email : 'attendee@gmail.com';
    const repSerial = selectedAttendee ? selectedAttendee.serialNumber : (workshop.serialPrefix + '-2026-X8Y');

    output = output.replace(/{name}/g, repName);
    output = output.replace(/{workshop}/g, workshop.title || 'ورشة العمل الكبرى لعلوم وهندسة المستقبل');
    output = output.replace(/{instructor}/g, workshop.instructor || 'أ. أحمد الشقيري');
    output = output.replace(/{date}/g, workshop.dateArabic || '25 مايو 2026م');
    output = output.replace(/{hours}/g, String(workshop.hours || 12));
    output = output.replace(/{serial}/g, repSerial);
    output = output.replace(/{organization}/g, workshop.organizationName || 'دار الحكمة للتطوير المهني');

    // Mapped custom columns from dynamic fields
    if (selectedAttendee && selectedAttendee.customFields) {
      Object.keys(selectedAttendee.customFields).forEach(key => {
        const replacementRegex = new RegExp(`{${key}}`, 'g');
        output = output.replace(replacementRegex, selectedAttendee.customFields?.[key] || '');
      });
    }

    return output;
  };

  // Drag handles logic relative to container box
  const handleElementMouseDown = (e: React.MouseEvent, id: string) => {
    const now = Date.now();
    const prev = lastMouseDownRef.current;
    lastMouseDownRef.current = { id, time: now };

    const elStyle = elements.find(el => el.id === id);
    if (!elStyle) return;

    // We can select the element regardless of lock status
    setSelectedId(id);
    e.stopPropagation();

    // If it's locked, we prevent moving/dragging, but selection is successful
    if (elStyle.isLocked) {
      return;
    }

    // If this looks like the second click of a double-click on a text element,
    // skip drag setup so React state updates don't interfere with editing entry
    if (prev && prev.id === id && (now - prev.time) < 450 && elStyle.type === 'text') {
      return; // onDoubleClick on the inner div will handle setEditingId
    }

    e.preventDefault();

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    
    // Calculate initial offset in percent
    const mouseXPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const mouseYPercent = ((e.clientY - rect.top) / rect.height) * 100;

    setDragOffset({
      x: mouseXPercent - elStyle.x,
      y: mouseYPercent - elStyle.y
    });

    setIsDragging(true);

    const handleMouseMove = (mvEv: MouseEvent) => {
      const curX = ((mvEv.clientX - rect.left) / rect.width) * 100;
      const curY = ((mvEv.clientY - rect.top) / rect.height) * 100;

      let boundedX = curX - (mouseXPercent - elStyle.x);
      let boundedY = curY - (mouseYPercent - elStyle.y);

      // Snap logic!
      const SNAP_THRESHOLD = 1.5; // percentage snap radius
      
      // 1. Snap to custom guides
      guides.forEach(guide => {
        if (guide.type === 'vertical') {
          if (Math.abs(boundedX - guide.position) < SNAP_THRESHOLD) {
            boundedX = guide.position;
          }
        } else {
          if (Math.abs(boundedY - guide.position) < SNAP_THRESHOLD) {
            boundedY = guide.position;
          }
        }
      });

      // 2. Snap to center lines if enabled
      if (showCenterGuides) {
        if (Math.abs(boundedX - 50) < SNAP_THRESHOLD) {
          boundedX = 50;
        }
        if (Math.abs(boundedY - 50) < SNAP_THRESHOLD) {
          boundedY = 50;
        }
      }

      // Lock bounds 0-100 to keep within visible boundaries
      boundedX = Math.max(0, Math.min(100, boundedX));
      boundedY = Math.max(0, Math.min(100, boundedY));

      updateElement(id, {
        x: Number(boundedX.toFixed(2)),
        y: Number(boundedY.toFixed(2))
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      // Push state
      commitChange();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleResizeMouseDown = (e: React.MouseEvent, id: string, direction: 'left' | 'right') => {
    e.stopPropagation();
    e.preventDefault();

    const el = elements.find(item => item.id === id);
    if (!el || el.isLocked) return;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    
    // Capture the anchor edge position at drag start
    const startX = el.x;
    const startWidth = el.width;
    const L = startX - startWidth / 2;
    const R = startX + startWidth / 2;

    const handleMouseMove = (mvEv: MouseEvent) => {
      const mousePercentX = ((mvEv.clientX - rect.left) / rect.width) * 100;
      
      let newWidth = startWidth;
      let newX = startX;

      if (direction === 'right') {
        newWidth = Math.max(5, Math.min(100 - L, mousePercentX - L));
        newX = L + newWidth / 2;
      } else {
        newWidth = Math.max(5, Math.min(R, R - mousePercentX));
        newX = R - newWidth / 2;
      }

      updateElement(id, {
        width: Number(newWidth.toFixed(2)),
        x: Number(newX.toFixed(2))
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      commitChange();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };
  const handleGuideMouseDown = (e: React.MouseEvent, id: string, type: 'vertical' | 'horizontal') => {
    e.stopPropagation();
    e.preventDefault();
    
    const container = containerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    setActiveDraggingGuideId(id);

    const handleMouseMove = (mvEv: MouseEvent) => {
      let percent = 50;
      if (type === 'vertical') {
        percent = ((mvEv.clientX - rect.left) / rect.width) * 100;
      } else {
        percent = ((mvEv.clientY - rect.top) / rect.height) * 100;
      }
      
      const clamped = Math.max(0, Math.min(100, percent));
      const rounded = Number(clamped.toFixed(1));
      
      setDraggingGuidePos(rounded);
      setGuides(prev => prev.map(g => g.id === id ? { ...g, position: rounded } : g));
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      setActiveDraggingGuideId(null);
      setDraggingGuidePos(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };
  const [isPdfConverting, setIsPdfConverting] = useState(false);

  // Helper for rendering PDF page to PNG Data URL client-side via CDN-loaded PDF.js
  const loadPdfPageAsImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const fileReader = new FileReader();
      fileReader.onload = function() {
        try {
          const typedarray = new Uint8Array(this.result as ArrayBuffer);
          
          if (!(window as any).pdfjsLib) {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
            script.onload = () => {
              const pdfjsLib = (window as any).pdfjsLib;
              pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
              renderPdfToImage(typedarray, resolve, reject);
            };
            script.onerror = () => reject(new Error('Failed to load PDF library from CDN'));
            document.head.appendChild(script);
          } else {
            renderPdfToImage(typedarray, resolve, reject);
          }
        } catch (err) {
          reject(err);
        }
      };
      fileReader.readAsArrayBuffer(file);
    });
  };

  const renderPdfToImage = async (typedarray: Uint8Array, resolve: (url: string) => void, reject: (err: any) => void) => {
    try {
      const pdfjsLib = (window as any).pdfjsLib;
      const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
      const page = await pdf.getPage(1);
      
      const scale = 2.5; // High resolution screen capture logic
      const viewport = page.getViewport({ scale });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      if (!context) {
        reject(new Error('Canvas context could not be created'));
        return;
      }
      
      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };
      
      await page.render(renderContext).promise;
      const imgUrl = canvas.toDataURL('image/png');
      resolve(imgUrl);
    } catch (err) {
      reject(err);
    }
  };

  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type === 'application/pdf') {
        setIsPdfConverting(true);
        try {
          const imgUrl = await loadPdfPageAsImage(file);
          setBackgroundImageUrl(imgUrl);
          setBackgroundStyle(''); // Clear ambient gradients
          setBorderColor('transparent'); // Override frame
        } catch (err) {
          console.error(err);
          await customAlert('فشل في معالجة وتحويل مستند PDF. يرجى تجربة ملف آخر أو رفع الخلفية مسبقة التصميم كصورة بصيغة PNG أو JPG.');
        } finally {
          setIsPdfConverting(false);
        }
      } else {
        const reader = new FileReader();
        reader.onload = async (readerEv) => {
          const url = readerEv.target?.result as string;
          if (url) {
            setBackgroundImageUrl(url);
            setBackgroundStyle(''); // Clear override
            setBorderColor('transparent');
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const clearBackgroundImage = () => {
    setBackgroundImageUrl('');
    setBackgroundStyle('linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)'); // restore clean
    pushToHistory(elements);
  };

  const selectedElement = elements.find(el => el.id === selectedId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" dir="rtl" id="canvas-designer-root">
      {/* 2/3: Editor Workspace Area */}
      <div className="lg:col-span-8 flex flex-col space-y-4">
        {/* Toolbar */}
        <div className="cs-card p-3 flex flex-wrap items-center justify-between gap-3">
          {/* Undo / Redo */}
          <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl">
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="p-2 rounded-lg text-slate-500 hover:bg-white hover:text-indigo-600 disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer"
              title="تراجع"
              aria-label="تراجع"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="p-2 rounded-lg text-slate-500 hover:bg-white hover:text-indigo-600 disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer"
              title="إعادة"
              aria-label="إعادة"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {/* Guides controls */}
          <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl">
            <span className="text-[10px] text-slate-400 font-semibold px-1.5 hidden sm:inline">أدلة التصميم:</span>
            
            {/* Toggle Grid */}
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`p-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                showGrid
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-white hover:text-indigo-600'
              }`}
              title="تفعيل شبكة النقاط"
              id="btn-toggle-grid"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>

            {/* Toggle Center lines */}
            <button
              onClick={() => setShowCenterGuides(!showCenterGuides)}
              className={`p-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                showCenterGuides
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-indigo-600'
              }`}
              title="تفعيل خطوط المنتصف"
              id="btn-toggle-center-guides"
            >
              <Sliders className="w-3.5 h-3.5 text-blue-500" />
            </button>

            {/* Add Custom Vertical Guide */}
            <button
              onClick={() => {
                setGuides(prev => [...prev, { id: `vg-${Date.now()}`, type: 'vertical', position: 50 }]);
              }}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-white hover:text-indigo-600 cursor-pointer transition-all"
              title="إضافة خط إرشاد عمودي"
              id="btn-add-v-guide"
            >
              <span className="font-bold text-[10px] flex items-center gap-0.5">
                <span className="w-0.5 h-3 bg-cyan-500 inline-block" />
                V
              </span>
            </button>

            {/* Add Custom Horizontal Guide */}
            <button
              onClick={() => {
                setGuides(prev => [...prev, { id: `hg-${Date.now()}`, type: 'horizontal', position: 50 }]);
              }}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-white hover:text-indigo-600 cursor-pointer transition-all"
              title="إضافة خط إرشاد أفقي"
              id="btn-add-h-guide"
            >
              <span className="font-bold text-[10px] flex items-center gap-0.5">
                <span className="w-3 h-0.5 bg-cyan-500 inline-block" />
                H
              </span>
            </button>

            {/* Clear All Guides */}
            {guides.length > 0 && (
              <button
                onClick={() => setGuides([])}
                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 cursor-pointer transition-all"
                title="مسح جميع خطوط الإرشاد المخصصة"
                id="btn-clear-guides"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Add elements — unified styling, colored icons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400 font-semibold ml-1 hidden sm:inline">إضافة:</span>
            <button onClick={() => addTextElement()} className="cs-btn cs-btn-soft px-3 py-2" id="btn-add-text">
              <Type className="w-4 h-4" /> نص
            </button>
            <button onClick={addQrElement} className="cs-btn cs-btn-ghost px-3 py-2" id="btn-add-qr">
              <QrCode className="w-4 h-4 text-indigo-500" /> رمز QR
            </button>
            <input
              ref={imageFileInputRef}
              type="file"
              accept="image/png,image/svg+xml,image/jpeg,image/webp"
              className="hidden"
              onChange={handleImageFileUpload}
            />
            <button onClick={() => imageFileInputRef.current?.click()} className="cs-btn cs-btn-ghost px-3 py-2" id="btn-add-image" title="رفع صورة PNG شفافة أو SVG أو لوجو">
              <ImagePlus className="w-4 h-4 text-violet-500" /> صورة
            </button>
            <button onClick={openSignaturePad} className="cs-btn cs-btn-ghost px-3 py-2" id="btn-add-sig-pad">
              <Signature className="w-4 h-4 text-emerald-500" /> توقيع
            </button>
            <button onClick={addBadgeElement} className="cs-btn cs-btn-ghost px-3 py-2" id="btn-add-badge">
              <Sparkles className="w-4 h-4 text-amber-500" /> ختم
            </button>
          </div>
        </div>

        {/* Outer Bounds Container of the Dynamic Drawing Canvas */}
        <div className="bg-gradient-to-br from-slate-50 to-blue-50/60 p-4 md:p-6 rounded-2xl border border-slate-100 flex items-center justify-center overflow-hidden">
          <div
            ref={containerRef}
            className={`w-full max-w-4xl aspect-[1.414] bg-white rounded-lg shadow-[0_20px_50px_rgba(15,23,42,0.15)] relative ${editingId ? 'overflow-visible' : 'overflow-hidden'} transition-all select-none`}
            style={{ 
              borderColor: borderColor,
              borderWidth: borderColor !== 'transparent' ? '12px' : '0px',
              backgroundImage: backgroundImageUrl ? `url(${backgroundImageUrl})` : backgroundStyle,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setSelectedId(null);
                setEditingId(null);
              }
            }}
            id="certificate-master-canvas"
          >
            {/* Elements map */}
            {elements.map((el) => {
              const parsedText = el.type === 'text' ? resolveTemplateVariables(el.content) : '';
              const isSelected = selectedId === el.id;

              return (
                <div
                  key={el.id}
                  onMouseDown={(e) => handleElementMouseDown(e, el.id)}
                  onClick={(e) => e.stopPropagation()}
                  className={`absolute group ${el.isLocked ? 'cursor-default' : 'cursor-move'} ${
                    isSelected 
                      ? 'ring-2 ring-indigo-500 ring-offset-2' 
                      : 'hover:ring-1 hover:ring-indigo-300'
                  } transition-shadow`}
                  style={{
                    left: `${el.x}%`,
                    top: `${el.y}%`,
                    width: `${el.width}%`,
                    // Center the element around its anchor coordinate point
                    transform: 'translate(-50%, -50%)',
                    zIndex: isSelected ? 40 : 10,
                    opacity: el.opacity / 100,
                  }}
                  id={`canvas-el-${el.id}`}
                >
                  {/* Selected outline decorative visualizer */}
                  {isSelected && (
                    <>
                      <div className="absolute -top-6 right-0 bg-indigo-600 text-white px-2 py-0.5 rounded text-[10px] font-sans flex items-center gap-1">
                        <Move className="w-3 h-3 animate-pulse" />
                        {el.type === 'text' ? 'حقل نصي' : el.type === 'qr' ? 'رمز تحقق QR' : el.type === 'badge' ? 'شعار ذهبي' : 'توقيع مدرب'}
                      </div>
                      {!el.isLocked && (
                        <>
                          {/* Left Resize Handle */}
                          <div
                            onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'left')}
                            className="absolute top-0 bottom-0 left-0 w-3 -translate-x-1/2 cursor-ew-resize z-50 flex items-center justify-center"
                            title="سحب لتغيير العرض"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="w-1.5 h-6 bg-indigo-600 rounded-full border border-white shadow-sm hover:scale-125 transition-transform" />
                          </div>

                          {/* Right Resize Handle */}
                          <div
                            onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'right')}
                            className="absolute top-0 bottom-0 right-0 w-3 translate-x-1/2 cursor-ew-resize z-50 flex items-center justify-center"
                            title="سحب لتغيير العرض"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="w-1.5 h-6 bg-indigo-600 rounded-full border border-white shadow-sm hover:scale-125 transition-transform" />
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {/* Render based on Type */}
                  {el.type === 'text' && (
                    editingId === el.id ? (
                      <div className="relative w-full">
                        {/* Floating Inline Formatting Toolbar */}
                        <div
                          className="inline-formatting-toolbar absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur text-white px-2 py-1.5 rounded-xl shadow-lg border border-slate-800 flex items-center gap-1 z-[100] animate-in fade-in zoom-in-95 duration-150 select-none"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Bold */}
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              document.execCommand('bold');
                              serializeAndUpdate(el.id);
                            }}
                            className="p-1 hover:bg-white/10 rounded text-white cursor-pointer"
                            title="عريض"
                          >
                            <Bold className="w-3.5 h-3.5" />
                          </button>

                          {/* Italic */}
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              document.execCommand('italic');
                              serializeAndUpdate(el.id);
                            }}
                            className="p-1 hover:bg-white/10 rounded text-white cursor-pointer"
                            title="مائل"
                          >
                            <Italic className="w-3.5 h-3.5" />
                          </button>

                          {/* Underline */}
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              document.execCommand('underline');
                              serializeAndUpdate(el.id);
                            }}
                            className="p-1 hover:bg-white/10 rounded text-white cursor-pointer"
                            title="مسطر"
                          >
                            <span className="underline font-bold text-[10px]">U</span>
                          </button>

                          {/* Divider */}
                          <div className="w-px h-4 bg-white/20 mx-0.5" />

                          {/* Inline color picker — saves selection before native picker opens */}
                          <label
                            className="p-1 hover:bg-white/10 rounded cursor-pointer relative"
                            title="تلوين النص المحدد"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              // Save current selection before the color picker steals focus
                              const sel = window.getSelection();
                              if (sel && sel.rangeCount > 0) {
                                savedColorSelRange.current = sel.getRangeAt(0).cloneRange();
                              }
                            }}
                          >
                            <Palette className="w-3.5 h-3.5 text-yellow-300" />
                            <input
                              type="color"
                              defaultValue="#ca8a04"
                              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                              onChange={(e) => {
                                const color = e.target.value;
                                const div = contentEditableRef.current;
                                if (!div) return;
                                div.focus();
                                // Restore saved selection so execCommand targets the correct range
                                const sel = window.getSelection();
                                if (savedColorSelRange.current) {
                                  sel?.removeAllRanges();
                                  sel?.addRange(savedColorSelRange.current.cloneRange());
                                  savedColorSelRange.current = null;
                                }
                                document.execCommand('foreColor', false, color);
                                serializeAndUpdate(el.id);
                              }}
                            />
                          </label>

                          {/* Inline size picker */}
                          <CustomSelect
                            value=""
                            variant="toolbar"
                            onChange={(val) => {
                              if (!val) return;
                              const div = contentEditableRef.current;
                              if (!div) return;
                              div.focus();
                              // Restore selection saved from last onMouseUp/onKeyUp
                              const sel = window.getSelection();
                              if (savedColorSelRange.current) {
                                sel?.removeAllRanges();
                                sel?.addRange(savedColorSelRange.current.cloneRange());
                                savedColorSelRange.current = null;
                              }
                              const selection = window.getSelection();
                              if (selection && selection.rangeCount > 0) {
                                const range = selection.getRangeAt(0);
                                if (!range.collapsed) {
                                  try {
                                    const span = document.createElement('span');
                                    span.style.fontSize = val;
                                    range.surroundContents(span);
                                  } catch {
                                    // Selection spans element boundaries — skip gracefully
                                  }
                                }
                              }
                              serializeAndUpdate(el.id);
                            }}
                            options={[
                              { value: '0.75em', label: 'XS' },
                              { value: '0.9em', label: 'S' },
                              { value: '1.2em', label: 'M+' },
                              { value: '1.5em', label: 'L' },
                              { value: '2em', label: 'XL' }
                            ]}
                            placeholder="حجم"
                            id="select-inline-size"
                          />
                        </div>

                        {/* WYSIWYG contenteditable — shows rendered HTML, no raw markup visible */}
                        <div
                          ref={contentEditableRef}
                          contentEditable
                          suppressContentEditableWarning
                          dir={el.direction || 'auto'}
                          onInput={() => serializeAndUpdate(el.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              serializeAndUpdate(el.id);
                              setEditingId(null);
                              commitChange();
                            }
                          }}
                          onMouseUp={() => {
                            // Track selection so toolbar actions can restore it
                            const sel = window.getSelection();
                            if (sel && sel.rangeCount > 0) {
                              savedColorSelRange.current = sel.getRangeAt(0).cloneRange();
                            }
                          }}
                          onKeyUp={() => {
                            const sel = window.getSelection();
                            if (sel && sel.rangeCount > 0) {
                              savedColorSelRange.current = sel.getRangeAt(0).cloneRange();
                            }
                          }}
                          onDoubleClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full min-h-[1.2em] focus:outline-none select-text caret-indigo-500"
                          style={{
                            fontFamily: el.fontFamily,
                            fontSize: `calc(${el.fontSize}px * 0.9)`,
                            color: el.color,
                            fontWeight: el.fontWeight,
                            fontStyle: el.fontStyle,
                            textAlign: el.align,
                            letterSpacing: `${el.letterSpacing}px`,
                            lineHeight: '1.4',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            outline: 'none',
                            boxShadow: 'none',
                            cursor: 'text',
                            userSelect: 'text',
                            direction: (el.direction === 'rtl' || el.direction === 'ltr') ? el.direction : undefined,
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (el.isLocked) return;
                          // Save click coordinates so the cursor lands exactly where the user clicked
                          pendingCursorPos.current = { x: e.clientX, y: e.clientY };
                          setEditingId(el.id);
                        }}
                        dir={el.direction || 'auto'}
                        className="whitespace-pre-wrap select-none"
                        style={{
                          fontFamily: el.fontFamily,
                          fontSize: `calc(${el.fontSize}px * 0.9)`, // scale slightly to fit container ratio
                          color: el.color,
                          fontWeight: el.fontWeight,
                          fontStyle: el.fontStyle,
                          textAlign: el.align,
                          letterSpacing: `${el.letterSpacing}px`,
                          lineHeight: '1.4',
                          direction: (el.direction === 'rtl' || el.direction === 'ltr') ? el.direction : undefined,
                        }}
                        dangerouslySetInnerHTML={{ __html: parseTextToHtml(parsedText) }}
                      />
                    )
                  )}

                  {el.type === 'qr' && (
                    <div 
                      className="flex flex-col items-center justify-center p-1 rounded shadow-sm mx-auto w-full aspect-square" 
                      style={{ 
                        backgroundColor: el.qrBgColor || '#ffffff',
                        borderColor: el.qrBgColor || '#e2e8f0',
                        borderWidth: '1px',
                        borderStyle: 'solid'
                      }}
                    >
                      {qrBase64 ? (
                        <img 
                          src={qrBase64} 
                          alt="Verification QR" 
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain block" 
                        />
                      ) : (
                        <span className="text-[10px] text-slate-400 font-mono">LOADING</span>
                      )}
                    </div>
                  )}

                  {el.type === 'signature' && (
                    <div className="mx-auto" style={{ width: '110px' }}>
                      <img
                        src={el.content}
                        alt="Signature"
                        referrerPolicy="no-referrer"
                        className="w-full object-contain max-h-16 inline-block"
                      />
                    </div>
                  )}

                  {el.type === 'image' && (
                    <div className="mx-auto" style={{ width: '100%' }}>
                      <img
                        src={el.content}
                        alt="Image element"
                        referrerPolicy="no-referrer"
                        style={{ width: '100%', height: 'auto', objectFit: 'contain', display: 'block', background: 'transparent' }}
                      />
                    </div>
                  )}

                  {el.type === 'badge' && (
                    <div className="mx-auto flex items-center justify-center" style={{ width: '60px', height: '60px' }}>
                      {/* Glorious Gold Badge Seal SVG */}
                      <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
                        <polygon points="50,95 62,80 78,85 80,68 95,62 88,48 95,34 80,28 78,11 62,16 50,1 38,16 22,11 20,28 5,34 12,48 5,62 20,68 22,85 38,80" fill="#dfb750" />
                        <polygon points="50,91 60,77 75,81 77,65 91,60 84,48 91,36 77,31 75,15 60,19 50,6 40,19 25,15 23,31 9,36 16,48 9,60 23,65 25,81 40,77" fill="#f5d061" />
                        <circle cx="50" cy="48" r="32" fill="#9c721c" />
                        <circle cx="50" cy="48" r="28" fill="url(#goldGrad)" />
                        <text x="50" y="52" fill="#583f06" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="Cairo">معتمد</text>
                        <circle cx="50" cy="48" r="24" fill="none" stroke="#583f06" strokeWidth="1" strokeDasharray="2,2" />
                        <defs>
                          <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#fef08a" />
                            <stop offset="50%" stopColor="#eab308" />
                            <stop offset="100%" stopColor="#ca8a04" />
                          </linearGradient>
                        </defs>
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Grid Overlay */}
            {showGrid && (
              <div 
                className="absolute inset-0 pointer-events-none" 
                style={{
                  backgroundImage: 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)',
                  backgroundSize: '4% 4%',
                  opacity: 0.6,
                  zIndex: 5
                }}
              />
            )}

            {/* Center Cross Guides */}
            {showCenterGuides && (
              <>
                <div className="absolute top-0 bottom-0 left-1/2 w-px border-l border-dashed border-indigo-400 pointer-events-none" style={{ zIndex: 6 }} />
                <div className="absolute left-0 right-0 top-1/2 h-px border-t border-dashed border-indigo-400 pointer-events-none" style={{ zIndex: 6 }} />
              </>
            )}

            {/* Draggable Custom Guides */}
            {guides.map((guide) => {
              const isVertical = guide.type === 'vertical';
              const isDragging = activeDraggingGuideId === guide.id;

              return (
                <div
                  key={guide.id}
                  onMouseDown={(e) => handleGuideMouseDown(e, guide.id, guide.type)}
                  onDoubleClick={() => {
                    setGuides(prev => prev.filter(g => g.id !== guide.id));
                  }}
                  className={`absolute group z-30 ${isVertical ? 'top-0 bottom-0 w-3 cursor-col-resize -ml-1.5' : 'left-0 right-0 h-3 cursor-row-resize -mt-1.5'}`}
                  style={{
                    left: isVertical ? `${guide.position}%` : 0,
                    top: !isVertical ? `${guide.position}%` : 0,
                  }}
                  title="اسحب للتحريك - انقر مرتين للحذف"
                >
                  <div
                    className={`w-full h-full flex items-center justify-center transition-colors ${
                      isVertical
                        ? 'w-[1.5px] border-l border-dashed border-cyan-500 group-hover:border-indigo-600 group-hover:border-solid'
                        : 'h-[1.5px] border-t border-dashed border-cyan-500 group-hover:border-indigo-600 group-hover:border-solid'
                    } ${isDragging ? 'border-indigo-600 border-solid scale-105' : ''}`}
                    style={{
                      borderColor: isDragging ? '#4f46e5' : undefined,
                    }}
                  />

                  {isDragging && (
                    <div
                      className="absolute bg-indigo-600 text-white text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shadow-md pointer-events-none z-50 whitespace-nowrap"
                      style={{
                        transform: isVertical ? 'translate(-50%, -100%)' : 'translate(10px, -50%)',
                        top: isVertical ? '-20px' : '50%',
                        left: isVertical ? '50%' : '100%',
                      }}
                    >
                      {isVertical ? `X: ${guide.position}%` : `Y: ${guide.position}%`}
                    </div>
                  )}

                  <div className="absolute hidden group-hover:block bg-slate-800 text-white text-[8px] px-1 py-0.5 rounded pointer-events-none whitespace-nowrap opacity-95 transition-opacity z-40"
                    style={{
                      top: isVertical ? '20px' : '-20px',
                      left: isVertical ? '15px' : '50%',
                      transform: isVertical ? 'none' : 'translateX(-50%)',
                    }}
                  >
                    نقر مزدوج للحذف
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Shortcuts Legend */}
        <div className="text-[11px] text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-wrap items-center gap-2 justify-between">
          <span className="font-semibold text-slate-600">اختصارات:</span>
          <span>
            <kbd className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-700 font-mono text-[10px]">↑↓←→</kbd> للتحريك،
            <kbd className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-700 font-mono text-[10px] mr-1">Delete</kbd> للحذف،
            <kbd className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-700 font-mono text-[10px] mr-1">نقر مزدوج</kbd> لتحرير النص
          </span>
        </div>
      </div>

      {/* 1/3: Settings and Property Editors Sidebar */}
      <div className="lg:col-span-4 cs-card cs-card-pad flex flex-col space-y-4 h-fit lg:sticky lg:top-20" id="designer-unified-sidebar">

        {/* Tab Selector Buttons */}
        <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
          <button
            onClick={() => setSidebarTab('templates')}
            className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
              sidebarTab === 'templates'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-500 hover:text-indigo-600 hover:bg-white'
            }`}
          >
            القوالب
          </button>
          <button
            onClick={() => setSidebarTab('frame')}
            className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
              sidebarTab === 'frame'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-500 hover:text-indigo-600 hover:bg-white'
            }`}
          >
            الإطار والخلفية
          </button>
          <button
            onClick={() => setSidebarTab('element')}
            className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
              sidebarTab === 'element'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-500 hover:text-indigo-600 hover:bg-white'
            }`}
          >
            خصائص العنصر
          </button>
        </div>

        {/* Tab 1: Templates Gallery */}
        {sidebarTab === 'templates' && (
          <div className="space-y-4">
            <TemplatesGallery
              templates={templates}
              selectedTemplateId={selectedTemplateId}
              onSelectTemplate={onSelectTemplate}
              onSaveAsNewTemplate={onSaveAsNewTemplate}
              onUpdateTemplate={onUpdateTemplate}
              onDeleteTemplate={onDeleteTemplate}
              onExportActiveTemplate={onExportActiveTemplate}
              onExportSpecificTemplate={onExportSpecificTemplate}
              onImportTemplate={onImportTemplate}
              onImportTemplateZip={onImportTemplateZip}
              isCompact={true}
              customAlert={customAlert}
              customConfirm={customConfirm}
            />
            {!backgroundImageUrl && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-[11px] text-amber-800 leading-relaxed space-y-1 mt-2">
                <span className="font-bold flex items-center gap-1 text-amber-900">💡 لتصميم قالب مخصص بخلفية ورقية (مثل تصميم من Canva):</span>
                <p>1. انتقل الآن إلى تبويب **"الإطار والخلفية"** بالأعلى.</p>
                <p>2. اضغط على **"رفع قالب مصمّم (PDF / PNG)"** لرفع خلفية شهادتك المفرغة.</p>
                <p>3. اسحب العناصر وحركها لترتيب مواضعها فوق شهادتك (يمكنك كتابة {"{name}"} في مكان الاسم).</p>
                <p>4. لحفظ وتصدير هذا القالب لاستخدامه لاحقاً، اضغط على زر **"حفظ كقالب جديد"** المخصص أعلاه.</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Canvas Frame & Background settings */}
        {sidebarTab === 'frame' && (
          <div className="space-y-4" id="global-canvas-widget">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 pb-2 border-b border-slate-100">
              <Sliders className="w-4 h-4 text-emerald-500" />
              تخصيص خلفية الشهادة المخصصة
            </h4>

            <div className="space-y-3 text-xs">
              {/* Background image upload selector */}
              <div className="space-y-1.5">
                <label className="text-slate-500 block">ارفع خلفية ورقية مخصصة بالكامل (PDF / PNG / JPG):</label>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleBackgroundUpload}
                      accept="image/*, application/pdf"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isPdfConverting}
                      className="px-3.5 py-2 bg-slate-800 disabled:bg-slate-400 text-white rounded-xl hover:bg-slate-900 font-medium flex items-center gap-1.5 transition-all text-xs outline-none cursor-pointer"
                      id="btn-upload-bg-image"
                    >
                      <Upload className="w-3.5 h-3.5" /> 
                      {isPdfConverting ? 'جاري تحويل الـ PDF...' : 'رفع قالب مصمّم (PDF / PNG)'}
                    </button>
                    {backgroundImageUrl && (
                      <button
                        type="button"
                        onClick={clearBackgroundImage}
                        className="text-red-500 hover:text-red-700 font-semibold text-xs cursor-pointer"
                        id="btn-clear-bg-image"
                      >
                        حذف وإرجاع الافتراضي
                      </button>
                    )}
                  </div>

                  {backgroundImageUrl && (
                    <button
                      type="button"
                      onClick={onApplyEmptyTemplateLayout}
                      className="w-full mt-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm outline-none cursor-pointer"
                      id="btn-apply-empty-mode"
                    >
                      <Sparkles className="w-3 text-amber-300" />
                      تطبيق وضع القالب المفرّغ (إبقاء الاسم وتفاصيل السند فقط)
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Selected Element properties */}
        {sidebarTab === 'element' && (
          selectedElement ? (
            <div className="space-y-4" id="elem-props-widget">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-indigo-600" />
                  تعديل خصائص العنصر المحدد
                </h4>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => duplicateElement(selectedElement.id)}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-lg transition-all cursor-pointer"
                    title="تكرار العنصر"
                    id="btn-dup-element"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteElement(selectedElement.id)}
                    className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 rounded-lg transition-all cursor-pointer"
                    title="حذف العنصر"
                    id="btn-del-element"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* TEXT SPECIAL SETTINGS */}
              {selectedElement.type === 'text' && (
                <div className="space-y-4">
                  {/* Text string edit area */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-500 block font-sans">محتوى النص (يدعم المتغيرات والتنسيقات):</label>
                    <textarea
                      ref={textareaRef}
                      dir="auto"
                      value={selectedElement.content}
                      onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })}
                      onBlur={commitChange}
                      rows={3}
                      className="w-full bg-slate-50 border border-slate-200 p-2 text-xs rounded-xl text-slate-800 focus:outline-none focus:border-indigo-400 leading-relaxed text-right font-sans font-medium"
                      id="prop-text-content"
                    />
                    {/* Quick Variables insertion tags */}
                    <div className="flex flex-wrap gap-1 pt-1">
                      <span className="text-[10px] text-slate-400 font-sans w-full block">إدراج متغير:</span>
                      {[
                        { tag: '{name}', name: 'الاسم' },
                        { tag: '{workshop}', name: 'الورشة' },
                        { tag: '{date}', name: 'التاريخ' },
                        { tag: '{hours}', name: 'الساعات' },
                        { tag: '{instructor}', name: 'المدرب' },
                        { tag: '{serial}', name: 'الرقم المرجعي' },
                        { tag: '{organization}', name: 'الجهة' },
                      ].map((badge) => (
                        <button
                          key={badge.tag}
                          type="button"
                          onClick={() => insertTextAtCursor(badge.tag)}
                          className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[9px] px-2 py-0.5 rounded transition-all font-sans font-semibold cursor-pointer"
                        >
                          +{badge.name}
                        </button>
                      ))}
                    </div>

                    {/* Inline Text Formatting Toolbar */}
                    <div className="space-y-1 pt-1">
                      <span className="text-[10px] text-slate-400 font-sans w-full block">تنسيق أجزاء النص المحددة:</span>
                      <div className="flex flex-wrap gap-1 p-1 bg-slate-50 border border-slate-100 rounded-xl">
                        <button
                          type="button"
                          onClick={() => {
                            const textarea = textareaRef.current;
                            const savedSel = textarea ? { start: textarea.selectionStart, end: textarea.selectionEnd } : undefined;
                            insertFormattingTag('**', '**', savedSel);
                          }}
                          className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 transition-all flex items-center gap-1 cursor-pointer"
                          title="عريض (Bold)"
                        >
                          <Bold className="w-3 h-3" /> عريض
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const textarea = textareaRef.current;
                            const savedSel = textarea ? { start: textarea.selectionStart, end: textarea.selectionEnd } : undefined;
                            insertFormattingTag('*', '*', savedSel);
                          }}
                          className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[10px] italic text-slate-700 transition-all flex items-center gap-1 cursor-pointer"
                          title="مائل (Italic)"
                        >
                          <Italic className="w-3 h-3" /> مائل
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const textarea = textareaRef.current;
                            const savedSel = textarea ? { start: textarea.selectionStart, end: textarea.selectionEnd } : undefined;
                            insertFormattingTag('_', '_', savedSel);
                          }}
                          className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[10px] text-slate-700 transition-all flex items-center gap-1 cursor-pointer"
                          title="مسطر (Underline)"
                        >
                          <span className="underline font-sans font-bold text-[9px]">U</span> مسطر
                        </button>
                        {/* Color picker — no dialog needed */}
                        <label
                          className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[10px] text-slate-700 transition-all flex items-center gap-1 cursor-pointer relative"
                          title="تلوين النص المحدد"
                        >
                          <span className="w-2 h-2 rounded-full bg-gradient-to-tr from-amber-400 to-red-500 border border-yellow-300 block" />
                          لون
                          <input
                            type="color"
                            defaultValue="#ca8a04"
                            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                            onChange={(e) => {
                              const textarea = textareaRef.current;
                              const savedSel = textarea ? { start: textarea.selectionStart, end: textarea.selectionEnd } : undefined;
                              insertFormattingTag(`[color:${e.target.value}](`, ')', savedSel);
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={async () => {
                            const textarea = textareaRef.current;
                            const savedSel = textarea ? { start: textarea.selectionStart, end: textarea.selectionEnd } : undefined;
                            const scale = await customPrompt('أدخل الحجم النسبي (مثال: 150% أو 1.5 لتكبير الحجم بمرة ونصف):', '150%');
                            if (scale) {
                              insertFormattingTag(`[size:${scale}](`, ')', savedSel);
                            }
                          }}
                          className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[10px] text-slate-700 transition-all flex items-center gap-1 cursor-pointer"
                          title="حجم نسبي (Size)"
                        >
                          <span className="font-mono text-[9px] font-bold">A+</span> حجم
                        </button>
                      </div>
                    </div>

                    {/* Format Syntax Help Guide */}
                    <div className="bg-slate-50 border border-slate-100 p-2 rounded-xl text-[9px] text-slate-400 leading-relaxed space-y-0.5">
                      <span className="font-bold text-slate-500 block">💡 تلميح للتنسيق المتقدم:</span>
                      <p>• استخدم `**نص عريض**` و `*مائل*` و `_تحته خط_` لتنسيق أجزاء محددة.</p>
                      <p>• تلوين جزء: `[color:#hex](نص)` أو تغيير حجمه: `[size:150%](نص)`.</p>
                    </div>
                  </div>

                  {/* Grid for font styling parameters */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    {/* Font Family Selection */}
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-500 block">نوع الخط:</label>
                      <CustomSelect
                        value={selectedElement.fontFamily}
                        onChange={(val) => {
                          updateElement(selectedElement.id, { fontFamily: val });
                          commitChange();
                        }}
                        options={GOOGLE_FONTS.map(font => ({ value: font.family, label: font.name }))}
                        placeholder="اختر الخط..."
                        id="select-font-family"
                      />
                    </div>

                    {/* Text alignments */}
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-500 block">محاذاة النص:</label>
                      <div className="grid grid-cols-4 bg-slate-100 p-0.5 rounded-lg text-slate-500">
                        <button
                          onClick={() => { updateElement(selectedElement.id, { align: 'right' }); commitChange(); }}
                          className={`p-1 flex items-center justify-center rounded cursor-pointer ${selectedElement.align === 'right' ? 'bg-white text-indigo-700 shadow-sm font-bold' : 'hover:text-slate-800'}`}
                        >
                          <AlignRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { updateElement(selectedElement.id, { align: 'center' }); commitChange(); }}
                          className={`p-1 flex items-center justify-center rounded cursor-pointer ${selectedElement.align === 'center' ? 'bg-white text-indigo-700 shadow-sm font-bold' : 'hover:text-slate-800'}`}
                        >
                          <AlignCenter className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { updateElement(selectedElement.id, { align: 'left' }); commitChange(); }}
                          className={`p-1 flex items-center justify-center rounded cursor-pointer ${selectedElement.align === 'left' ? 'bg-white text-indigo-700 shadow-sm font-bold' : 'hover:text-slate-800'}`}
                        >
                          <AlignLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { updateElement(selectedElement.id, { align: 'justify' }); commitChange(); }}
                          className={`p-1 flex items-center justify-center rounded cursor-pointer ${selectedElement.align === 'justify' ? 'bg-white text-indigo-700 shadow-sm font-bold' : 'hover:text-slate-800'}`}
                        >
                          <AlignJustify className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Text direction */}
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-500 block">اتجاه الكتابة:</label>
                      <div className="grid grid-cols-3 bg-slate-100 p-0.5 rounded-lg text-slate-500">
                        <button
                          onClick={() => { updateElement(selectedElement.id, { direction: 'rtl' }); commitChange(); }}
                          className={`p-1 flex items-center justify-center rounded cursor-pointer ${selectedElement.direction === 'rtl' ? 'bg-white text-indigo-700 shadow-sm font-bold' : 'hover:text-slate-800'}`}
                          title="من اليمين إلى اليسار"
                        >
                          <span className="text-xs font-bold">RTL</span>
                        </button>
                        <button
                          onClick={() => { updateElement(selectedElement.id, { direction: 'ltr' }); commitChange(); }}
                          className={`p-1 flex items-center justify-center rounded cursor-pointer ${selectedElement.direction === 'ltr' ? 'bg-white text-indigo-700 shadow-sm font-bold' : 'hover:text-slate-800'}`}
                          title="من اليسار إلى اليمين"
                        >
                          <span className="text-xs font-bold">LTR</span>
                        </button>
                        <button
                          onClick={() => { updateElement(selectedElement.id, { direction: 'auto' }); commitChange(); }}
                          className={`p-1 flex items-center justify-center rounded cursor-pointer ${selectedElement.direction === 'auto' || !selectedElement.direction ? 'bg-white text-indigo-700 shadow-sm font-bold' : 'hover:text-slate-800'}`}
                          title="تلقائي"
                        >
                          <Languages className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Font Size slider and numeric input */}
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-500 block flex justify-between">
                        <span>حجم الخط الأساسي:</span>
                        <span className="font-mono text-slate-700 font-bold">{selectedElement.fontSize}pt</span>
                      </label>
                      <div className="flex gap-2 items-center">
                        <input
                          type="range"
                          min="8"
                          max="150"
                          value={selectedElement.fontSize}
                          onChange={(e) => updateElement(selectedElement.id, { fontSize: parseInt(e.target.value) || 12 })}
                          onMouseUp={commitChange}
                          className="flex-1 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                        <input
                          type="number"
                          min="6"
                          max="250"
                          value={selectedElement.fontSize}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            updateElement(selectedElement.id, { fontSize: isNaN(val) ? 12 : val });
                          }}
                          onBlur={commitChange}
                          className="w-12 bg-slate-50 border border-slate-200 py-1 rounded text-xs text-slate-750 text-center font-mono focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Text Color Picker */}
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-500 block flex justify-between">
                        <span>اللون الأساسي:</span>
                        <span className="font-mono uppercase text-slate-700 text-[10px]">{selectedElement.color}</span>
                      </label>
                      <div className="flex gap-1.5 items-center">
                        <input
                          type="color"
                          value={selectedElement.color}
                          onChange={(e) => updateElement(selectedElement.id, { color: e.target.value })}
                          onBlur={commitChange}
                          className="w-7 h-7 bg-transparent border-0 rounded cursor-pointer"
                        />
                        <input
                          type="text"
                          value={selectedElement.color}
                          onChange={(e) => updateElement(selectedElement.id, { color: e.target.value })}
                          onBlur={commitChange}
                          className="w-full bg-slate-50 border border-slate-200 px-2 py-1 rounded text-xs text-slate-700 text-center font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bold, Italic style triggers */}
                  <div className="flex items-center gap-3 border-t border-slate-100 pt-3">
                    <div className="flex bg-slate-100 p-0.5 rounded-lg text-slate-500">
                      <button
                        onClick={() => { 
                          updateElement(selectedElement.id, { fontWeight: selectedElement.fontWeight === 'bold' ? 'normal' : 'bold' });
                          commitChange(); 
                        }}
                        className={`px-2.5 py-1.5 rounded flex items-center gap-1 text-[11px] cursor-pointer ${selectedElement.fontWeight === 'bold' ? 'bg-white text-indigo-700 shadow-sm font-bold' : 'hover:text-slate-800'}`}
                      >
                        <Bold className="w-3.5 h-3.5" /> عريض
                      </button>
                      <button
                        onClick={() => { 
                          updateElement(selectedElement.id, { fontStyle: selectedElement.fontStyle === 'italic' ? 'normal' : 'italic' });
                          commitChange(); 
                        }}
                        className={`px-2.5 py-1.5 rounded flex items-center gap-1 text-[11px] cursor-pointer ${selectedElement.fontStyle === 'italic' ? 'bg-white text-indigo-700 shadow-sm font-bold' : 'hover:text-slate-800'}`}
                      >
                        <Italic className="w-3.5 h-3.5" /> مائل
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        updateElement(selectedElement.id, { isLocked: !selectedElement.isLocked });
                        commitChange();
                      }}
                      className={`px-3 py-1.5 rounded-lg border text-[11px] flex items-center gap-1.5 transition-all cursor-pointer ${
                        selectedElement.isLocked 
                          ? 'bg-amber-50 border-amber-300 text-amber-700 font-bold' 
                          : 'border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      {selectedElement.isLocked ? (
                        <>
                          <Lock className="w-3.5 h-3.5" /> إلغاء حظر الحركة
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3.5 h-3.5" /> حظر وقفل موقعه
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* QR CODE SPECIAL SETTINGS */}
              {selectedElement.type === 'qr' && (
                <div className="space-y-4">
                  {/* QR Foreground Color */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-500 block flex justify-between">
                      <span>لون رمز الـ QR (النقاط):</span>
                      <span className="font-mono uppercase text-slate-700 text-[10px]">{selectedElement.color || '#000000'}</span>
                    </label>
                    <div className="flex gap-1.5 items-center">
                      <input
                        type="color"
                        value={selectedElement.color || '#000000'}
                        onChange={(e) => updateElement(selectedElement.id, { color: e.target.value })}
                        onBlur={commitChange}
                        className="w-7 h-7 bg-transparent border-0 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={selectedElement.color || '#000000'}
                        onChange={(e) => updateElement(selectedElement.id, { color: e.target.value })}
                        onBlur={commitChange}
                        className="w-full bg-slate-50 border border-slate-200 px-2 py-1 rounded text-xs text-slate-750 text-center font-mono"
                      />
                    </div>
                  </div>

                  {/* QR Background Color */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-500 block flex justify-between">
                      <span>لون خلفية الـ QR:</span>
                      <span className="font-mono uppercase text-slate-700 text-[10px]">{selectedElement.qrBgColor || '#ffffff'}</span>
                    </label>
                    <div className="flex gap-1.5 items-center">
                      <input
                        type="color"
                        value={selectedElement.qrBgColor || '#ffffff'}
                        onChange={(e) => updateElement(selectedElement.id, { qrBgColor: e.target.value })}
                        onBlur={commitChange}
                        className="w-7 h-7 bg-transparent border-0 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={selectedElement.qrBgColor || '#ffffff'}
                        onChange={(e) => updateElement(selectedElement.id, { qrBgColor: e.target.value })}
                        onBlur={commitChange}
                        className="w-full bg-slate-50 border border-slate-200 px-2 py-1 rounded text-xs text-slate-750 text-center font-mono"
                      />
                    </div>
                  </div>

                  {/* QR Margin */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-500 block flex justify-between">
                      <span>حجم الهامش المحيط (Margin):</span>
                      <span className="font-mono text-slate-700 font-bold">{selectedElement.qrMargin !== undefined ? selectedElement.qrMargin : 1}px</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="8"
                      step="1"
                      value={selectedElement.qrMargin !== undefined ? selectedElement.qrMargin : 1}
                      onChange={(e) => updateElement(selectedElement.id, { qrMargin: parseInt(e.target.value) })}
                      onMouseUp={commitChange}
                      className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>

                  {/* Lock trigger */}
                  <div className="border-t border-slate-100 pt-3">
                    <button
                      onClick={() => {
                        updateElement(selectedElement.id, { isLocked: !selectedElement.isLocked });
                        commitChange();
                      }}
                      className={`w-full py-1.5 rounded-lg border text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        selectedElement.isLocked 
                          ? 'bg-amber-50 border-amber-300 text-amber-700 font-bold' 
                          : 'border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      {selectedElement.isLocked ? (
                        <>
                          <Lock className="w-3.5 h-3.5" /> إلغاء حظر الحركة
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3.5 h-3.5" /> حظر وقفل موقعه
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* SHARED COORDINATES & SIZE SLIDERS */}
              <div className="space-y-3.5 border-t border-slate-100 pt-4">
                {/* Width modifier */}
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-500 block flex justify-between">
                    <span>عرض الحاوية (% بالنسبة للشهادة):</span>
                    <span className="font-mono text-slate-700">{selectedElement.width}%</span>
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={selectedElement.width}
                    onChange={(e) => updateElement(selectedElement.id, { width: parseFloat(e.target.value) })}
                    onMouseUp={commitChange}
                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  {/* Pos X */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 block">X% أفقي:</label>
                    <input
                      type="number"
                      step="0.5"
                      value={selectedElement.x}
                      onChange={(e) => updateElement(selectedElement.id, { x: parseFloat(e.target.value) || 0 })}
                      onBlur={commitChange}
                      className="w-full bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-slate-700 font-mono text-center"
                    />
                  </div>
                  {/* Pos Y */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 block">Y% رأسي:</label>
                    <input
                      type="number"
                      step="0.5"
                      value={selectedElement.y}
                      onChange={(e) => updateElement(selectedElement.id, { y: parseFloat(e.target.value) || 0 })}
                      onBlur={commitChange}
                      className="w-full bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-slate-700 font-mono text-center"
                    />
                  </div>
                </div>

                {/* Opacity slider */}
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-500 block flex justify-between">
                    <span>درجة الشفافية (Opacity):</span>
                    <span className="font-mono text-slate-700">{selectedElement.opacity}%</span>
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={selectedElement.opacity}
                    onChange={(e) => updateElement(selectedElement.id, { opacity: parseInt(e.target.value) })}
                    onMouseUp={commitChange}
                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Empty side message */
            <div className="bg-slate-50 border border-slate-150 p-6 rounded-3xl text-center text-slate-400 space-y-2 h-64 flex flex-col items-center justify-center">
              <LayoutGrid className="w-8 h-8 text-indigo-200" />
              <p className="text-xs max-w-[200px] leading-relaxed mx-auto text-slate-500">اضغط على أي عنصر أو نص على الشهادة لتعديل خطوطه، ألوانه، حجمه أو مكانه فورياً من هنا.</p>
            </div>
          )
        )}

      </div>
    </div>
  );
}
