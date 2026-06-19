import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Coins, Zap, RefreshCw, ShoppingBag, Heart, Users, Lightbulb, Ticket, Loader2 } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { useDialog } from '../contexts/DialogContext';
import { db } from '../firebase/config';
import { ref, update, get, push } from 'firebase/database';
import { User, Coupon } from '../types';
import { translations } from '../translations';
import { cn } from '../lib/utils';
import { useTheme } from '../contexts/ThemeContext';

export default function Shop({ onClose, language }: { onClose: () => void, language: string }) {
  const { currentUser, settings } = useUser();
  const { layoutTheme } = useTheme();
  const { alert } = useDialog();
  const [couponCode, setCouponCode] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [raheeToQuizAmt, setRaheeToQuizAmt] = useState<number>(0);
  const [quizToRaheeAmt, setQuizToRaheeAmt] = useState<number>(0);
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
      id: 'audiencePoll',
      name: 'Audience Poll',
      desc: language === 'en' ? 'Get voting percentages favoring the correct answer' : 'सही उत्तर के पक्ष में मतदान प्रतिशत प्राप्त करें',
      cost: 75,
      icon: Users,
      color: 'text-green-500',
      bg: 'bg-green-500/10',
    },
    {
      id: 'hint',
      name: 'Hint / Clue',
      desc: language === 'en' ? 'Get a useful hint to help you solve the quiz' : 'प्रश्नोत्तरी हल करने में मदद के लिए उपयोगी संकेत प्राप्त करें',
      cost: 50,
      icon: Lightbulb,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      id: 'changeQuiz',
      name: t.changeQuiz,
      desc: language === 'en' ? 'Skip the current quiz and move to the next one' : 'वर्तमान प्रश्नोत्तरी छोड़ें और अगले प्रश्न पर जाएँ',
      cost: 100,
      icon: RefreshCw,
      color: 'text-red-500',
      bg: 'bg-red-500/10',
    }
  ];

  const livesPacks = [
    { id: 'lives_1', count: 1, cost: 50 },
    { id: 'lives_5', count: 5, cost: 200 },
    { id: 'lives_max', count: 16, cost: 500, label: 'Full Refill' },
  ];

  const buyLives = async (count: number, cost: number) => {
    if (!currentUser) return;
    if ((currentUser.raheeCoins || 0) < cost) {
      await alert({ title: "Insufficient Coins", description: t.notEnoughCoins, type: 'error' });
      return;
    }

    const currentLives = currentUser.lives?.count || 0;
    const nextLives = Math.min(16, currentLives + count);

    await update(ref(db, `users/${currentUser.id}`), {
      raheeCoins: currentUser.raheeCoins - cost,
      'lives/count': nextLives,
      'lives/lastRefill': Date.now() // Reset refill timer to current time for stability or keep same?
    });
    
    await alert({ title: "Refilled!", description: `Added ${count} lives to your account.`, type: 'success' });
  };

  const buyItem = async (itemId: string, cost: number) => {
    if (!currentUser) return;
    if ((currentUser.raheeCoins || 0) < cost) {
      await alert({
        title: "Insufficient Coins",
        description: t.notEnoughCoins,
        type: 'error'
      });
      return;
    }

    const currentCount = currentUser.lifelines?.[itemId as keyof User['lifelines']] || 0;
    const newLifelines = {
      ...currentUser.lifelines,
      [itemId]: currentCount + 1
    };

    await update(ref(db, `users/${currentUser.id}`), {
      raheeCoins: currentUser.raheeCoins - cost,
      lifelines: newLifelines
    });
    
    await alert({
      title: "Purchase Successful",
      description: t.purchased,
      type: 'success'
    });
  };

  const redeemCoupon = async () => {
    if (!currentUser || !couponCode.trim()) return;
    setIsRedeeming(true);
    const code = couponCode.trim().toUpperCase();

    try {
      // 1. Check direct code first
      const couponRef = ref(db, `coupons/${code}`);
      let snapshot = await get(couponRef);
      let foundCoupon: any = null;
      let matchedCodeKey = code;

      if (snapshot.exists()) {
        foundCoupon = snapshot.val();
        matchedCodeKey = code;
      } else {
        // 2. Scan for secretLinkedCode
        const couponsSnap = await get(ref(db, 'coupons'));
        if (couponsSnap.exists()) {
          const allCoupons = couponsSnap.val();
          const matchEntry = Object.entries(allCoupons).find(([k, v]: [string, any]) => v.secretLinkedCode === code);
          if (matchEntry) {
            foundCoupon = matchEntry[1];
            matchedCodeKey = matchEntry[0];
          }
        }
      }

      if (!foundCoupon) {
        // Log failure
        await push(ref(db, `couponLogs/${currentUser.id}`), {
          userId: currentUser.id,
          userName: currentUser.name || currentUser.username || 'Unknown',
          code,
          isSuccess: false,
          error: 'Invalid Code',
          timestamp: Date.now()
        });
        await alert({ title: "Invalid Code", description: "This coupon code does not exist.", type: 'error' });
      } else {
        const maxUses = foundCoupon.maxUses !== undefined ? foundCoupon.maxUses : 1;
        const usesCount = foundCoupon.usesCount !== undefined ? foundCoupon.usesCount : (foundCoupon.isUsed ? 1 : 0);
        
        // Multi-use tracking
        const usedUsers = foundCoupon.usedUsers || {};
        const alreadyRedeemed = !!usedUsers[currentUser.id] || (maxUses === 1 && foundCoupon.isUsed && foundCoupon.usedBy === currentUser.id);
        const isFullyUsed = foundCoupon.isUsed || usesCount >= maxUses;

        if (alreadyRedeemed) {
          await push(ref(db, `couponLogs/${currentUser.id}`), {
            userId: currentUser.id,
            userName: currentUser.name || currentUser.username || 'Unknown',
            code,
            isSuccess: false,
            error: 'Already Redeemed',
            timestamp: Date.now()
          });
          await alert({ title: "Already Redeemed", description: "You have already redeemed this coupon code.", type: 'error' });
        } else if (isFullyUsed) {
          await push(ref(db, `couponLogs/${currentUser.id}`), {
            userId: currentUser.id,
            userName: currentUser.name || currentUser.username || 'Unknown',
            code,
            isSuccess: false,
            error: 'Max Limit Reached',
            timestamp: Date.now()
          });
          await alert({ title: "Expired Coupon", description: "This coupon has reached its maximum usage limit.", type: 'error' });
        } else {
          // Success!
          const nextUsesCount = usesCount + 1;
          const finished = nextUsesCount >= maxUses;

          const updates: any = {};
          updates[`coupons/${matchedCodeKey}/usesCount`] = nextUsesCount;
          updates[`coupons/${matchedCodeKey}/isUsed`] = finished;
          updates[`coupons/${matchedCodeKey}/usedUsers/${currentUser.id}`] = Date.now();
          
          if (maxUses === 1) {
            updates[`coupons/${matchedCodeKey}/usedBy`] = currentUser.id;
            updates[`coupons/${matchedCodeKey}/usedByName`] = currentUser.name || '';
            updates[`coupons/${matchedCodeKey}/usedByUsername`] = currentUser.username || '';
            updates[`coupons/${matchedCodeKey}/usedAt`] = Date.now();
          }

          updates[`users/${currentUser.id}/raheeCoins`] = (currentUser.raheeCoins || 0) + foundCoupon.value;
          
          await update(ref(db), updates);
          
          // Log success
          await push(ref(db, `couponLogs/${currentUser.id}`), {
            userId: currentUser.id,
            userName: currentUser.name || currentUser.username || 'Unknown',
            code,
            isSuccess: true,
            timestamp: Date.now()
          });

          await alert({ title: "Redeem Successful!", description: `You have successfully redeemed ${foundCoupon.value} Rahee Coins!`, type: 'success' });
          setCouponCode('');
        }
      }
    } catch (err: any) {
      await alert({ title: "Error", description: err.message, type: 'error' });
    } finally {
      setIsRedeeming(false);
    }
  };

  const convertRaheeToQuiz = async () => {
    if (!currentUser || raheeToQuizAmt <= 0) return;
    const currentRahee = currentUser.raheeCoins || 0;
    if (currentRahee < raheeToQuizAmt) {
      await alert({ title: "Exchange Failed", description: "You do not have enough Rahee Coins.", type: 'error' });
      return;
    }
    const currentQuiz = currentUser.quizCoins || 0;
    const addition = raheeToQuizAmt * 100;

    try {
      await update(ref(db, `users/${currentUser.id}`), {
        raheeCoins: currentRahee - raheeToQuizAmt,
        quizCoins: currentQuiz + addition
      });
      await alert({ 
        title: "Exchange Successful!", 
        description: `Successfully exchanged ${raheeToQuizAmt} Rahee Coins for ${addition} Quiz Coins!`, 
        type: 'success' 
      });
      setRaheeToQuizAmt(0);
    } catch (err: any) {
      await alert({ title: "Database Error", description: err.message, type: 'error' });
    }
  };

  const convertQuizToRahee = async () => {
    if (!currentUser || quizToRaheeAmt < 100) return;
    const currentQuiz = currentUser.quizCoins || 0;
    if (currentQuiz < quizToRaheeAmt) {
      await alert({ title: "Exchange Failed", description: "You do not have enough Quiz Coins.", type: 'error' });
      return;
    }
    const currentRahee = currentUser.raheeCoins || 0;
    const addition = Math.floor(quizToRaheeAmt / 100);

    try {
      await update(ref(db, `users/${currentUser.id}`), {
        quizCoins: currentQuiz - quizToRaheeAmt,
        raheeCoins: currentRahee + addition
      });
      await alert({ 
        title: "Exchange Successful!", 
        description: `Successfully exchanged ${quizToRaheeAmt} Quiz Coins for ${addition} Rahee Coins!`, 
        type: 'success' 
      });
      setQuizToRaheeAmt(0);
    } catch (err: any) {
      await alert({ title: "Database Error", description: err.message, type: 'error' });
    }
  };

  return (
    <div className="bg-white dark:bg-[#050505] rounded-[2.5rem] border border-black/5 dark:border-white/5 overflow-hidden flex flex-col h-full max-h-[85vh]">
      {/* Header */}
      <div className="p-8 flex items-center justify-between border-b border-black/5 dark:border-white/5 bg-white/40 dark:bg-black/40 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
            <ShoppingBag size={24} />
          </div>
          <div className="text-left">
            <h2 className="text-xl font-black tracking-tighter text-black dark:text-white uppercase">{t.shop}</h2>
            <p className="text-[10px] font-bold text-black/30 dark:text-white/40 uppercase tracking-widest px-1">Upgrade your arsenal</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 px-4 py-2 bg-[#32befa]/5 rounded-2xl border border-[#32befa]/10">
          <div className="flex items-center gap-1">
            <Coins size={16} className="text-[#32befa] italic" />
            <span className="text-[10px] font-black text-[#32befa]/80">Rahee Coins:</span>
            <span className="text-sm font-black text-[#32befa]">{currentUser?.raheeCoins || 0}</span>
          </div>
          <div className="w-[1px] h-3 bg-black/10 dark:bg-white/10" />
          <div className="flex items-center gap-1">
            <Coins size={16} className="text-yellow-500 italic animate-pulse" />
            <span className="text-[10px] font-black text-yellow-500/80">Quiz Coins:</span>
            <span className="text-sm font-black text-yellow-500">{currentUser?.quizCoins || 0}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Lifelines Section */}
        <section className="space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 px-2">Lifelines</p>
          {items.map((item, i) => (
            <motion.div 
              key={item.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className="p-6 bg-black/5 dark:bg-white/5 rounded-3xl border border-black/5 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-6 hover:border-black/10 dark:hover:border-white/10 transition-all group"
            >
              <div className="flex items-center gap-6">
                <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-lg transition-transform group-hover:scale-110 duration-500", item.bg, item.color)}>
                  <item.icon size={32} />
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-black text-black dark:text-white">{item.name}</h3>
                    <span className="text-[8px] font-black uppercase tracking-widest text-black/20 dark:text-white/20 px-1.5 py-0.5 bg-black/5 dark:bg-white/5 rounded border border-black/5 dark:border-white/5">
                        {currentUser?.lifelines?.[item.id as keyof User['lifelines']] || 0} Owned
                    </span>
                  </div>
                  <p className="text-black/40 dark:text-white/40 text-xs font-medium leading-relaxed max-w-sm">{item.desc}</p>
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
        </section>

        {/* Lives Section */}
        {settings?.shopLivesEnabled && (
          <section id="shop-lives" className="space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 px-2">Lives Refill</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {livesPacks.map((pack, i) => (
                <motion.button 
                  key={pack.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  onClick={() => buyLives(pack.count, pack.cost)}
                  className="p-6 bg-red-500/5 dark:bg-red-500/10 rounded-3xl border border-red-500/10 hover:border-red-500/30 transition-all text-center space-y-4 group"
                >
                  <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center text-red-500 mx-auto group-hover:scale-110 transition-transform">
                    <Heart size={32} className="fill-red-500" />
                  </div>
                  <div>
                     <p className="text-xl font-black text-black dark:text-white">+{pack.count} {pack.count === 1 ? 'Life' : 'Lives'}</p>
                     {pack.label && <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">{pack.label}</p>}
                  </div>
                  <div className="flex items-center justify-center gap-2 py-3 bg-black/5 dark:bg-white/10 rounded-xl text-black dark:text-white font-black text-xs">
                     <Coins size={14} className="text-primary italic" />
                     {pack.cost}
                  </div>
                </motion.button>
              ))}
            </div>
          </section>
        )}

        {/* Coin Converter Section */}
        <section className="space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#32befa] px-2 flex items-center gap-1.5">
            <RefreshCw size={13} className="animate-spin" style={{ animationDuration: '6s' }} />
            <span>{language === 'hi' ? 'कॉइन वॉलेट कनवर्टर (Exchange)' : 'Premium Currency Exchange'}</span>
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {/* Convert Rahee to Quiz */}
             <div className="p-6 bg-black/5 dark:bg-white/5 rounded-3xl border border-black/5 dark:border-white/5 space-y-4 text-left">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 bg-[#32befa]/10 rounded-xl flex items-center justify-center text-[#32befa]">
                      <Coins size={20} />
                   </div>
                   <div>
                      <h4 className="font-extrabold text-[13px] uppercase tracking-wide text-neutral-800 dark:text-neutral-100">{language === 'hi' ? 'राही कॉइन ➔ क्विज़ कॉइन' : 'Rahee Coins ➔ Quiz Coins'}</h4>
                      <p className="text-[9px] text-neutral-400 font-bold uppercase tracking-widest">Rate: 1 Rahee = 100 Quiz</p>
                   </div>
                </div>
                
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase text-black/40 dark:text-white/40">{language === 'hi' ? 'राशि दर्ज करें:' : 'Amount to Convert:'}</label>
                   <div className="flex items-center gap-2">
                      <input 
                        type="number"
                        min="1"
                        placeholder="0"
                        value={raheeToQuizAmt || ''}
                        onChange={e => {
                           const val = Math.max(0, parseInt(e.target.value) || 0);
                           setRaheeToQuizAmt(val);
                        }}
                        className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-3 rounded-xl font-bold text-sm outline-none focus:border-[#32befa] text-neutral-900 dark:text-white"
                      />
                      <button 
                        onClick={() => {
                           setRaheeToQuizAmt(currentUser?.raheeCoins || 0);
                        }}
                        className="px-3 py-2 bg-[#32befa]/10 hover:bg-[#32befa]/20 text-[#32befa] text-[9px] font-black uppercase tracking-wider rounded-lg transition-all"
                      >
                         {language === 'hi' ? 'मैक्स' : 'Max'}
                      </button>
                   </div>
                </div>

                <div className="p-3 bg-neutral-150 dark:bg-white/5 rounded-2xl flex items-center justify-between">
                   <span className="text-[10px] font-bold text-neutral-400 uppercase">{language === 'hi' ? 'आपको मिलेगा:' : 'You will receive:'}</span>
                   <span className="text-sm font-black text-yellow-500 flex items-center gap-1">
                      <Coins size={14} className="animate-pulse" />
                      {raheeToQuizAmt * 100} Quiz
                   </span>
                </div>

                <button 
                  disabled={raheeToQuizAmt <= 0 || (currentUser?.raheeCoins || 0) < raheeToQuizAmt}
                  onClick={convertRaheeToQuiz}
                  className={cn(
                    "w-full py-3 hover:scale-[1.02] active:scale-[0.98] disabled:scale-100 font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer shadow-md rounded-2xl",
                    (layoutTheme === 'glass' || layoutTheme === 'rahee-edition')
                      ? "bg-white/10 hover:bg-white/20 text-white border border-white/20"
                      : "bg-[#32befa] text-black disabled:opacity-50"
                  )}
                >
                   {language === 'hi' ? 'क्विज़ कॉइन में बदलें' : 'Exchange to Quiz Coins'}
                </button>
             </div>

             {/* Convert Quiz to Rahee */}
             <div className="p-6 bg-black/5 dark:bg-white/5 rounded-3xl border border-black/5 dark:border-white/5 space-y-4 text-left">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 bg-yellow-500/10 rounded-xl flex items-center justify-center text-yellow-500">
                      <Coins size={20} />
                   </div>
                   <div>
                      <h4 className="font-extrabold text-[13px] uppercase tracking-wide text-neutral-800 dark:text-neutral-100">{language === 'hi' ? 'क्विज़ कॉइन ➔ राही कॉइन' : 'Quiz Coins ➔ Rahee Coins'}</h4>
                      <p className="text-[9px] text-neutral-400 font-bold uppercase tracking-widest">Rate: 100 Quiz = 1 Rahee</p>
                   </div>
                </div>

                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase text-black/40 dark:text-white/40">{language === 'hi' ? 'राशि दर्ज करें (100 के गुणक):' : 'Amount to Convert (Min 100):'}</label>
                   <div className="flex items-center gap-2">
                      <input 
                        type="number"
                        min="100"
                        step="100"
                        placeholder="0"
                        value={quizToRaheeAmt || ''}
                        onChange={e => {
                           const val = Math.max(0, parseInt(e.target.value) || 0);
                           setQuizToRaheeAmt(val);
                        }}
                        className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-3 rounded-xl font-bold text-sm outline-none focus:border-yellow-500 text-neutral-900 dark:text-white"
                      />
                      <button 
                        onClick={() => {
                           const maxQuiz = currentUser?.quizCoins || 0;
                           setQuizToRaheeAmt(maxQuiz - (maxQuiz % 100)); // multiple of 100
                        }}
                        className="px-3 py-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all"
                      >
                         {language === 'hi' ? 'मैक्स' : 'Max'}
                      </button>
                   </div>
                </div>

                <div className="p-3 bg-neutral-150 dark:bg-white/5 rounded-2xl flex items-center justify-between">
                   <span className="text-[10px] font-bold text-neutral-400 uppercase">{language === 'hi' ? 'आपको मिलेगा:' : 'You will receive:'}</span>
                   <span className="text-sm font-black text-[#32befa] flex items-center gap-1">
                      <Coins size={14} />
                      {Math.floor(quizToRaheeAmt / 100)} Rahee
                   </span>
                </div>

                <button 
                  disabled={quizToRaheeAmt < 100 || (currentUser?.quizCoins || 0) < quizToRaheeAmt}
                  onClick={convertQuizToRahee}
                  className={cn(
                    "w-full py-3 hover:scale-[1.02] active:scale-[0.98] disabled:scale-100 font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer shadow-md rounded-2xl",
                    (layoutTheme === 'glass' || layoutTheme === 'rahee-edition')
                      ? "bg-white/10 hover:bg-white/20 text-white border border-white/20"
                      : "bg-yellow-500 text-black disabled:opacity-50"
                  )}
                >
                   {language === 'hi' ? 'राही कॉइन में बदलें' : 'Exchange to Rahee Coins'}
                </button>
             </div>
          </div>
        </section>

        {/* Coupons Section */}
        <section className="space-y-4">
           <p className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 px-2">Coupon Redemption</p>
           <div className="p-8 bg-black/5 dark:bg-white/5 rounded-3xl border border-black/5 dark:border-white/5 flex flex-col items-center gap-6">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                 <Ticket size={32} />
              </div>
              <div className="text-center space-y-1">
                 <h3 className="text-lg font-black text-black dark:text-white uppercase tracking-tight">Redeem Coupon Code</h3>
                 <p className="text-xs text-black/40 dark:text-white/40 font-medium">Enter your special code to win Rahee Coins instantly.</p>
              </div>
              <div className="w-full flex flex-col sm:flex-row gap-2">
                 <input 
                   type="text"
                   placeholder="Enter code here..."
                   value={couponCode}
                   onChange={e => setCouponCode(e.target.value)}
                   className="flex-1 bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-black text-center sm:text-left outline-none focus:border-primary transition-all uppercase placeholder:normal-case placeholder:font-bold"
                 />
                 <button 
                   onClick={redeemCoupon}
                   disabled={isRedeeming || !couponCode.trim()}
                   className={cn(
                     (layoutTheme === 'glass' || layoutTheme === 'rahee-edition')
                       ? "px-8 py-4 bg-white/10 hover:bg-white/20 text-white border border-white/20 hover:border-white/30 hover:scale-105 active:scale-95 cursor-pointer rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg"
                       : "px-8 py-4 bg-primary text-black rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2",
                     (isRedeeming || !couponCode.trim()) && "opacity-50 cursor-not-allowed scale-100"
                   )}
                 >
                    {isRedeeming ? (
                       <Loader2 size={16} className="animate-spin" />
                    ) : (
                       <Zap size={16} />
                    )}
                    Redeem Code
                 </button>
              </div>
           </div>
        </section>
      </div>
    </div>
  );
}
