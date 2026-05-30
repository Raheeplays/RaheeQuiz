import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

interface CertificateData {
  userName: string;
  score: number;
  total: number;
  date: string;
  topicName: string;
  subTopicName?: string;
  subSubTopicName?: string;
  certificateTitle?: string;
  certificateSubtitle?: string;
  certificateFooter?: string;
  certificateColor?: string;
  previewOnly?: boolean;
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
}

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 50, g: 190, b: 250 }; // default primary
};

export const generateCertificate = (data: CertificateData) => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const primaryColor = hexToRgb(data.certificateColor || '#32befa');
  const layout = data.certificateLayout || {};
  const padding = layout.borderPadding || 10;

  // Draw border
  doc.setDrawColor(primaryColor.r, primaryColor.g, primaryColor.b); // Primary color
  doc.setLineWidth(layout.borderWidth || 2);
  doc.rect(padding, padding, pageWidth - (padding * 2), pageHeight - (padding * 2));
  
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(padding + 2, padding + 2, pageWidth - (padding * 2) - 4, pageHeight - (padding * 2) - 4);

  // Background pattern
  if (layout.showBackgroundPattern !== false) {
    doc.setDrawColor(240, 240, 240);
    for (let i = 0; i < pageWidth; i += 20) {
      doc.line(i, 0, i, pageHeight);
    }
  }

  // Header
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', layout.headerStyle || 'bold');
  doc.setFontSize(layout.headerFontSize || 40);
  const title = data.certificateTitle || 'CERTIFICATE OF ACHIEVEMENT';
  doc.text(title, pageWidth / 2, 45, { align: 'center' });

  // Subtitle
  doc.setFont('helvetica', layout.subtitleStyle || 'normal');
  doc.setFontSize(layout.subtitleFontSize || 18);
  const subtitle = data.certificateSubtitle || 'This is to certify that';
  doc.text(subtitle, pageWidth / 2, 65, { align: 'center' });

  // Name
  doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.setFontSize(layout.nameFontSize || 32);
  doc.setFont('helvetica', layout.nameStyle || 'bold italic');
  doc.text(data.userName, pageWidth / 2, 85, { align: 'center' });
  
  // Line under name
  doc.setDrawColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.setLineWidth(1);
  doc.line(70, 90, pageWidth - 70, 90);

  // Description
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(layout.bodyFontSize || 16);
  let desc = `has successfully completed the quiz on`;
  doc.text(desc, pageWidth / 2, 105, { align: 'center' });

  // Topic
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(layout.bodyFontSize ? layout.bodyFontSize + 6 : 22);
  let topicText = data.topicName;
  if (data.subTopicName) topicText += ` - ${data.subTopicName}`;
  if (data.subSubTopicName) topicText += ` (${data.subSubTopicName})`;
  doc.text(topicText, pageWidth / 2, 120, { align: 'center' });

  // Score
  doc.setFontSize(layout.bodyFontSize || 18);
  doc.setFont('helvetica', 'normal');
  doc.text(`With a score of `, pageWidth / 2 - 20, 140, { align: 'right' });
  doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.score}/${data.total}`, pageWidth / 2 - 18, 140, { align: 'left' });
  
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  const percentage = Math.round((data.score / data.total) * 100);
  doc.text(`accuracy: ${percentage}%`, pageWidth / 2, 150, { align: 'center' });

  // Metadata Encryption (Simple XOR)
  const xorEncrypt = (text: string, key: string) => {
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(result); // Base64 encode for metadata safety
  };

  const encryptionKey = 'RaheeQuiz';
  const metaName = data.userName;
  const encryptedName = xorEncrypt(metaName, encryptionKey);
  const encryptedKey = xorEncrypt(encryptionKey, encryptionKey); // Self-encrypted key for proof of process

  // Add Metadata
  doc.setProperties({
    title: `Rahee Quiz Certificate - ${data.userName}`,
    subject: `Topic: ${data.topicName}`,
    author: 'Rahee Quiz Enterprise',
    keywords: `rahee, quiz, ${data.topicName}, verified, ${metaName}`,
    creator: 'Rahee Quiz Engine'
  });

  // Custom metadata strings in PDF info dictionaries aren't always accessible via setProperties, 
  // but we can add them as hidden text or just standard properties.
  // Most PDF viewers show "Subject" and "Keywords".
  // We'll put the "Human Readable" info in Keywords and the "Encrypted" info in specialized fields if possible, 
  // or just append to keywords.
  doc.setProperties({
    keywords: `Player: ${metaName}, Key: ${encryptionKey}, Encrypted: ${encryptedName}|${encryptedKey}`
  });

  // Date
  doc.setFontSize(12);
  doc.text(`Issued on: ${data.date}`, 30, pageHeight - 30);

  // Footer / Signature
  doc.setFontSize(layout.footerFontSize || 14);
  doc.setFont('helvetica', layout.footerStyle || 'bold');
  doc.text(data.certificateFooter || 'Rahee Quiz Team', pageWidth - 70, pageHeight - 30, { align: 'center' });
  doc.setLineWidth(0.5);
  doc.line(pageWidth - 100, pageHeight - 35, pageWidth - 40, pageHeight - 35);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Authorized Signature', pageWidth - 70, pageHeight - 25, { align: 'center' });

  // Save the PDF
  if (data.previewOnly) {
    return doc;
  }
  doc.save(`certificate_${data.userName.replace(/\s+/g, '_')}_${data.topicName.replace(/\s+/g, '_')}.pdf`);
  return doc;
};
