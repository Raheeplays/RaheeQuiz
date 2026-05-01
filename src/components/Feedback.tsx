import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Star, CheckCircle, ChevronLeft } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { db } from '../firebase/config';
import { ref, push, set } from 'firebase/database';
import { cn } from '../lib/utils';
import { translations } from '../translations';

interface FeedbackProps {
  onClose: () => void;
}

export default function Feedback({ onClose }: FeedbackProps) {
  const { currentUser } = useUser();
  const lang = currentUser?.language || 'en';
  const t = translations[lang] || translations.en;

  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [name, setName] = useState(currentUser?.name || '');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0 || !comment.trim()) return;

    setIsSubmitting(true);
    try {
      const feedbackRef = push(ref(db, 'feedback'));
      await set(feedbackRef, {
        id: feedbackRef.key,
        userId: currentUser?.id || 'anonymous',
        userName: name,
        email: email,
        rating: rating,
        comment: comment,
        timestamp: Date.now(),
        status: 'new'
      });
      setIsSent(true);
      setTimeout(() => {
        onClose();
      }, 3000);
    } catch (error) {
      console.error("Error submitting feedback:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSent) {
    return (
      <div className="fixed inset-0 z-[200] flex items-end justify-end p-6 pointer-events-none">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="bg-white dark:bg-[#0c0f14] border border-black/5 dark:border-white/[0.05] p-6 rounded-[2rem] shadow-2xl pointer-events-auto max-w-sm"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center text-green-500 shrink-0">
               <CheckCircle size={24} />
            </div>
            <div>
               <h3 className="font-bold text-black dark:text-white text-lg leading-tight">{t.feedbackSent || 'Feedback Sent!'}</h3>
               <p className="text-black/40 dark:text-[#a1a1a1]/60 text-xs mt-1">{t.feedbackThankYou || 'Thank you for helping us improve Rahee cards.'}</p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
       <motion.div 
         initial={{ scale: 0.9, opacity: 0, y: 20 }}
         animate={{ scale: 1, opacity: 1, y: 0 }}
         className="bg-white dark:bg-[#0c0f14] w-full max-w-sm rounded-[2rem] border border-black/5 dark:border-white/[0.05] overflow-hidden shadow-2xl"
       >
          <div className="p-8">
             <h2 className="text-3xl font-black text-black dark:text-white mb-2 leading-tight tracking-tight">{t.feedbackTitle || 'Player Feedback'}</h2>
             <p className="text-black/40 dark:text-[#a1a1a1]/60 text-sm font-medium mb-10 leading-relaxed max-w-[280px]">
                {t.feedbackSub || 'We value your opinion. Let us know how we can improve.'}
             </p>

             <form onSubmit={handleSubmit} className="space-y-8">
                <div className="space-y-6">
                   <div className="space-y-2">
                      <label className="text-sm font-bold text-black/60 dark:text-white/60 ml-0.5 uppercase tracking-widest">{t.yourName || 'Your Name'}</label>
                      <input 
                        type="text" 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your Name"
                        className="w-full bg-black/5 dark:bg-[#111419] border border-black/5 dark:border-white/[0.05] rounded-xl px-5 py-4 text-base font-bold text-black dark:text-white outline-none focus:border-primary transition-all placeholder:opacity-20"
                        required
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-sm font-bold text-black/60 dark:text-white/60 ml-0.5 uppercase tracking-widest">{t.email || 'Email'}</label>
                      <input 
                        type="email" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="player@example.com"
                        className="w-full bg-black/5 dark:bg-[#111419] border border-black/5 dark:border-white/[0.05] rounded-xl px-5 py-4 text-base font-bold text-black dark:text-white outline-none focus:border-primary transition-all placeholder:opacity-20 font-mono"
                      />
                   </div>
                </div>

                <div className="space-y-2">
                   <label className="text-sm font-bold text-black/60 dark:text-white/60 ml-0.5 uppercase tracking-widest">{t.rating || 'Rating'}</label>
                   <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onMouseEnter={() => setHoveredRating(star)}
                          onMouseLeave={() => setHoveredRating(0)}
                          onClick={() => setRating(star)}
                          className="transition-all active:scale-75"
                        >
                          <Star 
                            size={36} 
                            className={cn(
                              "transition-all stroke-[1.5]",
                              (hoveredRating || rating) >= star ? "text-[#32befa] fill-[#32befa]" : "text-black/10 dark:text-white/10"
                            )} 
                          />
                        </button>
                      ))}
                   </div>
                </div>

                <div className="space-y-2">
                   <label className="text-sm font-bold text-black/60 dark:text-white/60 ml-0.5 uppercase tracking-widest">{t.feedback || 'Feedback'}</label>
                   <textarea 
                     value={comment}
                     onChange={(e) => setComment(e.target.value)}
                     placeholder={t.tellUs || "Tell us what you think..."}
                     className="w-full bg-black/5 dark:bg-[#111419] border border-black/5 dark:border-white/[0.05] rounded-xl px-5 py-5 text-base font-bold text-black dark:text-white outline-none focus:border-primary transition-all min-h-[160px] resize-none placeholder:opacity-20"
                     required
                   />
                </div>

                <div className="pt-4 space-y-3">
                   <button 
                     type="button"
                     onClick={onClose}
                     className="w-full bg-black/5 dark:bg-[#161a21] text-black/60 dark:text-white/60 font-bold py-5 rounded-xl hover:bg-black/10 dark:hover:bg-white/5 transition-all active:scale-[0.98] flex items-center justify-center border border-black/5 dark:border-white/[0.05]"
                   >
                     {t.backToMenu || 'Back to Menu'}
                   </button>
                   <button 
                     type="submit"
                     disabled={isSubmitting || rating === 0 || !comment.trim()}
                     className="w-full bg-primary text-black font-black py-5 rounded-xl disabled:opacity-50 transition-all active:scale-[0.98] flex items-center justify-center gap-3 border border-black/5 dark:border-white/5 shadow-lg shadow-primary/20"
                   >
                     <Send size={18} className={isSubmitting ? "animate-pulse" : ""} />
                     {t.submitFeedback || 'Submit Feedback'}
                   </button>
                </div>
             </form>
          </div>
       </motion.div>
    </div>
  );
}
