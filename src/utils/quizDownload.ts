import { jsPDF } from 'jspdf';
import { Quiz } from '../types';

interface DownloadOptions {
  eventTitle: string;
  topicName: string;
  quizzes: Quiz[];
  candidateName?: string;
  candidateUsername?: string;
  results?: {
    score: number;
    total: number;
    completedAt: number;
    answers?: {
      quizId: string;
      userAnswerIndex: number;
      isCorrect: boolean;
    }[];
  };
  language?: 'en' | 'hi';
  previewOnly?: boolean;
}

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 50, g: 190, b: 250 };
};

export const downloadQuestionPaperPDF = (options: DownloadOptions) => {
  const { eventTitle, topicName, quizzes, language = 'en' } = options;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);
  let y = 15;

  // Header Banner
  doc.setFillColor(30, 41, 59); // Slate-900 background
  doc.rect(margin, y, contentWidth, 30, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('OFFICIAL QUESTION PAPER', margin + 6, y + 11);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184); // Slate-400
  doc.text(`Event: ${eventTitle.toUpperCase()}`, margin + 6, y + 17);
  doc.text(`Topic: ${topicName}`, margin + 6, y + 23);

  // Date info on the right side of the banner
  doc.setTextColor(255, 255, 255);
  doc.text(`Total Questions: ${quizzes.length}`, pageWidth - margin - 6, y + 11, { align: 'right' });
  doc.text(`Printed On: ${new Date().toLocaleDateString()}`, pageWidth - margin - 6, y + 17, { align: 'right' });

  y += 38;

  // Instructions section
  doc.setDrawColor(226, 232, 240); // Slate-200
  doc.setLineWidth(0.3);
  doc.setFillColor(248, 250, 252); // Slate-50 custom box
  doc.rect(margin, y, contentWidth, 18, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42); // Slate-900
  doc.text('GENERAL INSTRUCTIONS:', margin + 4, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105); // Slate-600
  doc.text('1. Read each question carefully before attempting.', margin + 4, y + 10);
  doc.text('2. All questions are multiple-choice. Choose the single best response.', margin + 4, y + 14);

  y += 24;

  // Questions Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('SECTION A: MULTIPLE CHOICE QUESTIONS', margin, y);
  
  doc.setDrawColor(50, 190, 250); // Primary color underline
  doc.setLineWidth(0.8);
  doc.line(margin, y + 2, margin + 40, y + 2);

  y += 10;

  quizzes.forEach((quiz, index) => {
    // Check page overflow
    if (y > pageHeight - 30) {
      doc.addPage();
      y = 20;
    }

    // Question number and text
    const qNumber = `${index + 1}. `;
    const qTextEn = quiz.question?.en || '';
    const qTextHi = quiz.question?.hi || '';
    const questionTextStr = language === 'hi' && qTextHi ? qTextHi : qTextEn;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);

    const questionLines = doc.splitTextToSize(questionTextStr, contentWidth - 10);
    
    // Check if question + options will overflow, if so addPage
    let estimatedHeight = (questionLines.length * 5) + 24; // text lines plus options
    if (y + estimatedHeight > pageHeight - 20) {
      doc.addPage();
      y = 20;
    }

    doc.text(qNumber, margin, y);
    doc.text(questionLines, margin + 6, y);

    y += (questionLines.length * 5) + 1;

    // Optional second language text if available and selected language has translation
    if (language === 'hi' && qTextEn && qTextHi) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      const subLines = doc.splitTextToSize(`English: ${qTextEn}`, contentWidth - 10);
      doc.text(subLines, margin + 6, y);
      y += (subLines.length * 4) + 1;
    }

    // MCQ Options
    const optEn = quiz.options?.en || [];
    const optHi = quiz.options?.hi || [];
    const optionsToShow = language === 'hi' && optHi.length > 0 ? optHi : optEn;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85); // Slate-700

    optionsToShow.forEach((opt, optIdx) => {
      const optLetter = `[  ]  ${String.fromCharCode(65 + optIdx)})  `;
      const optionTextLines = doc.splitTextToSize(opt, contentWidth - 25);
      
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(148, 163, 184); // Grey brackets
      doc.text(optLetter, margin + 8, y);
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.text(optionTextLines, margin + 21, y);

      y += (optionTextLines.length * 4.5) + 1;
    });

    y += 4; // space between questions
  });

  // Save the PDF
  if (options.previewOnly) {
    return doc;
  }
  const filename = `Question_Paper_${eventTitle.replace(/\s+/g, '_')}.pdf`;
  doc.save(filename);
};

export const downloadAnswerSheetPDF = (options: DownloadOptions) => {
  const { eventTitle, topicName, quizzes, results, candidateName = 'Player', candidateUsername, language = 'en' } = options;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);
  let y = 15;

  // Header Banner - enlarged to accommodate both Name & Username
  doc.setFillColor(15, 23, 42); // Slate-900 background
  doc.rect(margin, y, contentWidth, 38, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('OFFICIAL OMR ANSWER SHEET', margin + 6, y + 10);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184); // Slate-400
  doc.text(`Event Name: ${eventTitle}`, margin + 6, y + 16);
  doc.text(`Topic Name: ${topicName}`, margin + 6, y + 21);
  doc.text(`Candidate Name: ${candidateName.toUpperCase()}`, margin + 6, y + 26);
  if (candidateUsername) {
    doc.text(`Candidate Username: @${candidateUsername.replace(/^@/, '')}`, margin + 6, y + 31);
  } else {
    doc.text(`Candidate Username: @${candidateName.toLowerCase().replace(/\s+/g, '_')}`, margin + 6, y + 31);
  }

  // Stats badge on the right of banner
  doc.setFillColor(30, 41, 59); // background for stats block
  doc.rect(pageWidth - margin - 55, y + 4, 49, 30, 'F');
  doc.setDrawColor(50, 190, 250);
  doc.setLineWidth(0.5);
  doc.rect(pageWidth - margin - 55, y + 4, 49, 30, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(52, 211, 153); // Emerald-400
  doc.text('SCORE REPORT', pageWidth - margin - 30, y + 9, { align: 'center' });

  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  const scoreText = results ? `${results.score}/${results.total}` : 'N/A';
  doc.text(scoreText, pageWidth - margin - 30, y + 17, { align: 'center' });

  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  const percentage = results ? Math.round((results.score / results.total) * 100) : 0;
  doc.text(`Accuracy: ${percentage}%`, pageWidth - margin - 30, y + 22, { align: 'center' });
  doc.text(`Date: ${results ? new Date(results.completedAt).toLocaleDateString() : 'N/A'}`, pageWidth - margin - 30, y + 27, { align: 'center' });

  y += 46;

  // Answers Section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('ATTEMPTED QUESTIONS & RESPONSE SHEET', margin, y);
  
  doc.setDrawColor(50, 190, 250);
  doc.setLineWidth(0.8);
  doc.line(margin, y + 2, margin + 40, y + 2);

  y += 10;

  const userAnswersMap = new Map<string, { userAnswerIndex: number, isCorrect: boolean }>();
  if (results?.answers) {
    results.answers.forEach(ans => {
      userAnswersMap.set(ans.quizId, {
        userAnswerIndex: ans.userAnswerIndex,
        isCorrect: ans.isCorrect
      });
    });
  }

  // Filter quizzes to only show attempted ones!
  const attemptedQuizzes = quizzes.filter(quiz => {
    const attempt = userAnswersMap.get(quiz.id);
    return attempt !== undefined && attempt.userAnswerIndex !== -1 && attempt.userAnswerIndex !== undefined;
  });

  if (attemptedQuizzes.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text('No questions were attempted in this exam/session.', margin, y + 5);
  } else {
    attemptedQuizzes.forEach((quiz, index) => {
      // Check overflow
      if (y > pageHeight - 30) {
        doc.addPage();
        y = 20;
      }

      const qNumber = `${index + 1}. `;
      const qTextEn = quiz.question?.en || '';
      const qTextHi = quiz.question?.hi || '';
      const questionTextStr = language === 'hi' && qTextHi ? qTextHi : qTextEn;

      // Fetch user attempt
      const attempt = userAnswersMap.get(quiz.id);
      const attempted = attempt !== undefined && attempt.userAnswerIndex !== -1;
      const isCorrect = attempt?.isCorrect || false;

      // Check heights
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      const questionLines = doc.splitTextToSize(questionTextStr, contentWidth - 10);
      let estimatedHeight = (questionLines.length * 4.5) + 26; // Q text + options + correct indicator
      
      if (y + estimatedHeight > pageHeight - 20) {
        doc.addPage();
        y = 20;
      }

      // Output Question Row
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(qNumber, margin, y);
      doc.text(questionLines, margin + 6, y);

      y += (questionLines.length * 4.5) + 1.5;

      // Option printing
      const optEn = quiz.options?.en || [];
      const optHi = quiz.options?.hi || [];
      const optionsToShow = language === 'hi' && optHi.length > 0 ? optHi : optEn;

      optionsToShow.forEach((opt, optIdx) => {
        const isChosen = attempted && attempt.userAnswerIndex === optIdx;
        const isCorrectOption = quiz.correctAnswerIndex === optIdx;

        // Draw OMR bubble circle
        const circleX = margin + 11;
        const circleY = y - 1.2;
        const r = 2.2;

        if (isChosen) {
          if (isCorrect) {
            // Chosen correct: Emerald Solid Fill
            doc.setFillColor(16, 185, 129);
            doc.setDrawColor(16, 185, 129);
            doc.circle(circleX, circleY, r, 'F');
            doc.setTextColor(255, 255, 255);
          } else {
            // Chosen wrong: Red Solid Fill
            doc.setFillColor(239, 68, 68);
            doc.setDrawColor(239, 68, 68);
            doc.circle(circleX, circleY, r, 'F');
            doc.setTextColor(255, 255, 255);
          }
        } else if (isCorrectOption) {
          // Correct but not chosen: Light green fill, green outline
          doc.setFillColor(209, 250, 229);
          doc.setDrawColor(52, 211, 153);
          doc.circle(circleX, circleY, r, 'FD');
          doc.setTextColor(4, 120, 87);
        } else {
          // Regular option: empty slate bubble
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(148, 163, 184); // Slate 400
          doc.circle(circleX, circleY, r, 'D');
          doc.setTextColor(71, 85, 105); // Slate 600
        }

        // Draw option checkmark identifier if chosen, otherwise draw letter A/B/C/D
        doc.setFont('helvetica', 'bold');
        if (isChosen) {
          doc.setFontSize(8.5);
          doc.text('✓', circleX, circleY + 0.8, { align: 'center' });
        } else {
          doc.setFontSize(7.5);
          doc.text(String.fromCharCode(65 + optIdx), circleX, circleY + 0.8, { align: 'center' });
        }

        // Option Text drawing
        const optionTextLines = doc.splitTextToSize(opt, contentWidth - 25);
        
        // Stylize option text depending on correctness
        if (isCorrectOption) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(16, 185, 129); // Green 500
        } else if (isChosen && !isCorrect) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(239, 68, 68); // Red 500
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(71, 85, 105); // Slate 600
        }

        doc.setFontSize(9);
        doc.text(optionTextLines, margin + 18, y);

        y += (optionTextLines.length * 4.5) + 1.2;
      });

      // Score / Verdict Bar
      y += 1;
      doc.setFillColor(248, 250, 252); // Slate-50 custom box
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin + 6, y, contentWidth - 6, 6, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      if (!attempted) {
        doc.setTextColor(100, 116, 139); // Slate 500
        doc.text('STATUS: NOT ATTEMPTED', margin + 9, y + 4.2);
      } else if (isCorrect) {
        doc.setTextColor(16, 185, 129); // Green 500
        doc.text(`STATUS: CORRECT (Chosen Option: ${String.fromCharCode(65 + attempt.userAnswerIndex)})`, margin + 9, y + 4.2);
      } else {
        doc.setTextColor(239, 68, 68); // Red 500
        doc.text(`STATUS: INCORRECT (Attempted: ${String.fromCharCode(65 + attempt.userAnswerIndex)} | Correct Option: ${String.fromCharCode(65 + quiz.correctAnswerIndex)})`, margin + 9, y + 4.2);
      }

      // Explanation if available and space supports it
      const explanationText = language === 'hi' && quiz.explanation?.hi ? quiz.explanation.hi : quiz.explanation?.en;
      if (explanationText) {
        y += 7.5;
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        const isCorrectText = isCorrect ? 'Explanation: ' : 'Correct Logic: ';
        const expLines = doc.splitTextToSize(isCorrectText + explanationText, contentWidth - 12);
        
        if (y + (expLines.length * 3.5) > pageHeight - 15) {
          doc.addPage();
          y = 20;
        }
        doc.text(expLines, margin + 6, y);
        y += (expLines.length * 3.5);
      } else {
        y += 6;
      }

      y += 5; // space between questions
    });
  }

  // Save the PDF
  if (options.previewOnly) {
    return doc;
  }
  const filename = `OMR_Sheet_${candidateName.replace(/\s+/g, '_')}_${eventTitle.replace(/\s+/g, '_')}.pdf`;
  doc.save(filename);
};
