import React from 'react';
import { motion } from 'motion/react';

interface CertificatePreviewProps {
  data: {
    userName: string;
    score: number;
    total: number;
    date: string;
    topicName: string;
    certificateTitle?: string;
    certificateSubtitle?: string;
    certificateFooter?: string;
    certificateColor?: string;
    certificateLayout?: {
      borderWidth?: number;
      headerFontSize?: number;
      headerStyle?: 'normal' | 'bold' | 'italic' | 'bolditalic';
      subtitleFontSize?: number;
      subtitleStyle?: 'normal' | 'bold' | 'italic' | 'bolditalic';
      nameFontSize?: number;
      nameStyle?: 'normal' | 'bold' | 'italic' | 'bolditalic';
      bodyFontSize?: number;
      footerFontSize?: number;
      footerStyle?: 'normal' | 'bold' | 'italic' | 'bolditalic';
      showBackgroundPattern?: boolean;
      borderPadding?: number;
    };
  };
}

export default function CertificatePreview({ data }: CertificatePreviewProps) {
  const primaryColor = data.certificateColor || '#32befa';
  const layout = data.certificateLayout || {};
  const padding = layout.borderPadding !== undefined ? layout.borderPadding : 10;
  
  const getFontStyle = (style?: string) => {
    switch (style) {
      case 'bold': return 'font-bold';
      case 'italic': return 'italic';
      case 'bolditalic': return 'font-bold italic';
      default: return 'font-normal';
    }
  };

  return (
    <div className="w-full aspect-[1.414/1] bg-white rounded-lg shadow-2xl relative overflow-hidden flex flex-col items-center justify-center p-8 border border-black/5">
      {/* Background Pattern */}
      {layout.showBackgroundPattern !== false && (
        <div className="absolute inset-0 opacity-[0.03]" style={{ 
          backgroundImage: `linear-gradient(90deg, ${primaryColor} 1px, transparent 1px)`,
          backgroundSize: '20px 100%' 
        }} />
      )}

      {/* Borders */}
      <div 
        className="absolute inset-0 pointer-events-none" 
        style={{ 
          margin: `${padding}px`,
          border: `${layout.borderWidth || 2}px solid ${primaryColor}` 
        }} 
      />
      <div 
        className="absolute inset-0 pointer-events-none" 
        style={{ 
          margin: `${padding + 2}px`,
          border: '0.5px solid black' 
        }} 
      />

      {/* Content */}
      <div className="relative z-10 w-full text-center space-y-6">
        <h1 
          className={`${getFontStyle(layout.headerStyle || 'bold')} tracking-tight`}
          style={{ fontSize: `${(layout.headerFontSize || 40) * 0.8}px`, color: '#000' }}
        >
          {data.certificateTitle || 'CERTIFICATE OF ACHIEVEMENT'}
        </h1>

        <p 
          className={getFontStyle(layout.subtitleStyle || 'normal')}
          style={{ fontSize: `${(layout.subtitleFontSize || 18) * 0.8}px`, color: '#666' }}
        >
          {data.certificateSubtitle || 'This is to certify that'}
        </p>

        <h2 
          className={getFontStyle(layout.nameStyle || 'bold italic')}
          style={{ 
            fontSize: `${(layout.nameFontSize || 32) * 0.8}px`, 
            color: primaryColor 
          }}
        >
          {data.userName}
        </h2>

        <div className="w-48 h-[1px] bg-black/20 mx-auto" />

        <div className="space-y-2">
          <p 
            className="font-normal" 
            style={{ fontSize: `${(layout.bodyFontSize || 16) * 0.8}px`, color: '#444' }}
          >
            has successfully completed the quiz on
          </p>
          <p 
            className="font-bold" 
            style={{ fontSize: `${(layout.bodyFontSize ? (layout.bodyFontSize + 6) : 22) * 0.8}px`, color: '#000' }}
          >
            {data.topicName}
          </p>
        </div>

        <div className="flex items-center justify-center gap-2">
          <span style={{ fontSize: `${(layout.bodyFontSize || 18) * 0.8}px`, color: '#666' }}>With a score of</span>
          <span className="font-bold underline" style={{ fontSize: `${(layout.bodyFontSize || 18) * 0.8}px`, color: primaryColor }}>
            {data.score}/{data.total}
          </span>
        </div>

        <div className="pt-8 flex justify-between items-end px-12">
          <div className="text-left">
            <p className="text-[10px] text-black/40 font-bold uppercase tracking-widest">Issued on</p>
            <p className="text-sm font-bold">{data.date}</p>
          </div>
          
          <div className="text-center">
            <div className="w-32 h-[1px] bg-black mb-2" />
            <p 
              className={getFontStyle(layout.footerStyle || 'bold')}
              style={{ fontSize: `${(layout.footerFontSize || 14) * 0.8}px`, color: '#000' }}
            >
              {data.certificateFooter || 'Rahee Quiz Team'}
            </p>
          </div>
        </div>
      </div>

      {/* Decorative details */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -mr-16 -mt-16" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-primary/5 rounded-tr-full -ml-16 -mb-16" />
    </div>
  );
}
