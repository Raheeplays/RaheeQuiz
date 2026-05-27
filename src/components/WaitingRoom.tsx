import React from 'react';
import { motion } from 'motion/react';
import { Clock, ShieldCheck, LogOut } from 'lucide-react';
import { useUser } from '../contexts/UserContext';

export default function WaitingRoom() {
  const { logout } = useUser();

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md bg-[#111] p-8 rounded-3xl border border-white/5 text-center"
      >
        <div className="w-20 h-20 bg-[#32befa]/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <Clock className="text-[#32befa]" size={40} />
        </div>
        <h2 className="text-2xl font-bold mb-4">Approval Pending</h2>
        <p className="text-white/60 mb-8 leading-relaxed">
          Your account has been created successfully! Please wait for <span className="text-[#32befa] font-bold">Rahee</span> to approve your request.
        </p>
        
        <div className="space-y-4">
          <button
            onClick={() => logout()}
            className="w-full bg-white/5 text-white/60 p-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-white/10 transition-all font-medium"
          >
            <LogOut size={18} />
            Check later (Logout)
          </button>
        </div>
        
        <div className="mt-8 flex items-center justify-center gap-2 text-white/30 text-xs">
          <ShieldCheck size={14} />
          Securely handled by Rahee Quiz
        </div>
      </motion.div>
    </div>
  );
}
