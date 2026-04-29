import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Send, User, MessageSquare, AlertCircle } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { db } from '../firebase/config';
import { ref, onValue, push, set } from 'firebase/database';
import { cn } from '../lib/utils';

export default function Chat({ onClose }: { onClose: () => void }) {
  const { currentUser } = useUser();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (!currentUser) return;

    const feedbackRef = ref(db, 'feedback');
    onValue(feedbackRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const allMessages = Object.values(data);
        const filteredMessages = currentUser.role === 'admin' 
          ? allMessages 
          : allMessages.filter((m: any) => m.userId === currentUser.id);
        
        setMessages(filteredMessages.sort((a: any, b: any) => a.timestamp - b.timestamp));
      } else {
        setMessages([]);
      }
    });
  }, [currentUser]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !currentUser) return;

    const fRef = push(ref(db, 'feedback'));
    await set(fRef, {
      id: fRef.key,
      userId: currentUser.id,
      userName: currentUser.name,
      comment: input,
      rating: 5,
      timestamp: Date.now()
    });
    setInput('');
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      <div className="p-6 border-b border-white/5 flex items-center justify-between bg-[#111]">
         <div className="flex items-center gap-3">
            <div className="p-2 bg-[#32befa]/20 text-[#32befa] rounded-xl"><MessageSquare size={20} /></div>
            <h3 className="font-black">FEEDBACK HUB</h3>
         </div>
         <button onClick={onClose} className="p-2 bg-white/5 rounded-full text-white/40"><X size={20} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
         <div className="bg-[#32befa]/10 border border-[#32befa]/20 p-4 rounded-2xl mb-8 flex items-start gap-4">
            <AlertCircle size={20} className="text-[#32befa] shrink-0 mt-1" />
            <p className="text-xs text-white/60 leading-relaxed font-medium">
               Use this space to send feedback or report queston corrections directly to <span className="text-[#32befa] font-bold">Rahee</span>.
            </p>
         </div>

         {messages.map((m: any) => (
           <div 
             key={m.id} 
             className={cn(
               "max-w-[80%] p-4 rounded-2xl relative",
               m.userId === currentUser?.id ? "bg-[#32befa] text-black ml-auto rounded-tr-none" : "bg-white/5 text-white mr-auto rounded-tl-none border border-white/5"
             )}
           >
              <p className={cn("text-[9px] font-black uppercase mb-1", m.userId === currentUser?.id ? "text-black/40" : "text-[#32befa]")}>
                {m.userName}
              </p>
              <p className="text-sm font-bold">{m.comment}</p>
           </div>
         ))}
      </div>

      <form onSubmit={sendMessage} className="p-6 bg-[#111] border-t border-white/5 flex gap-3">
         <input 
           type="text" 
           value={input}
           onChange={(e) => setInput(e.target.value)}
           placeholder="Report an issue or correction..."
           className="flex-1 bg-black border border-white/10 rounded-2xl px-5 h-14 outline-none focus:border-[#32befa] transition-all text-sm font-bold"
         />
         <button type="submit" className="w-14 h-14 bg-[#32befa] text-black rounded-2xl flex items-center justify-center shadow-[0_4px_20px_rgba(50,190,250,0.3)] active:scale-95 transition-all">
            <Send size={24} />
         </button>
      </form>
    </div>
  );
}
