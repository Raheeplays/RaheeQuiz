import React from 'react';
import { motion } from 'motion/react';
import { ShoppingBag, Coins, Zap, RefreshCw, X, CheckCircle } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { db } from '../firebase/config';
import { ref, update } from 'firebase/database';
import { translations } from '../translations';
import { cn } from '../lib/utils';

export default function Shop({ onClose, language }: { onClose: () => void, language: string }) {
  const { currentUser } = useUser();
  const t = translations[language as 'en' | 'hi'] || translations.en;

  const items = [
    {
      id: 'fiftyFifty',
      name: t.fiftyFifty,
      desc: language === 'en' ? 'Remove two wrong options from the current quiz' : 'वर्तमान प्रश्नोत्तरी से दो गलत विकल्प हटाएँ',
      cost: 50,
      icon: Zap,
      color: 'text-yellow-500',
      bg: 'bg-yellow-500/10',
    },
    {
      id: 'changeQuiz',
      name: t.changeQuiz,
      desc: language === 'en' ? 'Skip the current quiz and move to the next one' : 'वर्तमान प्रश्नोत्तरी छोड़ें और अगले प्रश्न पर जाएँ',
      cost: 100,
      icon: RefreshCw,
      color: 'text-primary',
      bg: 'bg-primary/10',
    }
  ];

  const buyItem = async (itemId: string, cost: number) => {
    if (!currentUser) return;
    if ((currentUser.raheeCoins || 0) < cost) {
      alert(t.notEnoughCoins);
      return;
    }

    const currentCount = currentUser.lifelines?.[itemId as 'fiftyFifty' | 'changeQuiz'] || 0;
    const newLifelines = {
      ...currentUser.lifelines,
      [itemId]: currentCount + 1
    };

    await update(ref(db, `users/${currentUser.id}`), {
      raheeCoins: currentUser.raheeCoins - cost,
      lifelines: newLifelines
    });
    
    alert(t.purchased);
  };

  return (
    <div className="bg-[#0a0a0a] rounded-[2.5rem] border border-white/5 overflow-hidden flex flex-col h-full max-h-[85vh]">
      {/* Header */}
      <div className="p-8 flex items-center justify-between border-b border-white/5 bg-black/40 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
            <ShoppingBag size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tighter text-white uppercase">{t.shop}</h2>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">Upgrade your arsenal</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-2xl border border-primary/20">
           <Coins size={16} className="text-primary italic" />
           <span className="text-primary font-black">{currentUser?.raheeCoins || 0}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {items.map((item, i) => (
          <motion.div 
            key={item.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            className="p-6 bg-white/5 rounded-3xl border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-6 hover:border-white/10 transition-all group"
          >
            <div className="flex items-center gap-6">
              <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-lg transition-transform group-hover:scale-110 duration-500", item.bg, item.color)}>
                 <item.icon size={32} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                   <h3 className="text-lg font-black text-white">{item.name}</h3>
                   <span className="text-[8px] font-black uppercase tracking-widest text-white/20 px-1.5 py-0.5 bg-white/5 rounded border border-white/5">
                      {currentUser?.lifelines?.[item.id as 'fiftyFifty' | 'changeQuiz'] || 0} Owned
                   </span>
                </div>
                <p className="text-white/40 text-xs font-medium leading-relaxed max-w-sm">{item.desc}</p>
              </div>
            </div>

            <button 
              onClick={() => buyItem(item.id, item.cost)}
              className="flex items-center justify-center gap-2 px-8 py-4 bg-primary text-black rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
            >
              {currentUser?.raheeCoins && currentUser.raheeCoins >= item.cost ? (
                <>
                  <ShoppingBag size={14} />
                  <span>{item.cost} Coins</span>
                </>
              ) : (
                <span className="opacity-50">{item.cost} Coins</span>
              )}
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
