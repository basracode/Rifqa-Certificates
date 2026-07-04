export type ElementType = 'text' | 'image' | 'qr' | 'signature' | 'badge';

export interface CertificateElement {
  id: string;
  type: ElementType;
  x: number; // percentage (0-100) or pixels? Percentage is much better for responsive resizing of the canvas!
  y: number; // percentage (0-100)
  width: number; // percentage or px
  height: number; // percentage or px
  content: string; // text content, image URL, placeholder key, etc.
  fontSize: number; // in pt or px
  color: string;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  align: 'left' | 'center' | 'right' | 'justify';
  direction?: 'ltr' | 'rtl' | 'auto';
  opacity: number;
  letterSpacing: number; // px
  isLocked: boolean;
  qrBgColor?: string;
  qrMargin?: number;
}

export interface Workshop {
  id: string;
  title: string;
  instructor: string;
  dateArabic: string;
  hours: number;
  description: string;
  serialPrefix: string;
  organizationName: string;
}

export interface Attendee {
  id: string;
  name: string;
  email: string;
  serialNumber: string;
  certificateId: string;
  // Dynamic fields from Excel can go here
  customFields?: Record<string, string>;
}

export interface FontOption {
  name: string;
  family: string;
  url?: string;
}

export interface PredefinedTemplate {
  id: string;
  name: string;
  category?: string;       // e.g. "دورة", "ورشة", "تكريم"
  thumbnailClass: string;
  backgroundStyle: string;
  borderColor: string;
  elements: Omit<CertificateElement, 'id'>[];
  backgroundImageUrl?: string;
}

export interface ExportedTemplateData {
  version: string;
  name: string;
  backgroundStyle: string;
  borderColor: string;
  backgroundImageUrl?: string;
  elements: Omit<CertificateElement, 'id'>[];
}

